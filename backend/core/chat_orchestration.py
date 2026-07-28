"""LangGraph supervisor orchestration for the chat-first modeling studio."""

from __future__ import annotations

import json
from datetime import datetime
from urllib.parse import urlparse
from typing import Any, TypedDict
from uuid import uuid4

import httpx
from fastapi import HTTPException
from bson import ObjectId
import asyncio
from httpx import AsyncClient

from core.runtime_settings import resolve_llm_runtime
from core.memory import extract_and_store_memory, get_project_memories

try:
    from langgraph.graph import END, StateGraph
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False

from core.agents.source_intelligence import run_source_intelligence_agent
from core.agents.conceptual_modeling import run_conceptual_modeling_agent
from core.agents.logical_modeling import run_logical_modeling_agent
from core.agents.physical_modeling import run_physical_modeling_agent


STAGE_AGENTS = {
    "1-source-analysis": ("Source Analysis Agent", "Profile supplied sources, ask only for missing source scope, and return a data dictionary, quality observations, relationships, and sensitive-data findings."),
    "2-conceptual": ("Conceptual Modeling Agent", "Define business concepts, candidate relationships, cardinalities, and assumptions from approved source analysis."),
    "3-logical": ("Logical Modeling Agent", "Create normalized logical entities, attributes, PK/FK relationships, and validation assumptions."),
    "4-physical-sttm": ("Physical Data Modeling Agent", "Create target-dialect physical design guidance, DDL-ready structures, and source-to-target mappings."),
}

STAGE_DISPATCH = {
    "1-source-analysis": run_source_intelligence_agent,
    "2-conceptual": run_conceptual_modeling_agent,
    "3-logical": run_logical_modeling_agent,
    "4-physical-sttm": run_physical_modeling_agent,
}


def _resolve_agent_for_stage(stage: str) -> tuple[str, str]:
    name, instruction = STAGE_AGENTS.get(stage, STAGE_AGENTS["1-source-analysis"])
    return name, instruction


class ModelingState(TypedDict, total=False):
    runtime: dict
    stage: str
    agent_name: str
    agent_instruction: str
    user_prompt: str
    project_context: dict
    skills_markdown: str
    master_brief: str
    output: str
    response_mode: str
    intake_required: bool
    db: Any  # Motor async DB handle — injected at runtime


