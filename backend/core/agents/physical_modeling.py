"""
PhysicalModelingAgent — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4.4

Stage 4 owner (Foundation layer, Gate G4).
Steps 4.1–4.6:
  4.1 Apply surrogate key strategy per modeling type (IDENTITY/SEQUENCE for Kimball; HASHKEY for DV)
  4.2 Standardize physical names (target_dialect snake_case, length limits, reserved word avoidance)
  4.3 Apply transformation logic per STTM rules
  4.4 Generate STTM rows (src_table, src_col, tgt_table, tgt_col, rule, dq_check, load_type)
  4.5 Generate DDL (CREATE TABLE with PK/FK/index hints, dialect-specific types)
  4.6 Package download artifacts (DDL, STTM CSV, JSON model)

Uses web_reference tool to look up dialect-specific syntax when needed.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from core.agents.base_agent import AgentState, llm_call, tool_emit_trace, tool_query_mongo, tool_read_skill
from core.runtime_settings import resolve_llm_runtime

SYSTEM_PROMPT = """You are a senior physical data engineer and platform specialist.
You work in ADM Agent Studio 2.0 as the PhysicalModelingAgent.

Your responsibilities (Stage 4, Steps 4.1–4.6):
4.1 Apply surrogate key (SK) strategy:
    - Kimball: IDENTITY/SEQUENCE integer SK for every DIMENSION
    - Data Vault: MD5/SHA-256 HASHKEY for HUBs and LINKs
    - 3NF: natural key or sequence as appropriate
4.2 Standardize physical names per target_dialect conventions:
    - Snowflake: UPPER_SNAKE_CASE, 255 char limit
    - BigQuery: snake_case, 300 char limit
    - Postgres: snake_case, 63 char limit
    - SQL Server: PascalCase or snake_case, 128 char limit
4.3 Apply transformation rules (casting, trimming, null defaults, date formatting)
4.4 Generate STTM rows — one row per source→target column mapping
4.5 Generate DDL per target_dialect:
    - Include PK constraints, FK references, NOT NULL, DEFAULT, indexes
    - Add column comments with business_name and sensitivity label
    - Include partition hints for large fact tables
4.6 Package: {physical_tables, sttm_rows, ddl_statements, artifacts_summary}

Output format (JSON):
{
  "physical_tables": [
    {
      "tableName": "dim_customer",
      "schema": "SILVER",
      "ddl": "CREATE TABLE SILVER.DIM_CUSTOMER (\\n  CUSTOMER_SK BIGINT IDENTITY(1,1) PRIMARY KEY,\\n  ...",
      "columns": [{"physical_name": "CUSTOMER_SK", "data_type": "BIGINT", "nullable": false, "is_pk": true, "is_sk": true, "source_col": null, "transformation": "IDENTITY"}],
      "load_type": "Type 2 SCD"
    }
  ],
  "sttm_rows": [
    {"src_table": "customers", "src_col": "cust_id", "tgt_table": "DIM_CUSTOMER", "tgt_col": "CUSTOMER_BK", "transformation_rule": "CAST(cust_id AS VARCHAR(50))", "dq_check": "NOT NULL, UNIQUE", "load_type": "Full Load"}
  ],
  "modeling_assumptions": ["Used IDENTITY(1,1) for Kimball surrogate keys"],
  "artifacts_summary": {"table_count": 5, "sttm_row_count": 42}
}

