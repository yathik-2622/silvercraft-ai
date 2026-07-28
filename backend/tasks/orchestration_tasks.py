"""
Orchestration Celery tasks — per ADM_2.0_BUILD_SPEC.md §0 Principle 3.

Tasks:
  dispatch_stage_task   — run a stage-owner LangGraph subgraph asynchronously
  resume_gate_task      — resume from a specific step after HITL edit
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, List
from uuid import uuid4

from tasks.celery_app import celery_app


def _get_event_loop():
    """Get or create an event loop for the Celery worker thread."""
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def _run_async(coro):
    return _get_event_loop().run_until_complete(coro)


@celery_app.task(
    name="tasks.orchestration_tasks.dispatch_stage_task",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    acks_late=True,
)
def dispatch_stage_task(
    self,
    session_id: str,
    project_id: str,
    user_id: str,
    stage: str,
    instruction: str,
    context_refs: Dict[str, Any],
    directives: List[str],
    trace_id: str,
):
    """
    Celery task: Dispatch a stage agent asynchronously.
    On failure: retries up to 2 times, emits error trace event.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from config import settings
    from core.chat_orchestration import run_stage_agent
    from api.websocket import ws_manager

    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]

        result = _run_async(run_stage_agent(
            stage=stage,
            session_id=session_id,
            project_id=project_id,
            instruction=instruction,
            context_refs=context_refs,
            directives=directives,
            trace_id=trace_id,
            db=db,
        ))

        # Update agent_runs with result
        _run_async(db["agent_runs"].update_one(
            {"trace_id": trace_id},
            {"$set": {"status": "completed", "completed_at": datetime.utcnow(), "output": result.get("output", {})}},
        ))

        client.close()
        return {"status": "completed", "trace_id": trace_id}

    except Exception as exc:
        # Emit error trace event
        try:
            _run_async(ws_manager.send_trace(session_id, "error", {
                "code": "AGENT_TOOL_FAILURE",
                "message": str(exc),
                "stage": stage,
                "trace_id": trace_id,
                "retryable": self.request.retries < self.max_retries,
            }, trace_id))
        except Exception:
            pass
        raise self.retry(exc=exc)


@celery_app.task(
    name="tasks.orchestration_tasks.resume_gate_task",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    acks_late=True,
)
def resume_gate_task(
    self,
    session_id: str,
    project_id: str,
    user_id: str,
    gate: str,
    steps_to_rerun: List[str],
    directives: List[str],
    trace_id: str,
):
    """
    Celery task: Partial or full gate regeneration.
    Consults stage_step_dependencies.yaml to know which steps to re-run.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from config import settings
    from core.chat_orchestration import run_stage_agent

    # Gate → stage mapping
    gate_stage_map = {
        "G1": "source_analysis",
        "G2": "conceptual",
        "G3": "logical",
        "G4": "physical",
    }
    stage = gate_stage_map.get(gate, "source_analysis")

    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]

        instruction = f"Regenerate steps: {', '.join(steps_to_rerun)}. Focus only on updating these steps."
        context_refs = {"steps_to_rerun": steps_to_rerun}

        _run_async(run_stage_agent(
            stage=stage,
            session_id=session_id,
            project_id=project_id,
            instruction=instruction,
            context_refs=context_refs,
            directives=directives,
            trace_id=trace_id,
            db=db,
        ))
        client.close()
        return {"status": "completed", "gate": gate, "steps_rerun": steps_to_rerun}

    except Exception as exc:
        raise self.retry(exc=exc)
