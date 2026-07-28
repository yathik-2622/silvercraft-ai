"""Base agent class + shared tool belt — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4

All 5 stage-owner agents and SkillCuratorAgent inherit from BaseAgent.
Each agent is implemented as a LangGraph ReAct subgraph.

Tool belt (all agents):
  query_mongo       — read docs from any app-layer collection
  vector_search     — Atlas Vector Search
  read_skill        — fetch and inject a skill document into context
  call_peer_agent   — peer-to-peer consultation
  emit_trace        — broadcast a trace event to the WebSocket stream
  web_reference     — retrieve external reference (PhysicalModelingAgent only)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, TypedDict
from uuid import uuid4

from fastapi import HTTPException

from core.runtime_settings import resolve_llm_runtime
from config import settings

# ── Optional LangGraph import ─────────────────────────────────────────────────
try:
    from langgraph.graph import END, StateGraph
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False


# ─── Agent state (TypedDict for LangGraph) ───────────────────────────────────

class AgentState(TypedDict, total=False):
    """Shared state threaded through every node in a stage-owner subgraph."""
    session_id: str
    project_id: str
    trace_id: str
    stage: str
    instruction: str
    directives: List[str]
    context_refs: Dict[str, Any]

    runtime: Dict[str, Any]
    db: Any
    peer_call_count: int

    skills_markdown: str
    tool_calls: List[Dict[str, Any]]
    thinking: List[str]
    output: Dict[str, Any]
    output_text: str
    error: Optional[str]
    status: str


# ─── Tool schemas (OpenAI-compatible) ────────────────────────────────────────

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "query_mongo",
            "description": "Query any application-layer Mongo collection. Use this to fetch parsed source documents, prior stage outputs, project context, or any other data you need.",
            "parameters": {
                "type": "object",
                "properties": {
                    "collection": {"type": "string", "description": "Mongo collection name, e.g. project_files, session_gates, skills"},
                    "filter_doc": {"type": "object", "description": "Mongo query filter as a JSON object"},
                    "limit": {"type": "integer", "description": "Max documents to return (default 50)", "default": 50},
                },
                "required": ["collection", "filter_doc"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_skill",
            "description": "Fetch a skill document's content by its Mongo _id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_id": {"type": "string", "description": "Mongo _id of the skill document"},
                },
                "required": ["skill_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "call_peer_agent",
            "description": "Ask another agent a question and get a concise answer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to_agent": {"type": "string", "description": "Name of the peer agent, e.g. SourceIntelligenceAgent"},
                    "question": {"type": "string", "description": "The specific question to ask"},
                    "context_refs": {"type": "object", "description": "Relevant context (table names, entity names, etc.)"},
                },
                "required": ["to_agent", "question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "emit_trace",
            "description": "Broadcast a trace event to the live UI panel. Use for progress updates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_type": {"type": "string", "description": "Type of trace event, e.g. thinking, output"},
                    "payload": {"type": "object", "description": "Event payload data"},
                },
                "required": ["event_type", "payload"],
            },
        },
    },
]


# ─── Tool implementations ─────────────────────────────────────────────────────

async def tool_query_mongo(collection: str, filter_doc: Dict[str, Any], db, limit: int = 50) -> List[Dict[str, Any]]:
    """query_mongo tool — AGENT_ARCH_V2 §4 tool belt."""
    from bson import ObjectId

    if "_id" in filter_doc and isinstance(filter_doc["_id"], str):
        try:
            filter_doc["_id"] = ObjectId(filter_doc["_id"])
        except Exception as exc:
            logger.debug("Failed to convert _id to ObjectId", extra={"filter_doc": filter_doc, "error": str(exc)})

    if db is None:
        return [{"error": "No database connection available."}]

    docs = await db[collection].find(filter_doc).to_list(length=limit)
    return [
        {**{k: v for k, v in d.items() if k != "_id"}, "id": str(d["_id"])}
        for d in docs
    ]


async def tool_read_skill(skill_id: str, db) -> str:
    """read_skill tool — fetch a skill's content_md from Mongo."""
    from bson import ObjectId
    if db is None:
        return "[read_skill error] No database connection available."
    try:
        oid = ObjectId(skill_id)
    except Exception:
        return f"[read_skill error] Invalid skill ID: {skill_id}"
    doc = await db["skills"].find_one({"_id": oid})
    if not doc:
        return f"[read_skill error] Skill {skill_id} not found."
    return doc.get("content_md") or doc.get("content", "")


