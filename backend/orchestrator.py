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
from datetime import datetime
from typing import Any, Dict, List, Optional, TypedDict

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

# LangGraph runtime
try:
    from langgraph.graph import StateGraph, END
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False

from config import settings
from core.runtime_settings import resolve_llm_runtime
from database import get_db
from core.audit import record_audit_event
from api.routes.auth import get_current_user
from models.user import UserModel

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
        raise HTTPException(status_code=503, detail="Use /orchestrator/run for platform LLM execution.")
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
    workflow_type: str = "default"      # default | custom
    skills: List[str] = []
    schema_context: Dict[str, Any] = {}
    messages: List[Dict[str, str]] = []
    remote_agent_uri: Optional[str] = None

class OrchestratorResponse(BaseModel):
    reply: str
    stage: str
    source: str                         # platform-llm | a2a-remote
    suggested_workflow: Optional[List[str]] = None

class OrchestratorPlanRequest(BaseModel):
    prompt: str
    project_id: Optional[str] = None
    source_types: List[str] = []
    source_files: List[str] = []
    existing_model_files: List[str] = []
    standard_naming_notes: str = ""
    workflow_mode: str = "orchestrator"
    workflow_name: str = ""
    approve_new_agents: bool = False

class OrchestratorPlanResponse(BaseModel):
    workflow_id: Optional[str] = None
    project_id: Optional[str] = None
    workflow_name: str
    modeling_skill: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    created_agents: List[str] = []
    created_skills: List[str] = []
    hitl_summary: str
    workflow_mode: str = "orchestrator"
    requires_hitl: bool = True
    pending_agent_creations: List[Dict[str, Any]] = []

class A2AValidateRequest(BaseModel):
    card_url: str

class A2AValidateResponse(BaseModel):
    ok: bool
    summary: Dict[str, Any]

