"""
Agents API — updated to match ADM_2.0_API_ERRORS_AND_TOPOLOGY.md §3

Endpoints per spec:
  POST /agents/{agent_name}/run          → 202, result via WS stream
  POST /agents/{agent_name}/peer-call    → inter-agent handshake (AGENT_ARCH_V2 §2.2)
  GET  /agents/{agent_name}/.well-known/agent-card.json → A2A discovery

Agent registry backed by Mongo 'agent_registry' collection.
Per AGENT_ARCH_V2 §2.2: {agent_name, transport: "native"|"a2a", endpoint_uri}
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from api.routes.auth import get_current_user
from config import settings
from database import get_db
from middleware.error_handler import ADMException
from models.user import UserModel

router = APIRouter()

# ── The 5 canonical agents — AGENT_ARCH_V2 §4 ─────────────────────────────────
CANONICAL_AGENTS = {
    "source-intelligence": {
        "name": "SourceIntelligenceAgent",
        "description": "Senior data profiler. Owns Stage 1: profiling, business dictionary enrichment, sensitivity classification, domain assignment, key detection, and relationship discovery.",
        "stage": "source_analysis",
        "transport": "native",
        "timeout_per_unit": settings.TIMEOUT_SOURCE_INTELLIGENCE_PER_TABLE,
        "timeout_stage": settings.TIMEOUT_SOURCE_INTELLIGENCE_STAGE,
        "stage_owner": True,
        "publishes_agent_card": True,
    },
    "conceptual-modeling": {
        "name": "ConceptualModelingAgent",
        "description": "Business analyst translating physical tables into nouns and associations. Owns Stage 2: concept generation and relationship derivation.",
        "stage": "conceptual",
        "transport": "native",
        "timeout_stage": settings.TIMEOUT_CONCEPTUAL_STAGE,
        "stage_owner": True,
        "publishes_agent_card": True,
    },
    "logical-modeling": {
        "name": "LogicalModelingAgent",
        "description": "Senior logical data modeler. Owns Stage 3 (heaviest): type selection, naming, FACT/DIMENSION roles, attribute mapping, key identification, SCD review, enterprise mapping, relationships, M:N resolution.",
        "stage": "logical",
        "transport": "native",
        "timeout_per_unit": settings.TIMEOUT_LOGICAL_PER_ENTITY,
        "timeout_stage": settings.TIMEOUT_LOGICAL_STAGE,
        "stage_owner": True,
        "publishes_agent_card": True,
    },
    "physical-modeling": {
        "name": "PhysicalModelingAgent",
        "description": "Senior physical/platform data engineer. Owns Stage 4: surrogate keys, physical naming, transformation logic, STTM generation, DDL/DML generation for target_dialect.",
        "stage": "physical",
        "transport": "native",
        "timeout_per_unit": settings.TIMEOUT_PHYSICAL_PER_TABLE,
        "timeout_stage": settings.TIMEOUT_PHYSICAL_STAGE,
        "stage_owner": True,
        "publishes_agent_card": True,
    },
    "skill-curator": {
        "name": "SkillCuratorAgent",
        "description": "Responsible for creating, enhancing, and matching skills — reusable rule documents that other modeling agents apply as constraints. Cross-cutting, leaf agent (no outbound peer calls).",
        "stage": "cross_cutting",
        "transport": "native",
        "timeout_stage": settings.TIMEOUT_SKILL_CURATOR,
        "stage_owner": False,
        "publishes_agent_card": True,
    },
    "orchestrator": {
        "name": "MasterOrchestrator",
        "description": "Thin supervisor: runs IntakeAgent, dispatches task pointers to stage-owner agents, fires gate interrupts. Never does modeling reasoning directly.",
        "stage": None,
        "transport": "native",
        "stage_owner": False,
        "publishes_agent_card": False,  # internal only
    },
    "intake": {
        "name": "IntakeAgent",
        "description": "Slot-filling subgraph that produces a typed ProjectContext before any pipeline stage runs.",
        "stage": None,
        "transport": "native",
        "stage_owner": False,
        "publishes_agent_card": False,  # internal only
    },
}


# ─── Request / Response models ───────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    """Task pointer — AGENT_ARCH_V2 §1."""
    task_id: str = ""
    stage: str = "source_analysis"
    session_id: str
    project_id: str
    instruction: str
    context_refs: Dict[str, Any] = {}
    directives: List[str] = []
    trace_id: str = ""


class PeerCallRequest(BaseModel):
    """Body for /agents/{name}/peer-call — AGENT_ARCH_V2 §2.2."""
    from_agent: str
    question: str
    context_refs: Dict[str, Any] = {}
    trace_id: str = ""


class PeerCallResponse(BaseModel):
    answer: str
    confidence: Optional[float] = None
    thinking: List[str] = []


class AgentResponse(BaseModel):
    id: str
    name: str
    description: str = ""
    agent_type: str = "local"
    remote_uri: Optional[str] = None
    default_skills: List[str] = []
    is_system: bool = False
    stage: Optional[str] = None
    transport: str = "native"


# ─── Agent registry helpers ──────────────────────────────────────────────────

async def _get_registry_entry(agent_name: str, db) -> Dict[str, Any]:
    """Look up agent in Mongo registry; fall back to canonical definition."""
    doc = await db["agent_registry"].find_one({"agent_name": agent_name})
    if doc:
        return doc
    if agent_name in CANONICAL_AGENTS:
        return {"agent_name": agent_name, "transport": "native", "endpoint_uri": None, **CANONICAL_AGENTS[agent_name]}
    raise ADMException("NOT_FOUND", f"Agent '{agent_name}' not found in registry.")


async def _ensure_canonical_agents(db) -> None:
    """Seed agent_registry with the 7 canonical agents if not present."""
    for agent_name, info in CANONICAL_AGENTS.items():
        await db["agent_registry"].update_one(
            {"agent_name": agent_name},
            {"$setOnInsert": {
                "agent_name": agent_name,
                "transport": info.get("transport", "native"),
                "endpoint_uri": None,
                **info,
                "seeded_at": datetime.utcnow(),
            }},
            upsert=True,
        )


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/{agent_name}/run")
async def run_agent(
    agent_name: str,
    body: AgentRunRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Dispatch a task to a named agent.
    Returns 202 immediately; result delivered via WebSocket stream.
    Per API_ERRORS §3.1.
    """
    registry = await _get_registry_entry(agent_name, db)
    transport = registry.get("transport", "native")
    task_id = body.task_id or str(uuid4())
    trace_id = body.trace_id or str(uuid4())

    # Log the dispatch
    run_doc = {
        "task_id": task_id,
        "agent_name": agent_name,
        "session_id": body.session_id,
        "project_id": body.project_id,
        "stage": body.stage,
        "instruction": body.instruction,
        "directives": body.directives,
        "context_refs": body.context_refs,
        "trace_id": trace_id,
        "transport": transport,
        "status": "queued",
        "dispatched_by": str(current_user.id),
        "dispatched_at": datetime.utcnow(),
    }
    await db["agent_runs"].insert_one(run_doc)

    if transport == "a2a":
        endpoint_uri = registry.get("endpoint_uri")
        if not endpoint_uri:
            raise ADMException("AGENT_TOOL_FAILURE", f"Agent '{agent_name}' is registered as A2A but has no endpoint_uri.")
        # Fire-and-forget to A2A endpoint (single retry, 5s timeout per spec)
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(f"{endpoint_uri}/run", json=body.model_dump())
        except Exception:
            pass  # Non-fatal — task is logged, result will come via WS

    # TODO Phase 4: dispatch native LangGraph subgraph invocation
    # TODO Phase 6: enqueue as Celery task

    return {
        "task_id": task_id,
        "agent_name": agent_name,
        "status": "running",
        "trace_id": trace_id,
        "message": f"Task dispatched to {CANONICAL_AGENTS.get(agent_name, {}).get('name', agent_name)}. Result will arrive via WebSocket stream.",
    }