async def tool_emit_trace(session_id: str, event_type: str, payload: Dict[str, Any], trace_id: str = "") -> None:
    """emit_trace tool — broadcast a trace event to the session's WebSocket stream."""
    try:
        from api.websocket import ws_manager
        await ws_manager.send_trace(session_id, event_type, payload, trace_id)
    except Exception as exc:
        logger.debug("Trace emission failed", extra={"session_id": session_id, "event_type": event_type, "error": str(exc)})


async def tool_call_peer_agent(
    session_id: str,
    from_agent: str,
    to_agent: str,
    question: str,
    context_refs: Dict[str, Any],
    state: AgentState,
    db,
    trace_id: str = "",
) -> str:
    """call_peer_agent tool — AGENT_ARCH_V2 §2.2."""
    current_count = state.get("peer_call_count", 0)
    if current_count >= settings.A2A_MAX_PEER_CALLS:
        return f"[peer_call error] {from_agent} exceeded peer call budget ({settings.A2A_MAX_PEER_CALLS} calls per task)."

    await tool_emit_trace(session_id, "peer_call", {
        "from_agent": from_agent,
        "to_agent": to_agent,
        "question": question,
        "trace_id": trace_id,
    }, trace_id)

    registry_doc = await db["agent_registry"].find_one({"agent_name": to_agent})
    transport = (registry_doc or {}).get("transport", "native")

    if transport == "a2a":
        endpoint_uri = (registry_doc or {}).get("endpoint_uri", "")
        if endpoint_uri:
            import httpx
            try:
                async with httpx.AsyncClient(timeout=settings.TIMEOUT_PEER_CALL) as client:
                    resp = await client.post(
                        f"{endpoint_uri}/peer-call",
                        json={"from_agent": from_agent, "question": question, "context_refs": context_refs, "trace_id": trace_id},
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return str(data.get("answer", ""))
            except Exception as exc:
                return f"[peer_call error] A2A call to {to_agent} failed: {exc}"

    runtime = resolve_llm_runtime(None)
    if runtime.get("api_key") and runtime.get("base_url"):
        import httpx
        headers = {"Authorization": f"Bearer {runtime['api_key']}", "Content-Type": "application/json"}
        body = {
            "model": runtime["default_model"],
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": f"You are {to_agent}, a specialized data modeling agent. Answer the following question from {from_agent} concisely and accurately."},
                {"role": "user", "content": f"Context: {json.dumps(context_refs)[:500]}\n\nQuestion: {question}"},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=settings.TIMEOUT_PEER_CALL) as client:
                resp = await client.post(f"{runtime['base_url'].rstrip('/')}/chat/completions", headers=headers, json=body)
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as exc:
            return f"[peer_call error] {exc}"

    return f"[peer_call stub] {to_agent} received: '{question}'"


TOOL_EXECUTORS: Dict[str, Callable] = {
    "query_mongo": tool_query_mongo,
    "read_skill": tool_read_skill,
    "call_peer_agent": tool_call_peer_agent,
    "emit_trace": tool_emit_trace,
}


async def execute_tool_call(tool_name: str, arguments: Dict[str, Any], state: AgentState) -> str:
    """Execute a tool call and return the result as a JSON string."""
    executor = TOOL_EXECUTORS.get(tool_name)
    if not executor:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    db = state.get("db")
    session_id = state.get("session_id", "")
    trace_id = state.get("trace_id", "")

    try:
        if tool_name == "query_mongo":
            result = await executor(
                collection=arguments.get("collection", ""),
                filter_doc=arguments.get("filter_doc", {}),
                db=db,
                limit=int(arguments.get("limit", 50)),
            )
            return json.dumps(result, default=str)
        elif tool_name == "read_skill":
            result = await executor(
                skill_id=arguments.get("skill_id", ""),
                db=db,
            )
            return str(result)
        elif tool_name == "call_peer_agent":
            result = await executor(
                session_id=session_id,
                from_agent=state.get("stage", "unknown"),
                to_agent=arguments.get("to_agent", ""),
                question=arguments.get("question", ""),
                context_refs=arguments.get("context_refs", {}),
                state=state,
                db=db,
                trace_id=trace_id,
            )
            return json.dumps({"answer": str(result)})
        elif tool_name == "emit_trace":
            await executor(
                session_id=session_id,
                event_type=arguments.get("event_type", "thinking"),
                payload=arguments.get("payload", {}),
                trace_id=trace_id,
            )
            return json.dumps({"ok": True})
        else:
            return json.dumps({"error": f"Tool executor not implemented: {tool_name}"})
    except Exception as exc:
        return json.dumps({"error": str(exc)})


async def llm_call(runtime: Dict[str, Any], system_prompt: str, user_prompt: str, response_format: str = "text", tools: Optional[List[Dict[str, Any]]] = None, state: Optional[AgentState] = None, max_tool_rounds: int = 5) -> str:
    """Shared LLM call helper with optional tool-calling loop (ReAct plan/act/observe)."""
    if not runtime.get("api_key"):
        raise HTTPException(status_code=503, detail="LLM_API_KEY not configured.")
    base_url = (runtime.get("base_url") or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=503, detail="LLM_BASE_URL not configured.")

    import httpx
    headers = {"Authorization": f"Bearer {runtime['api_key']}", "Content-Type": "application/json"}
    body: Dict[str, Any] = {
        "model": runtime["default_model"],
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if response_format == "json" and not tools:
        body["response_format"] = {"type": "json_object"}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    from urllib.parse import urlparse
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(f"{base_url}/chat/completions", headers=headers, json=body)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        provider = urlparse(base_url).netloc or "LLM provider"
        if exc.response.status_code == 401:
            raise HTTPException(status_code=503, detail=f"LLM auth failed at {provider}.") from exc
        raise HTTPException(status_code=502, detail=f"LLM provider error: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach LLM provider: {exc}") from exc

    choice = payload.get("choices", [{}])[0].get("message", {})
    finish_reason = payload.get("choices", [{}])[0].get("finish_reason", "stop")

    if not tools or finish_reason != "tool_calls":
        content = str(choice.get("content", "")).strip()
        if not content and finish_reason not in (None, "stop", "tool_calls"):
            raise HTTPException(status_code=502, detail="LLM returned an empty response.")
        return content

    tool_calls = choice.get("tool_calls", [])
    messages = body["messages"] + [{"role": "assistant", "content": None, "tool_calls": tool_calls}]

    for _ in range(max_tool_rounds):
        if not tool_calls:
            break

        for call in tool_calls:
            func = call.get("function", {})
            name = func.get("name", "")
            raw_args = func.get("arguments", "{}")
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except json.JSONDecodeError:
                args = {}

            result_str = await execute_tool_call(name, args, state or {})
            messages.append({
                "role": "tool",
                "tool_call_id": call.get("id", ""),
                "content": result_str,
            })

        body["messages"] = messages
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.post(f"{base_url}/chat/completions", headers=headers, json=body)
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            provider = urlparse(base_url).netloc or "LLM provider"
            if exc.response.status_code == 401:
                raise HTTPException(status_code=503, detail=f"LLM auth failed at {provider}.") from exc
            raise HTTPException(status_code=502, detail=f"LLM provider error: {exc.response.status_code}") from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Cannot reach LLM provider: {exc}") from exc

        choice = payload.get("choices", [{}])[0].get("message", {})
        finish_reason = payload.get("choices", [{}])[0].get("finish_reason", "stop")
        tool_calls = choice.get("tool_calls", [])

        if tool_calls:
            messages.append({"role": "assistant", "content": None, "tool_calls": tool_calls})
        else:
            return str(choice.get("content", "")).strip()

    return str(choice.get("content", "")).strip()
