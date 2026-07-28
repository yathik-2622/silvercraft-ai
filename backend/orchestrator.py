"""
LangGraph-based Orchestrator for SilverCraft AI.

Powers:
  - 4-stage HITL pipeline (Source Analysis → Conceptual → Logical → Physical/STTM)
  - /skill slash-command injection mid-session
  - A2A (Agent-to-Agent) calls to remote agent URIs
  - Auto-workflow construction from high-level prompts (/dimensional-modelling, /data-vault, etc.)
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Dict, List, Optional, TypedDict

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

try:
    from langgraph.graph import END, StateGraph
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_google_genai import ChatGoogleGenerativeAI
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False

from config import settings
from database import get_db
from api.routes.auth import get_current_user
from api.routes.skills import _industry_skills
from models.user import UserModel
from core.chat_orchestration import run_chat_orchestration

orchestrator_router = APIRouter()

# ─────────────────────────────────────────────────────────────
# Built-in Skill Library (Medallion / Kimball / Data Vault)
# ─────────────────────────────────────────────────────────────
BUILTIN_SKILLS: Dict[str, str] = {
    "3nf-normalization": """
# 3NF Normalization Skill
- Eliminate partial dependencies: 1NF → 2NF → 3NF
- Enforce atomic values; no repeating groups
- Separate all non-key attributes into own entities
- Use surrogate PKs: {entity}_id (BIGINT or UUID)
- Naming convention: snake_case, ISO timestamps (TIMESTAMP_NTZ)
- PII fields: apply SHA-256 hashing or tokenization
- Add audit columns: created_at, updated_at, is_deleted (soft-delete)
""",
    "dimensional-modeling": """
# Kimball Dimensional Modeling Skill
- Identify business processes, declare grain, list dimensions and facts
- Fact table grain must be explicitly stated before designing
- Use surrogate keys for all dimension tables (never business keys as PK)
- Apply Slowly Changing Dimensions Type 2 (SCD2) by default
- Create conformed dimensions shared across multiple fact tables
- Star schema preferred; snowflake only when cardinality demands
- Naming: fact_{business_process}, dim_{entity}
- Always include dim_date and dim_time calendar dimensions
""",
    "data-vault": """
# Data Vault 2.0 Skill
- Hubs: business keys + LOAD_DATE + RECORD_SOURCE (no descriptive attributes)
- Links: FK relationships between Hubs + LOAD_DATE + RECORD_SOURCE
- Satellites: descriptive attributes + LOAD_DATE + RECORD_SOURCE + HASH_DIFF
- Hash keys: SHA-256 of UPPER(TRIM(business_key)), pipe-delimited for composites
- Insert-only pattern — never update, never delete
- PIT (Point-in-Time) tables for snapshot query acceleration
- Bridge tables for many-to-many resolution
- Schema prefixes: HUB_, LNK_, SAT_, PIT_, BRG_
""",
    "source-analysis": """
# Source Analysis Skill
- Profile every table: row count, null rate, distinct count, min/max/avg per column
- Flag PII columns: name, email, phone, address, DOB, SSN, passport, IP address
- Flag PHI columns: diagnoses, medications, lab results, insurance IDs
- Flag Financial: account numbers, card numbers, transaction amounts
- Infer FK relationships from _id suffix and column-name patterns
- Classify sensitivity tier: Public, Internal, Confidential, Restricted
- Recommend masking per tier: Tokenize, Hash, Truncate, Suppress
- Produce a data dictionary with business descriptions per column
""",
    "pii-classification": """
# PII Classification Skill
- Tier 1 (Restricted): SSN, passport, financial account, card numbers → SHA-256 hash
- Tier 2 (Confidential): name, email, phone, full address, DOB → Tokenize
- Tier 3 (Internal): IP address, user agent, device ID → Truncate or pseudonymize
- PHI (HIPAA): diagnoses, medications, lab results, insurance IDs → Suppress or encrypt
- Tag every flagged column with: pii_tier, masking_strategy, regulatory_framework
""",
    "sttm": """
