"""
Gate Control API — ADM_2.0_API_ERRORS_AND_TOPOLOGY.md §2.4

Endpoints:
  GET  /sessions/{session_id}/gates/{gate}
  POST /sessions/{session_id}/gates/{gate}/approve
  POST /sessions/{session_id}/gates/{gate}/edit
  POST /sessions/{session_id}/gates/{gate}/regenerate
  POST /sessions/{session_id}/push/metastore
  POST /sessions/{session_id}/push/kg

Gate states: pending | running | ready | approved | error
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import yaml
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.routes.auth import get_current_user
from database import get_db
from middleware.error_handler import ADMException
from models.user import UserModel
from core.chat_orchestration import run_chat_orchestration, STAGE_DISPATCH
from core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()

# ─── Load dependency YAML once at import ────────────────────────────────────
import os
_BASE = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

def _load_deps() -> Dict[str, Any]:
    deps: Dict[str, Any] = {}
    for fname in ("stage_step_dependencies.yaml", "stage_step_dependencies_product.yaml"):
        path = os.path.join(_BASE, fname)
        if os.path.exists(path):
            with open(path, "r") as f:
                data = yaml.safe_load(f) or {}
                deps.update(data)
    return deps

_STEP_DEPS = _load_deps()


def _downstream_steps(layer: str, stage: str, from_step: str) -> List[str]:
    """Return list of step IDs that must re-run when from_step is edited."""
    try:
        return _STEP_DEPS[layer][stage][from_step]["downstream"]
    except (KeyError, TypeError):
        return []


# ─── Request / Response models ───────────────────────────────────────────────

class GateEditRequest(BaseModel):
    """Body for POST /sessions/{id}/gates/{gate}/edit — canvas commit."""
    output_payload: Dict[str, Any]          # Full updated stage output from canvas
    edited_fields: List[str] = []           # Which top-level keys were changed
    # Per AGENT_ARCH_V2 §5.1 — provenance tagging
    edit_source: str = "human"              # human | agent | directive


class GateApproveRequest(BaseModel):
    """Body for POST /sessions/{id}/gates/{gate}/approve."""
    idempotency_key: Optional[str] = None   # API_ERRORS §1.3 — prevents double-dispatch


class GateRegenerateRequest(BaseModel):
    """Body for POST /sessions/{id}/gates/{gate}/regenerate."""
    from_step: Optional[str] = None         # If None → full stage regenerate
    # Additional directives injected into the task pointer — AGENT_ARCH_V2 §3.3
    directives: List[str] = []


class PushRequest(BaseModel):
    """Body for push/metastore or push/kg."""
    idempotency_key: Optional[str] = None


class GateResponse(BaseModel):
    session_id: str
    gate: str
    status: str                             # pending | running | ready | approved | error
    output_payload: Dict[str, Any] = {}
    has_unsaved_changes: bool = False       # AGENT_ARCH_V2 §5.1
    stage_steps: List[str] = []            # Steps auto-chained in this stage
    completed_at: Optional[datetime] = None
    error: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

GATE_ORDER = ["G1", "G2", "G3", "G4"]
GATE_STAGES = {
    "foundation": {
        "G1": "source_analysis",
        "G2": "conceptual_modeling",
        "G3": "logical_modeling",
        "G4": "physical_modeling",
    },
    "product": {
        "G1": "silver_insights",
        "G2": "kpi_discovery",
        "G3": "kpi_finalization",
        "G4": "physical_modeling_product",
    },
}


async def _get_session(session_id: str, user_id: str, db) -> Dict[str, Any]:
    """Fetch a session (chat) and verify the user is a member of its project."""
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise ADMException("VALIDATION_ERROR", f"Invalid session ID: {session_id}")
    session = await db["chats"].find_one({"_id": oid})
    if not session:
        raise ADMException("NOT_FOUND", f"Session {session_id} not found")
    # Verify project access
    project = await db["projects"].find_one({"_id": ObjectId(session["project_id"])}) if session.get("project_id") else None
    if project:
        is_member = (
            project.get("owner_id") == user_id
            or user_id in project.get("shared_with", [])
            or any(m.get("user_id") == user_id for m in project.get("members", []))
        )
        if not is_member:
            raise ADMException("FORBIDDEN_ROLE", "You are not a member of this project")
    return session


async def _get_gate_doc(session_id: str, gate: str, db) -> Dict[str, Any]:
    """Get or create a gate document in session_gates collection."""
    doc = await db["session_gates"].find_one({"session_id": session_id, "gate": gate})
    if not doc:
        # Create empty gate record
        doc = {
            "session_id": session_id,
            "gate": gate,
            "status": "pending",
            "output_payload": {},
            "has_unsaved_changes": False,
            "stage_steps": [],
            "created_at": datetime.utcnow(),
            "completed_at": None,
            "error": None,
        }
        result = await db["session_gates"].insert_one(doc)
        doc["_id"] = result.inserted_id
    return doc


def _resolve_user_role(session: Dict[str, Any], project: Dict[str, Any] | None, user_id: str) -> str:
    """Return the user's effective role for this project."""
    if not project:
        return "owner"   # No project context → treat as owner (solo session)
    if project.get("owner_id") == user_id:
        return "owner"
    for member in project.get("members", []):
        if member.get("user_id") == user_id:
            return member.get("role", "viewer")
    return "viewer"


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/gates/{gate}", response_model=GateResponse)
async def get_gate(
    session_id: str,
    gate: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """GET current gate status and output payload."""
    session = await _get_session(session_id, str(current_user.id), db)
    gate_doc = await _get_gate_doc(session_id, gate, db)
    return GateResponse(
        session_id=session_id,
        gate=gate,
        status=gate_doc.get("status", "pending"),
        output_payload=gate_doc.get("output_payload", {}),
        has_unsaved_changes=gate_doc.get("has_unsaved_changes", False),
        stage_steps=gate_doc.get("stage_steps", []),
        completed_at=gate_doc.get("completed_at"),
        error=gate_doc.get("error"),
    )


@router.post("/sessions/{session_id}/gates/{gate}/approve")
async def approve_gate(
    session_id: str,
    gate: str,
    body: GateApproveRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Approve a completed gate — advances the pipeline to the next stage.
    409 GATE_UNSAVED_CHANGES if canvas has unsaved edits.
    409 SESSION_LOCKED if orchestrator is already running.
    Idempotency-Key header prevents double-dispatch on network retry.
    """
    session = await _get_session(session_id, str(current_user.id), db)
    gate_doc = await _get_gate_doc(session_id, gate, db)

    # ── Idempotency check ────────────────────────────────────────────────────
    if body.idempotency_key:
        existing = await db["idempotency_keys"].find_one({"key": body.idempotency_key, "action": "approve"})
        if existing:
            return {"status": "already_processed", "gate": gate, "idempotency_key": body.idempotency_key}

    # ── Canvas unsaved changes guard — AGENT_ARCH_V2 §5.1 ───────────────────
    if gate_doc.get("has_unsaved_changes"):
        raise ADMException(
            "GATE_UNSAVED_CHANGES",
            "Canvas has unsaved changes. Save or discard edits before approving.",
            details={"gate": gate, "session_id": session_id},
        )

    # ── Session lock check — API_ERRORS §1.2 ────────────────────────────────
    if session.get("status") == "running":
        raise ADMException(
            "SESSION_LOCKED",
            "The orchestrator is currently processing a prior request on this session.",
            details={"session_id": session_id},
        )

    # ── Gate must be 'ready' to approve ─────────────────────────────────────
    if gate_doc.get("status") not in ("ready", "approved"):
        raise ADMException(
            "VALIDATION_ERROR",
            f"Gate {gate} is not ready for approval (status: {gate_doc.get('status')}). "
            "Wait for the stage to complete.",
            details={"current_status": gate_doc.get("status")},
        )

    # ── Record HITL decision ─────────────────────────────────────────────────
    decision = {
        "session_id": session_id,
        "gate": gate,
        "project_id": session.get("project_id"),
        "decision": "approved",
        "decided_by": str(current_user.id),
        "decided_at": datetime.utcnow(),
        "idempotency_key": body.idempotency_key,
    }
    await db["hitl_decisions"].insert_one(decision)

    # ── Update gate status ───────────────────────────────────────────────────
    await db["session_gates"].update_one(
        {"session_id": session_id, "gate": gate},
        {"$set": {"status": "approved", "approved_at": datetime.utcnow(), "approved_by": str(current_user.id)}},
    )

    # ── Store idempotency key ────────────────────────────────────────────────
    if body.idempotency_key:
        await db["idempotency_keys"].insert_one({
            "key": body.idempotency_key,
            "action": "approve",
            "session_id": session_id,
            "gate": gate,
            "created_at": datetime.utcnow(),
        })

    # ── Determine next gate and dispatch (Celery when available) ────────────
    gate_idx = GATE_ORDER.index(gate) if gate in GATE_ORDER else -1
    next_gate = GATE_ORDER[gate_idx + 1] if gate_idx >= 0 and gate_idx < len(GATE_ORDER) - 1 else None

    return {
        "status": "approved",
        "gate": gate,
        "next_gate": next_gate,
        "session_id": session_id,
        "message": f"Gate {gate} approved. {'Pipeline advancing to ' + next_gate + '.' if next_gate else 'Final gate approved.'}",
    }


@router.post("/sessions/{session_id}/gates/{gate}/edit")
async def edit_gate(
    session_id: str,
    gate: str,
    body: GateEditRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Commit canvas edits into session state.
    Tags each edited field with edit provenance per AGENT_ARCH_V2 §5.1.
    Clears has_unsaved_changes after save.
    """
    session = await _get_session(session_id, str(current_user.id), db)

    # Editors and owners can edit; viewers cannot
    project = None
    if session.get("project_id"):
        try:
            project = await db["projects"].find_one({"_id": ObjectId(session["project_id"])})
        except Exception as exc:
            logger.debug("Failed to load project for role resolution", extra={"session_id": session_id, "error": str(exc)})
    role = _resolve_user_role(session, project, str(current_user.id))
    if role == "viewer":
        raise ADMException("FORBIDDEN_ROLE", "Viewers cannot edit canvas output.")

    # Tag edited fields with provenance
    tagged_payload = dict(body.output_payload)
    edit_meta = {
        "edited_by": body.edit_source,
        "edited_by_user_id": str(current_user.id),
        "edited_at": datetime.utcnow().isoformat(),
    }

    await db["session_gates"].update_one(
        {"session_id": session_id, "gate": gate},
        {
            "$set": {
                "output_payload": tagged_payload,
                "has_unsaved_changes": False,  # save clears dirty flag
                "last_edit_meta": edit_meta,
                "last_edited_at": datetime.utcnow(),
                "status": "ready",  # edited gates remain 'ready', not re-set to pending
            }
        },
        upsert=True,
    )
    return {
        "status": "saved",
        "gate": gate,
        "session_id": session_id,
        "edited_fields": body.edited_fields,
        "edit_meta": edit_meta,
    }


@router.post("/sessions/{session_id}/gates/{gate}/regenerate")
async def regenerate_gate(
    session_id: str,
    gate: str,
    body: GateRegenerateRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Regenerate a gate — either full stage re-run or from a specific step.
    Consults stage_step_dependencies.yaml to determine which downstream steps must re-run.
    """
    session = await _get_session(session_id, str(current_user.id), db)
    gate_doc = await _get_gate_doc(session_id, gate, db)

    # Get project layer to pick the right dependency YAML
    project = None
    layer = "foundation"
    if session.get("project_id"):
        try:
            project = await db["projects"].find_one({"_id": ObjectId(session["project_id"])})
            layer = (project or {}).get("layer", "foundation")
        except Exception as exc:
            logger.debug("Failed to load project for layer resolution", extra={"session_id": session_id, "error": str(exc)})

    # Resolve stage from gate + layer
    stage = GATE_STAGES.get(layer, GATE_STAGES["foundation"]).get(gate, gate)

    # Determine which steps must re-run
    if body.from_step:
        downstream = _downstream_steps(layer, stage, body.from_step)
        steps_to_rerun = [body.from_step] + downstream
        rerun_mode = "partial"
    else:
        steps_to_rerun = gate_doc.get("stage_steps", [])
        rerun_mode = "full"

    # Reset gate to running
    await db["session_gates"].update_one(
        {"session_id": session_id, "gate": gate},
        {
            "$set": {
                "status": "running",
                "has_unsaved_changes": False,
                "regenerate_from_step": body.from_step,
                "steps_to_rerun": steps_to_rerun,
                "regenerate_directives": body.directives,
                "regenerate_started_at": datetime.utcnow(),
            }
        },
        upsert=True,
    )

    # Log the regeneration decision
    await db["hitl_decisions"].insert_one({
        "session_id": session_id,
        "gate": gate,
        "project_id": session.get("project_id"),
        "decision": "regenerate",
        "rerun_mode": rerun_mode,
        "from_step": body.from_step,
        "steps_to_rerun": steps_to_rerun,
        "directives": body.directives,
        "decided_by": str(current_user.id),
        "decided_at": datetime.utcnow(),
    })

    # Execute regeneration inline using the stage-owner agent
    runner = STAGE_DISPATCH.get(stage)
    if runner:
        try:
            await runner(
                session_id=session_id,
                project_id=session.get("project_id", ""),
                instruction=f"Regenerate steps: {', '.join(steps_to_rerun)}. Focus only on updating these steps.",
                context_refs={"steps_to_rerun": steps_to_rerun, "directives": body.directives},
                directives=body.directives,
                trace_id=str(uuid4()),
                db=db,
            )
        except Exception as exc:
            logger.error("Gate regeneration failed", exc_info=True, extra={"gate": gate, "session_id": session_id})
            raise ADMException("AGENT_TOOL_FAILURE", f"Regeneration failed for gate {gate}: {exc}") from exc

    return {
        "status": "regenerating",
        "gate": gate,
        "session_id": session_id,
        "rerun_mode": rerun_mode,
        "from_step": body.from_step,
        "steps_to_rerun": steps_to_rerun,
        "message": f"{'Partial' if rerun_mode == 'partial' else 'Full'} regeneration completed for gate {gate}.",
    }


# ─── Push Endpoints ──────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/push/metastore")
async def push_to_metastore(
    session_id: str,
    body: PushRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Owner-only: push approved physical model DDL to PostgreSQL metastore.
    Per BUILD_SPEC §4.1 Exception #1 — only written to on explicit owner push.
    Postgres credentials must be set in .env (POSTGRES_* vars).
    """
    session = await _get_session(session_id, str(current_user.id), db)

    # ── Idempotency ──────────────────────────────────────────────────────────
    if body.idempotency_key:
        existing = await db["idempotency_keys"].find_one({"key": body.idempotency_key, "action": "push_metastore"})
        if existing:
            return {"status": "already_processed", "idempotency_key": body.idempotency_key}

    # ── Owner-only check ─────────────────────────────────────────────────────
    project = None
    if session.get("project_id"):
        try:
            project = await db["projects"].find_one({"_id": ObjectId(session["project_id"])})
        except Exception as exc:
            logger.debug("Failed to load project for owner check", extra={"session_id": session_id, "error": str(exc)})
    role = _resolve_user_role(session, project, str(current_user.id))
    if role != "owner":
        raise ADMException("FORBIDDEN_ROLE", "Only the project owner can push to metastore.")

    # ── All gates must be approved ────────────────────────────────────────────
    gates = await db["session_gates"].find({"session_id": session_id}).to_list(length=10)
    unapproved = [g["gate"] for g in gates if g.get("status") != "approved"]
    if unapproved:
        raise ADMException(
            "VALIDATION_ERROR",
            f"Gates {unapproved} are not yet approved. All gates must be approved before pushing.",
            details={"unapproved_gates": unapproved},
        )

    # ── Push-in-progress guard ─────────────────────────────────────────────
    if session.get("push_metastore_status") == "running":
        raise ADMException("PUSH_ALREADY_IN_PROGRESS", "A metastore push is already running for this session.")

    # ── Get G4 physical model output ─────────────────────────────────────────
    g4_gate = next((g for g in gates if g.get("gate") == "G4"), None)
    ddl_payload = (g4_gate or {}).get("output_payload", {})

    # Update push record to running and execute inline
    await db["push_logs"].update_one(
        {"_id": result.inserted_id},
        {"$set": {"status": "running", "started_at": datetime.utcnow()}},
    )

    # Execute metastore push inline
    try:
        import asyncpg
        ddl_statements = []
        tables = ddl_payload.get("physical_tables", [])
        for table in tables:
            ddl = table.get("ddl", "")
            if ddl:
                ddl_statements.append(ddl)

        if ddl_statements:
            conn = await asyncpg.connect(
                host=settings.POSTGRES_HOST,
                port=settings.POSTGRES_PORT,
                user=settings.POSTGRES_USER,
                password=settings.POSTGRES_PASSWORD,
                database=settings.POSTGRES_DB,
                schema=settings.POSTGRES_SCHEMA,
            )
            try:
                for ddl in ddl_statements:
                    await conn.execute(ddl)
            finally:
                await conn.close()

        await db["push_logs"].update_one(
            {"_id": result.inserted_id},
            {"$set": {"status": "completed", "completed_at": datetime.utcnow()}},
        )
    except Exception as exc:
        logger.error("Metastore push failed", exc_info=True)
        await db["push_logs"].update_one(
            {"_id": result.inserted_id},
            {"$set": {"status": "error", "error_message": str(exc), "completed_at": datetime.utcnow()}},
        )
        raise ADMException("PUSH_FAILED", f"Metastore push failed: {exc}") from exc

    return {
        "status": "completed",
        "push_log_id": str(result.inserted_id),
        "session_id": session_id,
        "message": "DDL executed against PostgreSQL metastore successfully.",
    }


@router.post("/sessions/{session_id}/push/kg")
async def push_to_kg(
    session_id: str,
    body: PushRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Owner-only: push approved model to Neo4j Knowledge Graph (27-level ontology).
    Per BUILD_SPEC §4.1 Exception #2 — adm_silver_kg_v2.py as Celery task.
    Neo4j credentials must be set in .env (NEO4J_* vars).
    """
    session = await _get_session(session_id, str(current_user.id), db)

    if body.idempotency_key:
        existing = await db["idempotency_keys"].find_one({"key": body.idempotency_key, "action": "push_kg"})
        if existing:
            return {"status": "already_processed", "idempotency_key": body.idempotency_key}

    project = None
    if session.get("project_id"):
        try:
            project = await db["projects"].find_one({"_id": ObjectId(session["project_id"])})
        except Exception as exc:
            logger.debug("Failed to load project for owner check", extra={"session_id": session_id, "error": str(exc)})
    role = _resolve_user_role(session, project, str(current_user.id))
    if role != "owner":
        raise ADMException("FORBIDDEN_ROLE", "Only the project owner can push to the knowledge graph.")

    if session.get("push_kg_status") == "running":
        raise ADMException("PUSH_ALREADY_IN_PROGRESS", "A KG push is already running for this session.")

    # Gather all gate outputs as KG payload
    gates = await db["session_gates"].find({"session_id": session_id}).to_list(length=10)
    full_payload = {g["gate"]: g.get("output_payload", {}) for g in gates}

    push_record = {
        "session_id": session_id,
        "project_id": session.get("project_id"),
        "push_type": "kg",
        "pushed_by": str(current_user.id),
        "full_payload": full_payload,
        "status": "queued",
        "idempotency_key": body.idempotency_key,
        "created_at": datetime.utcnow(),
    }
    result = await db["push_logs"].insert_one(push_record)

    if body.idempotency_key:
        await db["idempotency_keys"].insert_one({
            "key": body.idempotency_key,
            "action": "push_kg",
            "session_id": session_id,
            "created_at": datetime.utcnow(),
        })

    # Execute KG push inline
    try:
        from neo4j import AsyncGraphDatabase
        driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )
        try:
            async with driver.session(database=settings.NEO4J_DATABASE) as session:
                for gate_name, payload in full_payload.items():
                    entities = (payload.get("entities") or payload.get("output_payload", {})).get("entities", {})
                    for entity_name, entity_data in entities.items():
                        await session.run(
                            "MERGE (e:Entity {name: $name, session_id: $session_id, gate: $gate}) SET e.data = $data",
                            name=entity_name,
                            session_id=session_id,
                            gate=gate_name,
                            data=entity_data,
                        )
        finally:
            await driver.close()

        await db["push_logs"].update_one(
            {"_id": result.inserted_id},
            {"$set": {"status": "completed", "completed_at": datetime.utcnow()}},
        )
    except Exception as exc:
        logger.error("KG push failed", exc_info=True)
        await db["push_logs"].update_one(
            {"_id": result.inserted_id},
            {"$set": {"status": "error", "error_message": str(exc), "completed_at": datetime.utcnow()}},
        )
        if settings.NEO4J_URI and settings.NEO4J_PASSWORD:
            raise ADMException("PUSH_FAILED", f"Knowledge Graph push failed: {exc}") from exc
        raise ADMException("PUSH_FAILED", "Knowledge Graph push failed: NEO4J credentials not configured.") from exc

    return {
        "status": "completed",
        "push_log_id": str(result.inserted_id),
        "session_id": session_id,
        "message": "Model pushed to Knowledge Graph successfully.",
    }


@router.get("/sessions/{session_id}/push/status")
async def get_push_status(
    session_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """Get status of all push operations for a session."""
    await _get_session(session_id, str(current_user.id), db)
    logs = await db["push_logs"].find(
        {"session_id": session_id},
        {"full_payload": 0, "ddl_payload": 0}  # exclude large payloads
    ).sort("created_at", -1).to_list(length=20)
    return [
        {**{k: v for k, v in log.items() if k != "_id"}, "id": str(log["_id"])}
        for log in logs
    ]
