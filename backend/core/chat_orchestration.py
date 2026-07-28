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


STAGE_AGENTS = {
    "1-source-analysis": ("Source Analysis Agent", "Profile supplied sources, ask only for missing source scope, and return a data dictionary, quality observations, relationships, and sensitive-data findings."),
    "2-conceptual": ("Conceptual Modeling Agent", "Define business concepts, candidate relationships, cardinalities, and assumptions from approved source analysis."),
    "3-logical": ("Logical Modeling Agent", "Create normalized logical entities, attributes, PK/FK relationships, and validation assumptions."),
    "4-physical-sttm": ("Physical Data Modeling Agent", "Create target-dialect physical design guidance, DDL-ready structures, and source-to-target mappings."),
}


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
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
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
    instruction = (
        f"You are {state['agent_name']}. {state['agent_instruction']}\n"
        "Return valid JSON only, never Markdown. Use the stage shape: source analysis = {tables, relationships, warnings, thinking}; "
        "conceptual = {concepts, relationships, warnings, thinking}; logical = {entities, relationships, warnings, thinking}; "
        "physical = {tables, sttm, ddl, warnings, thinking}. Every table/entity must contain a name and columns/attributes when evidence exists. "
        "Never claim to inspect a file, table, or database that has not been supplied.\n\n"
        f"Master delegation brief:\n{state['master_brief']}\n\nParsed source context:\n{json.dumps(state['project_context'], default=str)[:30000]}\n\nApplicable skill Markdown:\n{state['skills_markdown']}"
    )
    return {"output": await _chat_completion(state["runtime"], instruction, state["user_prompt"])}


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


async def _generate_chat_title(runtime: dict, user_prompt: str) -> str:
    """Use the orchestrator model to title a conversation by intent, not raw text."""
    title = await _chat_completion(runtime, "Create only a concise 3-7 word chat title based on the user's intent. No quotes, punctuation, or explanation.", user_prompt)
    return " ".join(title.replace("\n", " ").strip(" .:-").split()[:7]) or "Modeling conversation"


async def run_chat_orchestration(db, user_id: str, request: dict[str, Any]) -> dict[str, Any]:
    """Run a LangGraph supervisor -> specialist handoff and persist its A2A audit trail."""
    if not MODELING_GRAPH:
        raise HTTPException(status_code=503, detail="LangGraph is not installed. Install backend requirements before starting the API.")
    stage = request.get("current_stage") or "1-source-analysis"
    agent_name, agent_instruction = STAGE_AGENTS.get(stage, STAGE_AGENTS["1-source-analysis"])
    runtime = await resolve_llm_runtime(db, user_id)
    if request.get("model_name"):
        runtime["default_model"] = str(request["model_name"]).strip()
    run_id = str(uuid4())
    skills_markdown = await _resolve_skill_markdown(db, user_id, request.get("skills") or [])
    project_context = dict(request.get("schema_context") or {})
    project_context.update(await _resolve_source_context(db, request.get("project_id"), project_context.get("source_file_ids") or []))
    
    # Phase 8: Conversation Memory Integration
    if request.get("project_id"):
        memories = await get_project_memories(request.get("project_id"))
        if memories:
            project_context["memory_entities"] = memories
        if request.get("prompt"):
            asyncio.create_task(extract_and_store_memory(request.get("project_id"), request.get("prompt"), user_id))

    started = datetime.utcnow()
    state = await MODELING_GRAPH.ainvoke({"runtime": runtime, "stage": stage, "agent_name": agent_name, "agent_instruction": agent_instruction, "user_prompt": request.get("prompt", ""), "project_context": project_context, "skills_markdown": skills_markdown})
    completed = datetime.utcnow()
    output = state["output"]
    chat_title = await _generate_chat_title(runtime, request.get("prompt", "")) if request.get("generate_chat_title") else None
    if state.get("response_mode") == "chat":
        event = {"run_id": run_id, "agent_name": "master-orchestrator", "stage": stage, "framework": "langgraph", "status": "completed", "started_at": started, "completed_at": completed, "summary": output[:500]}
        return {"reply": output, "stage": stage, "source": "langgraph-supervisor", "agent_events": [event], "artifact": None, "chat_title": chat_title}
    await db["a2a_messages"].insert_one({"run_id": run_id, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "from_agent": "master-orchestrator", "to_agent": agent_name, "message_type": "delegation", "payload": {"stage": stage, "prompt": request.get("prompt", "")}, "created_at": started})
    await db["a2a_messages"].insert_one({"run_id": run_id, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "from_agent": agent_name, "to_agent": "master-orchestrator", "message_type": "result", "payload": {"stage": stage, "output": output}, "created_at": completed})
    supervisor_event = {"run_id": run_id, "agent_name": "master-orchestrator", "stage": stage, "framework": "langgraph", "status": "delegated", "started_at": started, "completed_at": completed, "summary": state["master_brief"][:500]}
    specialist_event = {"run_id": run_id, "agent_name": agent_name, "stage": stage, "framework": "langgraph", "status": "completed", "started_at": started, "completed_at": completed, "summary": output[:500]}
    if request.get("project_id") or request.get("workflow_id"):
        await db["agent_runs"].insert_one({**specialist_event, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "chat_id": request.get("chat_id"), "created_by": user_id, "master_brief": state["master_brief"], "output": output, "skills": request.get("skills") or []})
    return {"reply": output, "stage": stage, "source": "langgraph-supervisor", "agent_events": [supervisor_event, specialist_event], "artifact": {"title": agent_name, "stage": stage, "content": output, "requires_hitl": True}, "chat_title": chat_title}