# STTM (Source-to-Target Mapping) Skill
- Map every source column to its target column with transformation rule
- Rules: TRIM, UPPER, LOWER, COALESCE, CAST, DATE_TRUNC, SHA2, TOKENIZE
- Default values for nullable targets: NULL, 'UNKNOWN', 0, CURRENT_TIMESTAMP
- DQ rules per column: NOT NULL, REGEX_MATCH, FOREIGN_KEY, RANGE_CHECK
- Load strategy: Full Load | Incremental (watermark) | CDC (log-based)
- Generate DDL: CREATE TABLE with constraints, comments, and partitioning hints
- Include STTM matrix columns: src_table, src_col, tgt_table, tgt_col, rule, dq_check, load_type
""",
}

# Markdown files under backend/skills are the authoritative standards. The
# compatibility dictionary is rebuilt at import for the legacy planning APIs.
BUILTIN_SKILLS = {skill["name"]: skill["content"] for skill in _industry_skills()}

# ─────────────────────────────────────────────────────────────
# Slash-command → skill key mapper
# ─────────────────────────────────────────────────────────────
SLASH_MAP: Dict[str, str] = {
    "dimensional": "dimensional-modeling",
    "dimensional-modelling": "dimensional-modeling",
    "dimensional-modeling": "dimensional-modeling",
    "data-vault": "data-vault",
    "datavault": "data-vault",
    "3nf": "3nf-normalization",
    "source": "source-analysis",
    "pii": "pii-classification",
    "sttm": "sttm",
}

def parse_slash_command(prompt: str) -> Optional[str]:
    """Return the skill key if the prompt starts with a recognized /command, else None."""
    p = prompt.strip()
    if not p.startswith("/"):
        return None
    cmd = p.lstrip("/").split()[0].lower()
    return SLASH_MAP.get(cmd)

# ─────────────────────────────────────────────────────────────
# LangGraph pipeline state
# ─────────────────────────────────────────────────────────────
class PipelineState(TypedDict):
    messages: List[Dict[str, str]]
    current_stage: str
    skills: List[str]
    schema_context: Dict[str, Any]
    output: str

def _build_system_prompt(stage: str, skills: List[str], schema_context: Dict[str, Any]) -> str:
    skill_texts = "\n\n".join(BUILTIN_SKILLS[s] for s in skills if s in BUILTIN_SKILLS)
    return (
        "You are SilverCraft AI — an enterprise data modeling assistant specializing in "
        "Medallion Architecture (Bronze → Silver → Gold), 3NF normalization, Kimball dimensional modeling, "
        "and Data Vault 2.0.\n\n"
        f"Current HITL Stage: **{stage}**\n\n"
        f"Active Skills:\n{skill_texts if skill_texts else 'Standard modeling guidelines apply.'}\n\n"
        f"Schema Context: {json.dumps(schema_context)[:2000]}\n\n"
        "Respond with concise, structured advice using markdown. Include entity/attribute "
        "recommendations, PK/FK suggestions, and clear HITL confirmation prompts."
    )

# ─────────────────────────────────────────────────────────────
# Agent node factory (one LLM call per HITL stage)
# ─────────────────────────────────────────────────────────────
def make_agent_node(stage_name: str):
    async def agent_node(state: PipelineState) -> PipelineState:
        if not LANGGRAPH_AVAILABLE:
            raise HTTPException(status_code=503, detail="LangGraph runtime is not installed")

        api_key = settings.GEMINI_API_KEY
        if not api_key:
            raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")

        llm = ChatGoogleGenerativeAI(
            model=settings.DEFAULT_MODEL,
            google_api_key=api_key,
            temperature=0.65,
        )

        sys_prompt = _build_system_prompt(stage_name, state["skills"], state["schema_context"])
        last_human_msg = next(
            (m["content"] for m in reversed(state["messages"]) if m.get("role") == "user"),
            "Begin analysis.",
        )
        response = await llm.ainvoke([
            SystemMessage(content=sys_prompt),
            HumanMessage(content=last_human_msg),
        ])
        state["output"] = response.content
        state["current_stage"] = stage_name
        return state

    return agent_node

# ─────────────────────────────────────────────────────────────
# Build the 4-stage LangGraph pipeline (compiled once at import)
# ─────────────────────────────────────────────────────────────
def _build_pipeline():
    if not LANGGRAPH_AVAILABLE:
        return None
    graph = StateGraph(PipelineState)
    graph.add_node("source_analysis",  make_agent_node("1-source-analysis"))
    graph.add_node("conceptual",       make_agent_node("2-conceptual"))
    graph.add_node("logical",          make_agent_node("3-logical"))
    graph.add_node("physical_sttm",    make_agent_node("4-physical-sttm"))
    graph.set_entry_point("source_analysis")
    graph.add_edge("source_analysis", "conceptual")
    graph.add_edge("conceptual", "logical")
    graph.add_edge("logical", "physical_sttm")
    graph.add_edge("physical_sttm", END)
    return graph.compile()

PIPELINE = _build_pipeline()

# Stage name → graph node name mapping
_STAGE_NODE_MAP = {
    "1-source-analysis": "source_analysis",
    "2-conceptual":       "conceptual",
    "3-logical":          "logical",
    "4-physical-sttm":    "physical_sttm",
}

# ─────────────────────────────────────────────────────────────
# A2A: proxy a request to a remote agent endpoint
# ─────────────────────────────────────────────────────────────
async def call_remote_agent(uri: str, payload: Dict[str, Any]) -> str:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(uri, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("reply") or data.get("output") or str(data)
    except Exception as exc:
        return f"[A2A Error] Could not reach {uri}: {exc}"

# ─────────────────────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────────────────────
class OrchestratorRequest(BaseModel):
    prompt: str
    current_stage: str = "1-source-analysis"
    workflow_type: str = "default"      # default | custom | orchestrator
    skills: List[str] = []
    schema_context: Dict[str, Any] = {}
    messages: List[Dict[str, str]] = []
    remote_agent_uri: Optional[str] = None
    project_id: Optional[str] = None
    workflow_id: Optional[str] = None
    chat_id: Optional[str] = None
    model_name: Optional[str] = None

class OrchestratorResponse(BaseModel):
    reply: str
    stage: str
    source: str                         # langgraph-gemini | a2a-remote
    suggested_workflow: Optional[List[str]] = None
    agent_events: List[Dict[str, Any]] = []
    artifact: Optional[Dict[str, Any]] = None
    chat_title: Optional[str] = None


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"

class OrchestratorPlanRequest(BaseModel):
    prompt: str
    project_id: Optional[str] = None
    source_types: List[str] = []
    source_files: List[str] = []
    existing_model_files: List[str] = []
    standard_naming_notes: str = ""

class OrchestratorPlanResponse(BaseModel):
    workflow_name: str
    modeling_skill: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    created_agents: List[str] = []
    created_skills: List[str] = []
    hitl_summary: str

class A2AValidateRequest(BaseModel):
    card_url: str

class A2AValidateResponse(BaseModel):
    ok: bool
    summary: Dict[str, Any]

# ─────────────────────────────────────────────────────────────
# POST /orchestrator/run — main orchestration endpoint
# ─────────────────────────────────────────────────────────────
@orchestrator_router.post("/run", response_model=OrchestratorResponse)
async def run_orchestrator(req: OrchestratorRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    # 1. Resolve slash-command → inject skill + build suggested workflow
    slash_skill = parse_slash_command(req.prompt)
    active_skills = list(req.skills)
    suggested_workflow: Optional[List[str]] = None

    if slash_skill:
        if slash_skill not in active_skills:
            active_skills.append(slash_skill)
        if slash_skill == "dimensional-modeling":
            suggested_workflow = [
                "agent-source-profiler",
                "agent-pii-guard",
                "agent-conceptual-modeler",
                "agent-dimensional-modeler",
                "agent-sttm-automator",
            ]
        elif slash_skill == "data-vault":
            suggested_workflow = [
                "agent-source-profiler",
                "agent-pii-guard",
                "agent-conceptual-modeler",
                "agent-data-vault",
                "agent-sttm-automator",
            ]
        else:
            suggested_workflow = [
                "agent-source-profiler",
                "agent-logical-normalizer",
                "agent-sttm-automator",
            ]

    # 2. A2A: delegate to remote agent if URI is set
    if req.remote_agent_uri:
        reply = await call_remote_agent(req.remote_agent_uri, {
            "prompt": req.prompt,
            "stage": req.current_stage,
            "skills": active_skills,
            "schema_context": req.schema_context,
        })
        return OrchestratorResponse(
            reply=reply,
            stage=req.current_stage,
            source="a2a-remote",
            suggested_workflow=suggested_workflow,
        )

    # 3. Master/sub-agent runtime uses the configured OpenAI-compatible provider, not optional Gemini imports.
    chat = None
    if req.chat_id:
        try:
            from bson import ObjectId
            chat = await db["chats"].find_one({"_id": ObjectId(req.chat_id)})
        except Exception:
            chat = None
    should_title = bool(chat and chat.get("created_by") == str(current_user.id) and chat.get("title") in {"Modeling conversation", "New modeling conversation"})
    result = await run_chat_orchestration(db, str(current_user.id), {**req.model_dump(), "skills": active_skills, "generate_chat_title": should_title})
    if chat and result.get("chat_title"):
        try:
            if chat.get("created_by") == str(current_user.id):
                await db["chats"].update_one({"_id": chat["_id"]}, {"$set": {"title": result["chat_title"]}})
        except Exception:
            pass
    return OrchestratorResponse(**{**result, "suggested_workflow": suggested_workflow})


@orchestrator_router.post("/stream")
async def stream_orchestrator(req: OrchestratorRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """SSE endpoint for visible orchestration milestones and the final persisted result."""
    async def events() -> AsyncIterator[str]:
        yield _sse("activity", {"label": "Master architect is classifying the request", "status": "running"})
        try:
            result = await run_orchestrator(req, current_user, db)
            for event in result.agent_events:
                yield _sse("activity", {"label": event["agent_name"], "status": event["status"], "summary": event.get("summary", "")})
            yield _sse("result", result.model_dump())
        except HTTPException as exc:
            yield _sse("error", {"detail": exc.detail, "status": exc.status_code})
        except Exception:
            yield _sse("error", {"detail": "The orchestration stream failed.", "status": 500})
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

def _skill_from_prompt(prompt: str) -> str:
    slash = parse_slash_command(prompt)
    if slash:
      return slash
    p = prompt.lower()
    if "data vault" in p or "datavault" in p or "vault" in p:
        return "data-vault"
    if "dimensional" in p or "kimball" in p or "star schema" in p:
        return "dimensional-modeling"
    if "3nf" in p or "normalized" in p or "normalised" in p:
        return "3nf-normalization"
    return "source-analysis"

def _agent_doc(agent_id: str, name: str, description: str, skills: List[str]) -> Dict[str, Any]:
    return {
        "_id": agent_id,
        "name": name,
        "description": description,
        "agent_type": "local",
        "remote_uri": None,
        "default_skills": skills,
        "created_at": "2026-01-01T00:00:00",
    }

def _required_agents_for_skill(skill: str) -> List[Dict[str, Any]]:
    if skill == "dimensional-modeling":
        return [
            _agent_doc("agent-source-profiler", "Source Analysis Agent", "Profiles source files and database schemas, then builds profiler, dictionary, classification, and source relationship artifacts.", ["source-analysis", "pii-classification"]),
            _agent_doc("agent-conceptual-modeler", "Conceptual Model Agent", "Builds concepts, relationship names, and cardinalities from source/domain context.", ["source-analysis"]),
            _agent_doc("agent-dimensional-modeler", "Dimensional Model Agent", "Creates Kimball facts, dimensions, grain declarations, surrogate keys, and SCD rules.", ["dimensional-modeling"]),
            _agent_doc("agent-sttm-automator", "Physical Model & STTM Agent", "Creates physical tables, DDL, STTM mappings, transformations, and DQ rules.", ["sttm"]),
        ]
    if skill == "data-vault":
        return [
            _agent_doc("agent-source-profiler", "Source Analysis Agent", "Profiles source files and database schemas, then builds profiler, dictionary, classification, and source relationship artifacts.", ["source-analysis", "pii-classification"]),
            _agent_doc("agent-conceptual-modeler", "Conceptual Model Agent", "Builds concepts, relationship names, and cardinalities from source/domain context.", ["source-analysis"]),
            _agent_doc("agent-data-vault", "Data Vault Agent", "Creates hubs, links, satellites, hash keys, PIT/bridge suggestions, and audit metadata.", ["data-vault"]),
            _agent_doc("agent-sttm-automator", "Physical Model & STTM Agent", "Creates physical tables, DDL, STTM mappings, transformations, and DQ rules.", ["sttm"]),
        ]
    return [
        _agent_doc("agent-source-profiler", "Source Analysis Agent", "Profiles source files and database schemas, then builds profiler, dictionary, classification, and source relationship artifacts.", ["source-analysis", "pii-classification"]),
        _agent_doc("agent-conceptual-modeler", "Conceptual Model Agent", "Builds concepts, relationship names, and cardinalities from source/domain context.", ["source-analysis"]),
        _agent_doc("agent-logical-normalizer", "Logical Model Agent", "Creates entities, attributes, PK/FK and 3NF/enterprise modeling rules.", ["3nf-normalization"]),
        _agent_doc("agent-sttm-automator", "Physical Model & STTM Agent", "Creates physical tables, DDL, STTM mappings, transformations, and DQ rules.", ["sttm"]),
    ]

@orchestrator_router.post("/plan", response_model=OrchestratorPlanResponse)
async def plan_orchestrator(req: OrchestratorPlanRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    modeling_skill = _skill_from_prompt(req.prompt)
    required = _required_agents_for_skill(modeling_skill)
    created_agents: List[str] = []
    created_skills: List[str] = []

    for skill_key in sorted({skill for agent in required for skill in agent["default_skills"]}):
        builtin_content = BUILTIN_SKILLS.get(skill_key)
        existing_skill = await db["skills"].find_one({
            "$or": [
                {"name": skill_key, "created_by": None},
                {"name": skill_key, "created_by": str(current_user.id)},
            ]
        })
        if not existing_skill and builtin_content:
            await db["skills"].insert_one({
                "name": skill_key,
                "description": f"Generated modeling skill for {skill_key}",
                "content": builtin_content.strip(),
                "created_by": str(current_user.id),
            })
            created_skills.append(skill_key)

    installed_custom = await db["agents"].find({}).to_list(length=500)
    installed_by_name = {a.get("name", "").lower(): a for a in installed_custom}
    installed_by_id = {str(a.get("_id")): a for a in installed_custom}

    nodes: List[Dict[str, Any]] = []
    for index, agent in enumerate(required):
        selected = installed_by_id.get(agent["_id"]) or installed_by_name.get(agent["name"].lower())
        if selected:
            agent_id = str(selected.get("_id"))
            name = selected.get("name", agent["name"])
            description = selected.get("description", agent["description"])
            skills = selected.get("default_skills", agent["default_skills"])
            agent_type = selected.get("agent_type", "local")
            remote_uri = selected.get("remote_uri")
        else:
            result = await db["agents"].insert_one({
                "name": agent["name"],
                "description": agent["description"],
                "agent_type": agent["agent_type"],
                "remote_uri": agent["remote_uri"],
                "default_skills": agent["default_skills"],
            })
            agent_id = str(result.inserted_id)
            name = agent["name"]
            description = agent["description"]
            skills = agent["default_skills"]
            agent_type = "local"
            remote_uri = None
            created_agents.append(name)

        nodes.append({
            "id": f"{agent['_id']}-{index}",
            "type": "agent",
            "position": {"x": 110 + index * 280, "y": 170},
            "data": {
                "agentId": agent_id,
                "name": name,
                "description": description,
                "framework": "A2A Remote" if agent_type == "remote" else "Local Agent",
                "status": "idle",
                "model": settings.DEFAULT_MODEL,
                "skills": ", ".join(skills),
                "inputs": ", ".join([*(req.source_files or ["all project sources"]), *(req.existing_model_files or []), req.standard_naming_notes or "standard naming notes"]),
                "knowledgeFiles": "",
                "hitlEnabled": True,
                "a2aEnabled": agent_type == "remote",
                "remoteUri": remote_uri or "",
                "customPrompt": f"Apply {modeling_skill} using project inputs. Preserve HITL review before publishing artifacts.",
                "kgOptIn": False,
            },
        })

    edges = [
        {
            "id": f"edge-{nodes[i]['id']}-{nodes[i + 1]['id']}",
            "source": nodes[i]["id"],
            "target": nodes[i + 1]["id"],
            "animated": True,
            "markerEnd": {"type": "arrowclosed"},
        }
        for i in range(len(nodes) - 1)
    ]

    return OrchestratorPlanResponse(
        workflow_name=f"{modeling_skill.replace('-', ' ').title()} Pipeline",
        modeling_skill=modeling_skill,
        nodes=nodes,
        edges=edges,
        created_agents=created_agents,
        created_skills=created_skills,
        hitl_summary="Review every suggested agent node, update prompts/skills/inputs/A2A where needed, then run the pipeline.",
    )

@orchestrator_router.post("/a2a/validate", response_model=A2AValidateResponse)
async def validate_a2a_card(req: A2AValidateRequest):
    if not req.card_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="A2A card URL must start with http:// or https://")
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(req.card_url)
            response.raise_for_status()
            card = response.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Remote A2A card validation failed: {exc}")

    name = card.get("name") or card.get("agent_name") or card.get("id") or "Remote Agent"
    capabilities = card.get("capabilities") or card.get("skills") or card.get("tools") or []
    endpoint = card.get("url") or card.get("endpoint") or card.get("run_url") or req.card_url
    return A2AValidateResponse(
        ok=True,
        summary={
            "name": name,
            "endpoint": endpoint,
            "capabilities_count": len(capabilities) if isinstance(capabilities, list) else 1,
            "protocol": card.get("protocol") or "A2A-compatible HTTP",
        },
    )

# ─────────────────────────────────────────────────────────────
# POST /orchestrator/inject-skill — mid-session skill injection
# ─────────────────────────────────────────────────────────────
class SkillInjectRequest(BaseModel):
    agent_id: str
    skill_key: str
    action: str = "append"  # append | replace

class SkillInjectResponse(BaseModel):
    agent_id: str
    skill_key: str
    skill_content: str
    action: str

@orchestrator_router.post("/inject-skill", response_model=SkillInjectResponse)
async def inject_skill(req: SkillInjectRequest):
    content = BUILTIN_SKILLS.get(req.skill_key)
    if not content:
        raise HTTPException(
            status_code=404,
            detail=f"Skill '{req.skill_key}' not found. Available: {list(BUILTIN_SKILLS.keys())}"
        )
    return SkillInjectResponse(
        agent_id=req.agent_id,
        skill_key=req.skill_key,
        skill_content=content.strip(),
        action=req.action,
    )

# ─────────────────────────────────────────────────────────────
# GET /orchestrator/skills/builtin — list all built-in skills
# ─────────────────────────────────────────────────────────────
@orchestrator_router.get("/skills/builtin")
async def list_builtin_skills():
    return {k: v.strip()[:300] + "..." for k, v in BUILTIN_SKILLS.items()}
