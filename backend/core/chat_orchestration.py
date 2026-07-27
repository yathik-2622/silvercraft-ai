"""LangGraph supervisor orchestration for the chat-first modeling studio."""

from __future__ import annotations

from datetime import datetime
from urllib.parse import urlparse
from typing import Any, TypedDict
from uuid import uuid4

import httpx
from fastapi import HTTPException

from core.runtime_settings import resolve_llm_runtime

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
        "or requesting data-modeling work. For greetings, product-use questions, and general conversation, answer directly using exactly "
        "the prefix CHAT:. For modeling work that needs a specialist, use exactly the prefix DELEGATE: followed by a concise delegation brief. "
        "Preserve user intent, use supplied skills, and require HITL for material assumptions.\n"
        f"Stage: {state['stage']}\nSpecialist: {state['agent_name']}\nProject context: {state['project_context']}\n"
        f"Skills:\n{state['skills_markdown'] or 'No additional skill selected.'}\n\nUser request:\n{state['user_prompt']}"
    )
    brief = await _chat_completion(state["runtime"], "Classify and respond exactly as CHAT: <answer> or DELEGATE: <brief>.", prompt)
    return {"master_brief": brief, "response_mode": "chat" if brief.lstrip().upper().startswith("CHAT:") else "delegate"}


async def _specialist_node(state: ModelingState) -> dict:
    instruction = (
        f"You are {state['agent_name']}. {state['agent_instruction']}\n"
        "Return an editable Markdown artifact with headings: Findings, Proposed Output, Assumptions, and HITL Question. "
        "Never claim to inspect a file, table, or database that has not been supplied.\n\n"
        f"Master delegation brief:\n{state['master_brief'].replace('DELEGATE:', '', 1).strip()}\n\nApplicable skill Markdown:\n{state['skills_markdown']}"
    )
    return {"output": await _chat_completion(state["runtime"], instruction, state["user_prompt"])}


async def _chat_node(state: ModelingState) -> dict:
    return {"output": state["master_brief"].replace("CHAT:", "", 1).strip()}


def _route_after_supervisor(state: ModelingState) -> str:
    return "chat" if state.get("response_mode") == "chat" else "specialist"


def _build_graph():
    if not LANGGRAPH_AVAILABLE:
        return None
    graph = StateGraph(ModelingState)
    graph.add_node("supervisor", _supervisor_node)
    graph.add_node("specialist", _specialist_node)
    graph.add_node("chat", _chat_node)
    graph.set_entry_point("supervisor")
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
    started = datetime.utcnow()
    state = await MODELING_GRAPH.ainvoke({"runtime": runtime, "stage": stage, "agent_name": agent_name, "agent_instruction": agent_instruction, "user_prompt": request.get("prompt", ""), "project_context": request.get("schema_context") or {}, "skills_markdown": skills_markdown})
    completed = datetime.utcnow()
    output = state["output"]
    chat_title = await _generate_chat_title(runtime, request.get("prompt", "")) if request.get("generate_chat_title") else None
    if state.get("response_mode") == "chat":
        event = {"run_id": run_id, "agent_name": "master-orchestrator", "stage": stage, "framework": "langgraph", "status": "completed", "started_at": started, "completed_at": completed, "summary": output[:500]}
        return {"reply": output, "stage": stage, "source": "langgraph-supervisor", "agent_events": [event], "artifact": None, "chat_title": chat_title}
    await db["a2a_messages"].insert_one({"run_id": run_id, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "from_agent": "master-orchestrator", "to_agent": agent_name, "message_type": "delegation", "payload": {"stage": stage, "prompt": request.get("prompt", "")}, "created_at": started})
    await db["a2a_messages"].insert_one({"run_id": run_id, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "from_agent": agent_name, "to_agent": "master-orchestrator", "message_type": "result", "payload": {"stage": stage, "output": output}, "created_at": completed})
    event = {"run_id": run_id, "agent_name": agent_name, "stage": stage, "framework": "langgraph", "status": "completed", "started_at": started, "completed_at": completed, "summary": output[:500]}
    if request.get("project_id") or request.get("workflow_id"):
        await db["agent_runs"].insert_one({**event, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "chat_id": request.get("chat_id"), "created_by": user_id, "master_brief": state["master_brief"], "output": output, "skills": request.get("skills") or []})
    return {"reply": output, "stage": stage, "source": "langgraph-supervisor", "agent_events": [event], "artifact": {"title": agent_name, "stage": stage, "content": output, "requires_hitl": True}, "chat_title": chat_title}