async def _chat_completion(runtime: dict, system_prompt: str, user_prompt: str) -> str:
    if not runtime.get("api_key"):
        raise HTTPException(status_code=503, detail="Platform LLM key is not configured. Set LLM_API_KEY in the backend environment, or choose an override provider in Settings.")
    base_url = (runtime.get("base_url") or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=503, detail="Platform LLM base URL is not configured. Set LLM_BASE_URL in the backend environment.")
    headers = {"Authorization": f"Bearer {runtime['api_key']}", "Content-Type": "application/json"}
    body = {"model": runtime["default_model"], "temperature": 0.2, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{base_url}/chat/completions", headers=headers, json=body)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        provider = urlparse(base_url).netloc or "configured provider"
        if exc.response.status_code == 401:
            raise HTTPException(status_code=503, detail=f"LLM authentication failed at {provider}. Replace the backend LLM_API_KEY; Platform mode does not use a UI key.") from exc
        if exc.response.status_code == 404:
            raise HTTPException(status_code=503, detail=f"LLM endpoint or model is unavailable at {provider}. Check LLM_BASE_URL and LLM_MODEL in backend .env.") from exc
        raise HTTPException(status_code=502, detail=f"Configured LLM provider rejected the request at {provider}: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to reach the configured LLM provider: {exc}") from exc
    try:
        return str(payload["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Configured LLM provider returned an unsupported completion response.") from exc


async def _supervisor_node(state: ModelingState) -> dict:
    prompt = (
        "You are the SilverCraft master orchestrator. First decide whether the user is making a general conversational request "
        "or requesting data-modeling work. Return JSON only with these keys: mode (chat or delegate), response (the direct answer for chat "
        "or the specialist brief for delegate), and missing_inputs (an array). Delegate only when a specialist must create or revise a modeling "
        "artifact. Preserve user intent, use supplied skills, and identify material assumptions for HITL.\n"
        f"Stage: {state['stage']}\nSpecialist: {state['agent_name']}\nProject context: {state['project_context']}\n"
        f"Skills:\n{state['skills_markdown'] or 'No additional skill selected.'}\n\nUser request:\n{state['user_prompt']}"
    )
    raw = await _chat_completion(state["runtime"], "Return valid JSON only; no Markdown fence.", prompt)
    try:
        decision = json.loads(raw)
        mode = "chat" if str(decision.get("mode", "")).lower() == "chat" else "delegate"
        response = str(decision.get("response", "")).strip()
        if response:
            missing = decision.get("missing_inputs") or []
            suffix = f"\n\nMissing inputs: {', '.join(map(str, missing))}." if mode == "delegate" and missing else ""
            return {"master_brief": response + suffix, "response_mode": mode}
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        logger.debug("Supervisor returned non-JSON, falling back to text parse", extra={"error": str(exc)})
    # Compatibility fallback for OpenAI-compatible gateways that do not honor JSON mode.
    mode = "chat" if raw.lstrip().upper().startswith("CHAT:") else "delegate"
    return {"master_brief": raw.replace("CHAT:", "", 1).replace("DELEGATE:", "", 1).strip(), "response_mode": mode}


async def _intake_node(state: ModelingState) -> dict:
    """Ask for a source before Stage 1, rather than producing an empty analysis artifact."""
    if state["stage"] != "1-source-analysis":
        return {"intake_required": False}
    context = state.get("project_context") or {}
    has_source = bool(context.get("attachments") or context.get("source_connection") or context.get("source_tables") or context.get("artifacts"))
    prompt = state.get("user_prompt", "").lower()
    modeling_intent = any(term in prompt for term in ("model", "profile", "analy", "source", "table", "schema", "database", "file"))
    if modeling_intent and not has_source:
        return {
            "intake_required": True,
            "response_mode": "chat",
            "master_brief": "Before Source Analysis, choose how to provide the source: **Upload files** or **Connect a database**. Then share the table scope or files you want ADM to analyse.",
        }
    return {"intake_required": False}


async def _specialist_node(state: ModelingState) -> dict:
    """Dispatch to the real stage-owner agent subgraph instead of a single LLM call."""
    db = state.get("db")
    stage = state.get("stage", "1-source-analysis")
    agent_name, _ = _resolve_agent_for_stage(stage)
    project_context = state.get("project_context") or {}

    context_refs = {
        "target_dialect": project_context.get("target_dialect", "snowflake"),
        "modeling_style": project_context.get("modeling_style", "kimball"),
        "skill_refs": {
            "source_analysis": state.get("source_analysis_skills", []),
            "conceptual": state.get("conceptual_skills", []),
            "logical": state.get("logical_skills", []),
            "physical": state.get("physical_skills", []),
        },
        "source_file_ids": project_context.get("source_file_ids", []),
    }

    runner = STAGE_DISPATCH.get(stage)
    if runner is None:
        return {"output": json.dumps({"error": f"No agent registered for stage {stage}"}), "response_mode": "chat"}

    try:
        result = await runner(
            session_id=project_context.get("session_id", ""),
            project_id=project_context.get("project_id", ""),
            instruction=state.get("user_prompt", ""),
            context_refs=context_refs,
            directives=project_context.get("directives", []),
            trace_id=project_context.get("trace_id", ""),
            db=db,
        )
        output = result.get("output") or result.get("output_text") or json.dumps(result)
        if isinstance(output, dict):
            output = json.dumps(output)
        return {"output": output, "response_mode": "delegate"}
    except Exception as exc:
        return {"output": json.dumps({"error": str(exc)}), "response_mode": "chat", "error": str(exc)}


async def _chat_node(state: ModelingState) -> dict:
    return {"output": state["master_brief"].strip()}


def _route_after_supervisor(state: ModelingState) -> str:
    return "chat" if state.get("response_mode") == "chat" else "specialist"


def _route_after_intake(state: ModelingState) -> str:
    return "chat" if state.get("intake_required") else "supervisor"


def _build_graph():
    if not LANGGRAPH_AVAILABLE:
        return None
    graph = StateGraph(ModelingState)
    graph.add_node("intake", _intake_node)
    graph.add_node("supervisor", _supervisor_node)
    graph.add_node("specialist", _specialist_node)
    graph.add_node("chat", _chat_node)
    graph.set_entry_point("intake")
    graph.add_conditional_edges("intake", _route_after_intake, {"chat": "chat", "supervisor": "supervisor"})
    graph.add_conditional_edges("supervisor", _route_after_supervisor, {"chat": "chat", "specialist": "specialist"})
    graph.add_edge("chat", END)
    graph.add_edge("specialist", END)
    return graph.compile()


MODELING_GRAPH = _build_graph()


async def _resolve_skill_markdown(db, user_id: str, names: list[str]) -> str:
    selected = [name.lstrip("/") for name in names if name]
    if not selected:
        return ""
    cursor = db["skills"].find({"name": {"$in": selected}, "$or": [{"created_by": None}, {"created_by": user_id}]}, {"name": 1, "description": 1, "content": 1})
    skills = await cursor.to_list(length=100)
    return "\n\n".join(f"# {item['name']}\n{item.get('description', '')}\n{item.get('content', '')}" for item in skills)


async def _resolve_source_context(db, project_id: str | None, source_file_ids: list[str]) -> dict[str, Any]:
    """Resolve upload references server-side; agents receive summaries, not raw browser state."""
    object_ids = []
    for file_id in source_file_ids:
        try:
            object_ids.append(ObjectId(file_id))
        except Exception:
            continue
    if not project_id or not object_ids:
        return {"source_tables": [], "parsed_documents": []}
    rows = await db["project_files"].find({"_id": {"$in": object_ids}, "project_id": project_id}).to_list(length=50)
    documents = [{"file_id": str(row["_id"]), "filename": row.get("filename"), "parser": row.get("parsed_document", {}).get("parser"), "tables": row.get("parsed_document", {}).get("tables", []), "excerpt": row.get("parsed_document", {}).get("excerpt", "")[:12000]} for row in rows]
    return {"source_tables": [table for document in documents for table in document["tables"]], "parsed_documents": documents}


async def resolve_active_skills(db, user_id: str, skills: list[str], stage: str, project_context: dict) -> dict[str, list[str]]:
    """Resolve which skill IDs are active for each stage — never hardcode style→agent mappings."""
    stage_skill_map: dict[str, list[str]] = {
        "source_analysis": [],
        "conceptual": [],
        "logical": [],
        "physical": [],
    }
    if not skills:
        return stage_skill_map

    # Load all accessible skills
    cursor = db["skills"].find({
        "name": {"$in": [s.lstrip("/") for s in skills]},
        "$or": [{"created_by": None}, {"created_by": user_id}],
    }, {"_id": 1, "name": 1, "stage_binding": 1, "skill_kind": 1, "style_key": 1})
    skill_docs = await cursor.to_list(length=100)
    skill_by_name = {s.get("name", ""): s for s in skill_docs}

    for skill_name in skills:
        clean_name = skill_name.lstrip("/")
        doc = skill_by_name.get(clean_name)
        if not doc:
            continue
        binding = doc.get("stage_binding", "cross_cutting")
        skill_id = str(doc["_id"])
        if binding in stage_skill_map:
            stage_skill_map[binding].append(skill_id)

    # Auto-bind style skill for logical/physical stages when a style_key is set in project context
    logical_style_key = project_context.get("modeling_style_key") or project_context.get("modeling_style")
    if logical_style_key and stage in ("logical", "physical"):
        style_skill = await db["skills"].find_one({
            "stage_binding": stage,
            "skill_kind": "modeling_style",
            "style_key": logical_style_key,
            "$or": [{"created_by": None}, {"created_by": user_id}],
        }, {"_id": 1})
        if style_skill and str(style_skill["_id"]) not in stage_skill_map.get(stage, []):
            stage_skill_map[stage].append(str(style_skill["_id"]))

    return stage_skill_map


async def _generate_chat_title(runtime: dict, user_prompt: str) -> str:
    """Use the orchestrator model to title a conversation by intent, not raw text."""
    title = await _chat_completion(runtime, "Create only a concise 3-7 word chat title based on the user's intent. No quotes, punctuation, or explanation.", user_prompt)
    return " ".join(title.replace("\n", " ").strip(" .:-").split()[:7]) or "Modeling conversation"


async def run_chat_orchestration(db, user_id: str, request: dict[str, Any]) -> dict[str, Any]:
    """Run a LangGraph supervisor -> real stage-owner agent handoff and persist its A2A audit trail."""
    if not MODELING_GRAPH:
        raise HTTPException(status_code=503, detail="LangGraph is not installed. Install backend requirements before starting the API.")
    stage = request.get("current_stage") or "1-source-analysis"
    agent_name, agent_instruction = _resolve_agent_for_stage(stage)
    runtime = await resolve_llm_runtime(db, user_id)
    if request.get("model_name"):
        runtime["default_model"] = str(request.get("model_name", "")).strip()
    run_id = str(uuid4())
    skills_markdown = await _resolve_skill_markdown(db, user_id, request.get("skills") or [])
    project_context = dict(request.get("schema_context") or {})
    project_context.update(await _resolve_source_context(db, request.get("project_id"), project_context.get("source_file_ids") or []))
    project_context["session_id"] = project_context.get("session_id", request.get("chat_id", ""))
    project_context["trace_id"] = project_context.get("trace_id", run_id)

    # Phase 8: Conversation Memory Integration
    if request.get("project_id"):
        memories = await get_project_memories(request.get("project_id"))
        if memories:
            project_context["memory_entities"] = memories
        if request.get("prompt"):
            asyncio.create_task(extract_and_store_memory(request.get("project_id"), request.get("prompt"), user_id))

    # Resolve active skills per stage (ANTIGRAVITY_REFACTOR_BRIEF §2.2)
    active_skills = await resolve_active_skills(db, user_id, request.get("skills") or [], stage, project_context)

    started = datetime.utcnow()
    state = await MODELING_GRAPH.ainvoke({
        "runtime": runtime,
        "stage": stage,
        "agent_name": agent_name,
        "agent_instruction": agent_instruction,
        "user_prompt": request.get("prompt", ""),
        "project_context": project_context,
        "skills_markdown": skills_markdown,
        "db": db,
        "source_analysis_skills": active_skills.get("source_analysis", []),
        "conceptual_skills": active_skills.get("conceptual", []),
        "logical_skills": active_skills.get("logical", []),
        "physical_skills": active_skills.get("physical", []),
    })
    completed = datetime.utcnow()
    output = state.get("output", "")
    chat_title = await _generate_chat_title(runtime, request.get("prompt", "")) if request.get("generate_chat_title") else None
    if state.get("response_mode") == "chat":
        event = {"run_id": run_id, "agent_name": "master-orchestrator", "stage": stage, "framework": "langgraph", "status": "completed", "started_at": started, "completed_at": completed, "summary": str(output)[:500]}
        return {"reply": output, "stage": stage, "source": "langgraph-supervisor", "agent_events": [event], "artifact": None, "chat_title": chat_title}

    # Persist A2A audit trail — real delegation to a stage-owner agent
    await db["a2a_messages"].insert_one({"run_id": run_id, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "from_agent": "master-orchestrator", "to_agent": agent_name, "message_type": "delegation", "payload": {"stage": stage, "prompt": request.get("prompt", "")}, "created_at": started})
    await db["a2a_messages"].insert_one({"run_id": run_id, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "from_agent": agent_name, "to_agent": "master-orchestrator", "message_type": "result", "payload": {"stage": stage, "output": output}, "created_at": completed})
    supervisor_event = {"run_id": run_id, "agent_name": "master-orchestrator", "stage": stage, "framework": "langgraph", "status": "delegated", "started_at": started, "completed_at": completed, "summary": str(state.get("master_brief", ""))[:500]}
    specialist_event = {"run_id": run_id, "agent_name": agent_name, "stage": stage, "framework": "langgraph", "status": "completed", "started_at": started, "completed_at": completed, "summary": str(output)[:500]}
    if request.get("project_id") or request.get("workflow_id"):
        await db["agent_runs"].insert_one({**specialist_event, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "chat_id": request.get("chat_id"), "created_by": user_id, "master_brief": state.get("master_brief", ""), "output": output, "skills": request.get("skills") or []})
    return {"reply": output, "stage": stage, "source": "langgraph-supervisor", "agent_events": [supervisor_event, specialist_event], "artifact": {"title": agent_name, "stage": stage, "content": output, "requires_hitl": True}, "chat_title": chat_title}