@router.post("/{agent_name}/peer-call", response_model=PeerCallResponse)
async def peer_call(
    agent_name: str,
    body: PeerCallRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Agent-to-agent peer call endpoint — AGENT_ARCH_V2 §2.2.
    Called by call_peer_agent tool; one round-trip per call.
    Logged as peer_call trace event on the WS stream.
    """
    registry = await _get_registry_entry(agent_name, db)
    transport = registry.get("transport", "native")
    trace_id = body.trace_id or str(uuid4())

    # Log peer call
    await db["peer_call_logs"].insert_one({
        "from_agent": body.from_agent,
        "to_agent": agent_name,
        "question": body.question,
        "context_refs": body.context_refs,
        "trace_id": trace_id,
        "called_at": datetime.utcnow(),
    })

    if transport == "a2a":
        endpoint_uri = registry.get("endpoint_uri")
        if not endpoint_uri:
            raise ADMException("AGENT_TOOL_FAILURE", f"A2A agent '{agent_name}' has no endpoint_uri.")
        try:
            async with httpx.AsyncClient(timeout=settings.TIMEOUT_PEER_CALL) as client:
                resp = await client.post(
                    f"{endpoint_uri}/peer-call",
                    json={"from_agent": body.from_agent, "question": body.question, "context_refs": body.context_refs, "trace_id": trace_id},
                )
                resp.raise_for_status()
                data = resp.json()
                return PeerCallResponse(
                    answer=data.get("answer", ""),
                    confidence=data.get("confidence"),
                    thinking=data.get("thinking", []),
                )
        except httpx.TimeoutException:
            raise ADMException("AGENT_TIMEOUT", f"Peer call to '{agent_name}' timed out after {settings.TIMEOUT_PEER_CALL}s.")
        except Exception as exc:
            raise ADMException("AGENT_TOOL_FAILURE", f"Peer call to A2A agent '{agent_name}' failed: {exc}")

    # Native transport — TODO Phase 4: invoke LangGraph subgraph directly
    # Stub answer for now
    return PeerCallResponse(
        answer=f"[Stub] {agent_name} acknowledges the question: '{body.question[:100]}'. Native subgraph invocation will be wired in Phase 4.",
        thinking=[f"Received peer call from {body.from_agent}", "Native dispatch pending Phase 4 implementation"],
    )


@router.get("/{agent_name}/.well-known/agent-card.json")
async def agent_card(agent_name: str, request: Request):
    """
    A2A discovery document — AGENT_ARCH_V2 §2.2, API_ERRORS §3.1.
    Published only for the 5 modeling/skill agents (not orchestrator or intake).
    """
    info = CANONICAL_AGENTS.get(agent_name)
    if not info or not info.get("publishes_agent_card"):
        raise ADMException("NOT_FOUND", f"No A2A agent card for '{agent_name}'.")

    base_url = (settings.A2A_PUBLIC_BASE_URL or str(request.base_url)).rstrip("/")
    return {
        "name": info["name"],
        "description": info["description"],
        "url": f"{base_url}/api/v1/agents/{agent_name}",
        "version": "1.0",
        "capabilities": {"streaming": True, "pushNotifications": False},
        "authentication": {"schemes": ["apiKey"] if settings.A2A_SHARED_SECRET else []},
        "skills": [{
            "id": agent_name,
            "name": info["name"],
            "description": info["description"],
            "tags": ["data-modeling", info.get("stage", "cross_cutting")],
        }],
        "endpoints": {
            "run": f"{base_url}/api/v1/agents/{agent_name}/run",
            "peer_call": f"{base_url}/api/v1/agents/{agent_name}/peer-call",
        },
    }


@router.get("/registry")
async def list_agent_registry(
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """List all registered agents (canonical + any external A2A registrations)."""
    await _ensure_canonical_agents(db)
    docs = await db["agent_registry"].find({}).to_list(length=200)
    return [
        {**{k: v for k, v in doc.items() if k != "_id"}, "id": str(doc["_id"])}
        for doc in docs
    ]


@router.post("/registry")
async def register_external_agent(
    agent_name: str,
    endpoint_uri: str,
    description: str = "",
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Register an external A2A agent. Swapping a canonical agent for an external
    one is a config change here, not a code change — per API_ERRORS §3.1.
    """
    await db["agent_registry"].update_one(
        {"agent_name": agent_name},
        {"$set": {
            "agent_name": agent_name,
            "transport": "a2a",
            "endpoint_uri": endpoint_uri,
            "description": description,
            "registered_by": str(current_user.id),
            "registered_at": datetime.utcnow(),
        }},
        upsert=True,
    )
    return {"status": "registered", "agent_name": agent_name, "transport": "a2a", "endpoint_uri": endpoint_uri}
