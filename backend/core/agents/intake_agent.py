"""
IntakeAgent — ADM_2.0_BUILD_SPEC.md §3.1

Slot-filling subgraph that runs BEFORE any stage-owner agent.
Collects missing fields and produces a typed ProjectContext.

Required slots:
  source_ref.source_type     — "file" | "db"
  source_ref.blob_uris       — if source_type = file
  source_ref.connection_id   — if source_type = db
  target_dialect             — "snowflake" | "postgres" | "bigquery" | "sqlserver"
  modeling_style             — "kimball" | "data_vault" | "3nf" | "one_big_table"
  layer                      — "foundation" | "product"

Inferred from prompt (never asked unless ambiguous):
  modeling_style             — inferred from /slash or keyword detection
  layer                      — inferred from project layer field
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from core.agents.base_agent import AgentState, llm_call, tool_emit_trace, tool_query_mongo
from core.agents.project_context import ProjectContext, SourceRef
from core.runtime_settings import resolve_llm_runtime

SYSTEM_PROMPT = """You are the IntakeAgent in ADM Agent Studio 2.0.
Your only job is to collect the minimum required inputs to start a data modeling pipeline.

You must determine (never hallucinate — only extract from what the user said):
1. source_type: "file" (uploaded files) or "db" (live database connection)
2. blob_uris OR connection_id: actual file refs or DB connection ID
3. target_dialect: the physical DDL target (snowflake/postgres/bigquery/sqlserver)
4. modeling_style: kimball/data_vault/3nf/one_big_table
5. layer: foundation/product

If any required field is missing, list it in missing_inputs.
If all are collected, set intake_complete=true.

Return JSON only:
{
  "source_type": "file" | "db" | null,
  "blob_uris": ["..."],
  "connection_id": null,
  "selected_tables": [],
  "target_dialect": "snowflake" | "postgres" | "bigquery" | "sqlserver" | null,
  "modeling_style": "kimball" | "data_vault" | "3nf" | "one_big_table" | null,
  "layer": "foundation" | "product" | null,
  "intake_complete": false,
  "missing_inputs": ["target_dialect", "source_ref"],
  "clarification_question": "I need to know your target database platform. Are you modeling for Snowflake, PostgreSQL, BigQuery, or SQL Server?"
}

Do not ask for modeling_style if the user used a /slash command — infer from it.
Do not ask for layer if the project already has a layer configured.
"""

# Keyword → modeling style map (mirrors orchestrator.py SLASH_MAP)
_STYLE_MAP = {
    "dimensional": "kimball", "kimball": "kimball", "star schema": "kimball",
    "data vault": "data_vault", "datavault": "data_vault",
    "3nf": "3nf", "normalized": "3nf", "normalised": "3nf",
    "one big table": "one_big_table", "obt": "one_big_table",
}


def _infer_modeling_style(prompt: str) -> Optional[str]:
    p = prompt.lower()
    for keyword, style in _STYLE_MAP.items():
        if keyword in p:
            return style
    return None


async def run_intake_agent(
    session_id: str,
    project_id: str,
    user_prompt: str,
    db,
    existing_context: Optional[Dict[str, Any]] = None,
    trace_id: str = "",
) -> Dict[str, Any]:
    """
    Run the IntakeAgent slot-filling loop for a session.
    Returns a dict that can be deserialized into ProjectContext.
    """
    await tool_emit_trace(session_id, "started", {"agent": "IntakeAgent"}, trace_id)

    # Load project to get pre-configured fields
    project = {}
    if db and project_id:
        from bson import ObjectId
        try:
            project = await db["projects"].find_one({"_id": ObjectId(project_id)}) or {}
        except Exception:
            pass

    # Load existing project files (blobs)
    blob_uris: List[str] = []
    if db and project_id:
        files = await tool_query_mongo("project_files", {"project_id": project_id}, db, limit=50)
        for f in files:
            uri = f.get("blob_uri") or f.get("file_path") or f.get("filename", "")
            if uri:
                blob_uris.append(uri)

    # Build pre-filled context from project
    pre_filled: Dict[str, Any] = {
        "source_type": "file" if blob_uris else None,
        "blob_uris": blob_uris,
        "connection_id": None,
        "selected_tables": [],
        "target_dialect": project.get("target_dialect"),
        "modeling_style": _infer_modeling_style(user_prompt),
        "layer": project.get("layer", "foundation"),
    }
    # Merge with existing_context if provided
    if existing_context:
        for k, v in existing_context.items():
            if v is not None:
                pre_filled[k] = v

    # Run LLM slot-filling only if fields are still missing
    missing = [k for k in ["source_type", "target_dialect", "modeling_style"] if not pre_filled.get(k)]
    if not missing:
        # All required slots filled — skip LLM call
        ctx = ProjectContext(
            session_id=session_id,
            project_id=project_id,
            trace_id=trace_id,
            source_ref=SourceRef(
                source_type=pre_filled["source_type"],
                blob_uris=pre_filled.get("blob_uris", []),
                connection_id=pre_filled.get("connection_id"),
                selected_tables=pre_filled.get("selected_tables", []),
            ),
            target_dialect=pre_filled["target_dialect"],
            modeling_style=pre_filled["modeling_style"],
            layer=pre_filled.get("layer", "foundation"),
            user_instruction=user_prompt,
            intake_complete=True,
            missing_inputs=[],
        )
        await tool_emit_trace(session_id, "completed", {"agent": "IntakeAgent", "intake_complete": True}, trace_id)
        return ctx.model_dump()

    # LLM slot-filling
    runtime = resolve_llm_runtime(None)
    user_content = (
        f"User message: {user_prompt}\n\n"
        f"Pre-filled context: {json.dumps(pre_filled)}\n\n"
        f"Missing inputs: {missing}\n\n"
        "Extract any of the missing inputs from the user message. Ask for any that remain unknown."
    )
    try:
        raw = await llm_call(runtime, SYSTEM_PROMPT, user_content, response_format="json")
        llm_result = json.loads(raw)
    except Exception:
        llm_result = {}

    # Merge LLM result into pre-filled
    for k in ["source_type", "blob_uris", "connection_id", "selected_tables", "target_dialect", "modeling_style", "layer"]:
        v = llm_result.get(k)
        if v is not None and v != [] and v != "":
            pre_filled[k] = v

    intake_complete = bool(llm_result.get("intake_complete", False)) or not [k for k in ["source_type", "target_dialect", "modeling_style"] if not pre_filled.get(k)]

    ctx = ProjectContext(
        session_id=session_id,
        project_id=project_id,
        trace_id=trace_id,
        source_ref=SourceRef(
            source_type=pre_filled.get("source_type") or "file",
            blob_uris=pre_filled.get("blob_uris", []),
            connection_id=pre_filled.get("connection_id"),
            selected_tables=pre_filled.get("selected_tables", []),
        ),
        target_dialect=pre_filled.get("target_dialect") or "snowflake",
        modeling_style=pre_filled.get("modeling_style") or "kimball",
        layer=pre_filled.get("layer") or "foundation",
        user_instruction=user_prompt,
        intake_complete=intake_complete,
        missing_inputs=llm_result.get("missing_inputs", missing),
    )

    await tool_emit_trace(session_id, "output", {
        "agent": "IntakeAgent",
        "intake_complete": intake_complete,
        "missing_inputs": ctx.missing_inputs,
        "clarification_question": llm_result.get("clarification_question"),
    }, trace_id)

    return {**ctx.model_dump(), "clarification_question": llm_result.get("clarification_question")}
