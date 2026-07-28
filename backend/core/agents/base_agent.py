"""
Base agent class + shared tool belt — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4

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
from typing import Any, Dict, List, Optional, TypedDict
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
    # Task pointer fields
    session_id: str
    project_id: str
    trace_id: str
    stage: str
    instruction: str
    directives: List[str]
    context_refs: Dict[str, Any]

    # Runtime
    runtime: Dict[str, Any]
    peer_call_count: int          # budget enforcer — max 5 per AGENT_ARCH_V2 §2.2

    # Skill content (injected by read_skill tool)
    skills_markdown: str

    # Tool call log (for trace emission)
    tool_calls: List[Dict[str, Any]]

    # Intermediate / final output
    thinking: List[str]           # chain-of-thought steps
    output: Dict[str, Any]        # structured stage output (persisted to gate doc)
    output_text: str              # rendered markdown (for chat display)
    error: Optional[str]
    status: str                   # running | ready | error


# ─── Tool implementations ─────────────────────────────────────────────────────

async def tool_query_mongo(collection: str, filter_doc: Dict[str, Any], db, limit: int = 50) -> List[Dict[str, Any]]:
    """
    query_mongo tool — AGENT_ARCH_V2 §4 tool belt.
    Agents self-fetch their data; never passed pre-hydrated payloads.
    """
    from bson import ObjectId

    # Resolve any string "_id" to ObjectId
    if "_id" in filter_doc and isinstance(filter_doc["_id"], str):
        try:
            filter_doc["_id"] = ObjectId(filter_doc["_id"])
        except Exception:
            pass

    docs = await db[collection].find(filter_doc).to_list(length=limit)
    return [
        {**{k: v for k, v in d.items() if k != "_id"}, "id": str(d["_id"])}
        for d in docs
    ]


async def tool_read_skill(skill_id: str, db) -> str:
    """read_skill tool — fetch a skill's content_md from Mongo."""
    from bson import ObjectId
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
    except Exception:
        pass  # Non-fatal — trace emission failure never blocks agent execution


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
    """
    call_peer_agent tool — AGENT_ARCH_V2 §2.2.
    Budget: max 5 peer calls per agent task (SESSION budget, not global).
    Logs call and emits peer_call trace event.
    """
    # Budget check
    current_count = state.get("peer_call_count", 0)
    if current_count >= settings.A2A_MAX_PEER_CALLS:
        from middleware.error_handler import ADMException
        raise ADMException(
            "PEER_CALL_BUDGET_EXCEEDED",
            f"Agent {from_agent} has exceeded the peer call budget ({settings.A2A_MAX_PEER_CALLS} calls per task).",
        )

    # Emit trace event
    await tool_emit_trace(session_id, "peer_call", {
        "from_agent": from_agent,
        "to_agent": to_agent,
        "question": question,
        "trace_id": trace_id,
    }, trace_id)

    # Resolve transport from registry
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

    # Native dispatch — TODO Phase 4 full: invoke LangGraph subgraph
    # For now: LLM direct call to simulate peer answer
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


async def llm_call(runtime: Dict[str, Any], system_prompt: str, user_prompt: str, response_format: str = "text") -> str:
    """Shared LLM call helper — all agent nodes use this."""
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
    if response_format == "json":
        body["response_format"] = {"type": "json_object"}

    from urllib.parse import urlparse
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{base_url}/chat/completions", headers=headers, json=body)
            resp.raise_for_status()
            payload = resp.json()
    except httpx.HTTPStatusError as exc:
        provider = urlparse(base_url).netloc or "LLM provider"
        if exc.response.status_code == 401:
            raise HTTPException(status_code=503, detail=f"LLM auth failed at {provider}.")
        raise HTTPException(status_code=502, detail=f"LLM provider error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach LLM provider: {exc}")

    try:
        return str(payload["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected LLM response format: {exc}")