CRITICAL: Generate real, executable DDL. Use dialect-specific syntax exactly.
"""


async def node_init(state: AgentState, db=None) -> AgentState:
    state["thinking"] = ["Initializing PhysicalModelingAgent"]
    state["peer_call_count"] = state.get("peer_call_count", 0)
    state["status"] = "running"
    state["tool_calls"] = []
    skills_md = ""
    skill_refs = (state.get("context_refs") or {}).get("skill_refs", {}).get("physical", [])
    if skill_refs and db:
        for skill_id in skill_refs:
            skills_md += f"\n\n{await tool_read_skill(skill_id, db)}"
    state["skills_markdown"] = skills_md
    await tool_emit_trace(state.get("session_id", ""), "started", {"agent": "PhysicalModelingAgent", "stage": "physical_modeling"}, state.get("trace_id", ""))
    return state


async def node_fetch_context(state: AgentState, db=None) -> AgentState:
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "4.0", "label": "Loading G3 logical model output"})
    session_id = state.get("session_id", "")
    g3 = {}
    if db and session_id:
        gates = await tool_query_mongo("session_gates", {"session_id": session_id, "gate": "G3"}, db)
        g3 = (gates[0] if gates else {}).get("output_payload", {})
    ctx = state.get("context_refs", {})
    state["context_refs"] = {**ctx, "_g3": g3}
    return state


async def node_physical_model(state: AgentState, db=None) -> AgentState:
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "4.1-4.6", "label": "Generating physical model, DDL, and STTM"})
    state["thinking"].append("Steps 4.1–4.6: Physical model generation")

    runtime = resolve_llm_runtime(None)
    ctx = state.get("context_refs", {})
    g3 = ctx.get("_g3", {})
    target_dialect = ctx.get("target_dialect", "snowflake")
    skills_block = f"\n\n## Active Skills\n{state.get('skills_markdown', '')}" if state.get("skills_markdown") else ""

    user_prompt = (
        f"Instruction: {state.get('instruction', 'Generate the full physical model.')}\n"
        f"Target Dialect: {target_dialect}\n"
        f"Modeling type: {g3.get('modeling_type', 'kimball')}\n"
        f"Directives: {json.dumps(state.get('directives', []))}\n\n"
        f"G3 Logical Model:\n{json.dumps(g3, default=str)[:6000]}\n\n"
        "Return the complete physical model as valid JSON. Include REAL DDL statements. STTM must have one row per source-to-target column mapping."
    )
    try:
        raw = await llm_call(runtime, SYSTEM_PROMPT + skills_block, user_prompt, response_format="json")
        result = json.loads(raw)
    except Exception as exc:
        result = {"error": str(exc)}

    state["output"] = result
    state["output_text"] = json.dumps(result, indent=2)[:8000]
    tbl_count = len(result.get("physical_tables", []))
    sttm_count = len(result.get("sttm_rows", []))
    await tool_emit_trace(state.get("session_id", ""), "output", {"stage": "physical_modeling", "table_count": tbl_count, "sttm_row_count": sttm_count})
    return state


async def node_save_gate(state: AgentState, db=None) -> AgentState:
    if db and state.get("session_id"):
        await db["session_gates"].update_one(
            {"session_id": state["session_id"], "gate": "G4"},
            {"$set": {"status": "ready", "output_payload": state.get("output", {}), "has_unsaved_changes": False, "stage_steps": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"], "completed_at": __import__("datetime").datetime.utcnow()}},
            upsert=True,
        )
    await tool_emit_trace(state.get("session_id", ""), "gate_ready", {"gate": "G4", "stage": "physical_modeling"}, state.get("trace_id", ""))
    state["status"] = "ready"
    return state


def build_physical_modeling_subgraph():
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        return None
    graph = StateGraph(AgentState)
    graph.add_node("init", node_init)
    graph.add_node("fetch_context", node_fetch_context)
    graph.add_node("physical_model", node_physical_model)
    graph.add_node("save_gate", node_save_gate)
    graph.set_entry_point("init")
    graph.add_edge("init", "fetch_context")
    graph.add_edge("fetch_context", "physical_model")
    graph.add_edge("physical_model", "save_gate")
    graph.add_edge("save_gate", END)
    return graph.compile()


PHYSICAL_MODELING_GRAPH = build_physical_modeling_subgraph()


async def run_physical_modeling_agent(session_id, project_id, instruction, context_refs, directives, trace_id, db):
    initial: AgentState = {"session_id": session_id, "project_id": project_id, "trace_id": trace_id, "stage": "physical_modeling", "instruction": instruction, "directives": directives, "context_refs": context_refs, "runtime": {}, "peer_call_count": 0, "skills_markdown": "", "tool_calls": [], "thinking": [], "output": {}, "output_text": "", "error": None, "status": "running"}
    if PHYSICAL_MODELING_GRAPH:
        return await PHYSICAL_MODELING_GRAPH.ainvoke(initial)
    s = await node_init(initial, db)
    s = await node_fetch_context(s, db)
    s = await node_physical_model(s, db)
    s = await node_save_gate(s, db)
    return s