# ─────────────────────────────────────────────────────────────
# POST /orchestrator/run — main orchestration endpoint
# ─────────────────────────────────────────────────────────────
@orchestrator_router.post("/run", response_model=OrchestratorResponse)
async def run_orchestrator(req: OrchestratorRequest, db=Depends(get_db)):
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

    # 3. AIGERS-style OpenAI-compatible platform LLM runtime
    runtime = await resolve_llm_runtime(db, None)
    if runtime.get("api_key") or runtime.get("provider") == "platform":
        system_prompt = _build_system_prompt(req.current_stage, active_skills, req.schema_context)
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    f"{runtime['base_url'].rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {runtime.get('api_key', '')}"} if runtime.get("api_key") else {},
                    json={
                        "model": runtime.get("default_model") or settings.DEFAULT_MODEL,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            *req.messages,
                            {"role": "user", "content": req.prompt},
                        ],
                        "temperature": 0.4,
                    },
                )
                response.raise_for_status()
                payload = response.json()
                reply = payload.get("choices", [{}])[0].get("message", {}).get("content") or "No response content returned."
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Platform LLM runtime is unavailable: {exc}")
        return OrchestratorResponse(
            reply=reply,
            stage=req.current_stage,
            source="platform-llm",
            suggested_workflow=suggested_workflow,
        )

    raise HTTPException(status_code=503, detail="AI Orchestration is unavailable. Configure the platform LLM provider in settings or backend env.")

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
    # Validate the project boundary before planning against project-owned inputs.
    if req.workflow_mode not in {"orchestrator", "diy"}:
        raise HTTPException(status_code=422, detail="workflow_mode must be orchestrator or diy")
    project = None
    if req.project_id:
        try:
            project = await db["projects"].find_one({"_id": ObjectId(req.project_id)})
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid project ID") from exc
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if project.get("owner_id") != str(current_user.id) and str(current_user.id) not in project.get("shared_with", []):
            raise HTTPException(status_code=403, detail="Not authorized to plan this project")
    modeling_skill = _skill_from_prompt(req.prompt)
    required = _required_agents_for_skill(modeling_skill)
    created_agents: List[str] = []
    created_skills: List[str] = []
    pending_agent_creations: List[Dict[str, Any]] = []

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

    # The orchestrator can use system agents plus agents owned by this user, never another user's library.
    installed_custom = await db["agents"].find({"$or": [{"is_system": True}, {"created_by": str(current_user.id)}]}).to_list(length=500)
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
            # Prefer an exact marketplace capability before asking for custom-agent HITL approval.
            marketplace_template = await db["marketplace_templates"].find_one({"name": agent["name"]}, {"_id": 0})
            if marketplace_template:
                installed = {
                    "name": marketplace_template.get("name", agent["name"]),
                    "description": marketplace_template.get("description", agent["description"]),
                    "agent_type": "local",
                    "remote_uri": None,
                    "default_skills": marketplace_template.get("suggested_tools", agent["default_skills"]),
                    "template_id": marketplace_template.get("template_id"),
                    "framework": marketplace_template.get("framework", "langgraph"),
                    "system_prompt": marketplace_template.get("default_system_prompt", ""),
                    "model_name": marketplace_template.get("default_model_name", settings.DEFAULT_MODEL),
                    "created_by": str(current_user.id),
                    "is_system": False,
                    "installed_from_marketplace": True,
                    "created_at": datetime.utcnow(),
                }
                installed_result = await db["agents"].insert_one(installed)
                agent_id = str(installed_result.inserted_id)
                name = installed["name"]
                description = installed["description"]
                skills = installed["default_skills"]
                agent_type = installed["agent_type"]
                remote_uri = installed["remote_uri"]
                created_agents.append(name)
                selected = installed
            else:
            # Missing capabilities remain pending until the user approves agent creation.
            # This is the orchestrator HITL boundary; it prevents silent library mutations.
                pending_agent_creations.append({
                    "key": agent["_id"],
                    "name": agent["name"],
                    "description": agent["description"],
                    "skills": agent["default_skills"],
                    "reason": "No matching system or user-library agent was found.",
                })
                if not req.approve_new_agents:
                    agent_id = f"pending:{agent['_id']}"
                else:
                    result = await db["agents"].insert_one({
                        "name": agent["name"],
                        "description": agent["description"],
                        "agent_type": agent["agent_type"],
                        "remote_uri": agent["remote_uri"],
                        "default_skills": agent["default_skills"],
                        "created_by": str(current_user.id),
                        "is_system": False,
                        "generated_by": "project_orchestrator",
                        "created_at": datetime.utcnow(),
                    })
                    agent_id = str(result.inserted_id)
                    created_agents.append(agent["name"])
                name = agent["name"]
                description = agent["description"]
                skills = agent["default_skills"]
                agent_type = "local"
                remote_uri = None
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
                "requiresAgentCreationApproval": agent_id.startswith("pending:"),
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

    workflow_name = req.workflow_name.strip() or f"{modeling_skill.replace('-', ' ').title()} Pipeline"
    workflow_id = None
    if req.project_id:
        workflow_doc = {
            "project_id": req.project_id,
            "name": workflow_name,
            "description": req.prompt,
            "workflow_type": "orchestrator",
            "steps": [],
            "nodes": nodes,
            "edges": edges,
            "input_config": {
                "source_types": req.source_types,
                "source_files": req.source_files,
                "existing_model_files": req.existing_model_files,
                "standard_naming_notes": req.standard_naming_notes,
            },
            "orchestrator_state": {
                "prompt": req.prompt,
                "modeling_skill": modeling_skill,
                "created_agents": created_agents,
                "created_skills": created_skills,
                "pending_agent_creations": pending_agent_creations,
                "requires_hitl": True,
                "status": "planned",
            },
            "status": "draft",
            "created_by": str(current_user.id),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        stored = await db["workflows"].insert_one(workflow_doc)
        workflow_id = str(stored.inserted_id)
        await db["projects"].update_one({"_id": project["_id"]}, {"$set": {"workflow_mode": req.workflow_mode, "execution_flow": "custom", "updated_at": datetime.utcnow()}})
        await record_audit_event(db, user_id=str(current_user.id), action="workflow.orchestrator_planned", resource_type="workflow", resource_id=workflow_id, project_id=req.project_id, payload={"modeling_skill": modeling_skill, "requires_hitl": True})

    return OrchestratorPlanResponse(
        workflow_id=workflow_id,
        project_id=req.project_id,
        workflow_name=workflow_name,
        modeling_skill=modeling_skill,
        nodes=nodes,
        edges=edges,
        created_agents=created_agents,
        created_skills=created_skills,
        hitl_summary="Review every suggested agent node, update prompts/skills/inputs/A2A where needed, then run the pipeline.",
        workflow_mode=req.workflow_mode,
        requires_hitl=True,
        pending_agent_creations=pending_agent_creations,
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
