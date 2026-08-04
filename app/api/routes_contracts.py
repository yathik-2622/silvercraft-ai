"""
Execution Contract endpoints — TDS §5 rows 4-9. Every route is JWT-scoped:
ownership is resolved by looking up the contract's project_id and
confirming current_user_id owns it — one real DB join, no client-supplied
ownership claims trusted anywhere.
"""
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.celery_app.tasks import ADM_execute_contract_task, ADM_resume_contract_task, ADM_git_push_task
from app.core.auth import ADM_get_current_user_id
from app.core.ownership import ADM_assert_project_access
from app.db.mongo_client import ADM_get_db
from app.db.collections import (
    ADM_COLLECTION_EXECUTION_CONTRACTS, ADM_COLLECTION_RUN_STATE,
    ADM_COLLECTION_PROVENANCE_REPORTS, ADM_COLLECTION_ARTIFACT_REGISTRY,
)
from app.models.schemas import ADM_CommentCreateRequest, ADM_ContractPatchRequest, ADM_HitlResolveRequest, ADM_PlanComment, ADM_now

router = APIRouter(prefix="/contracts", tags=["contracts"])


async def ADM__get_owned_contract(contract_id: str, current_user_id: str) -> dict:
    """Fetches the contract, then asserts the caller owns its project.
    Every route below funnels through this — one place ownership is
    checked, always against Mongo, never against anything the client sent."""
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_EXECUTION_CONTRACTS].find_one({"contract_id": contract_id})
    if not doc:
        raise HTTPException(404, "Contract not found")
    await ADM_assert_project_access(doc["project_id"], current_user_id)
    return doc


@router.get("")
async def ADM_list_contracts(
    project_id: str, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Real DB query — GET /contracts?project_id=... — the "list contracts"
    endpoint that used to be a UI-side gap. Scoped to a project the caller
    owns, ordered newest first."""
    await ADM_assert_project_access(project_id, current_user_id)
    db = ADM_get_db()
    docs = await db[ADM_COLLECTION_EXECUTION_CONTRACTS].find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=200)
    return docs


@router.get("/{contract_id}")
async def ADM_get_contract(contract_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    doc = await ADM__get_owned_contract(contract_id, current_user_id)
    doc.pop("_id", None)
    return doc


@router.patch("/{contract_id}")
async def ADM_patch_contract(
    contract_id: str, body: ADM_ContractPatchRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Row 4: plain write, no Celery. Rejected once the contract is immutable/approved."""
    doc = await ADM__get_owned_contract(contract_id, current_user_id)
    if doc.get("immutable"):
        raise HTTPException(409, "Contract is approved and immutable; cannot edit")

    db = ADM_get_db()
    update = {}
    if body.stages is not None:
        update["stages"] = {k: [t.model_dump() for t in v] for k, v in body.stages.items()}
    if update:
        await db[ADM_COLLECTION_EXECUTION_CONTRACTS].update_one({"contract_id": contract_id}, {"$set": update})
    return await ADM_get_contract(contract_id, current_user_id)


@router.post("/{contract_id}/approve")
async def ADM_approve_contract(contract_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Row 5: denormalize into an immutable, pinned contract; enqueue execute_contract_task."""
    await ADM__get_owned_contract(contract_id, current_user_id)
    db = ADM_get_db()
    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].update_one(
        {"contract_id": contract_id},
        {"$set": {"status": "approved", "immutable": True, "approved_at": ADM_now()}},
    )
    ADM_execute_contract_task.delay(contract_id)
    return {"status": "approved", "contract_id": contract_id}


@router.get("/{contract_id}/status")
async def ADM_get_status(contract_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    contract = await ADM__get_owned_contract(contract_id, current_user_id)
    contract.pop("_id", None)
    db = ADM_get_db()
    run_state = await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": contract_id}, {"_id": 0})
    return {"contract": contract, "run_state": run_state}


@router.get("/{contract_id}/hitl/pending")
async def ADM_get_pending_hitl(contract_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    await ADM__get_owned_contract(contract_id, current_user_id)
    db = ADM_get_db()
    run_state = await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": contract_id}, {"_id": 0})
    if not run_state:
        raise HTTPException(404, "No run state for contract")
    pending = [g for g in run_state.get("hitl_gates", []) if g["status"] == "pending"]
    task_results = run_state.get("task_results", {})
    return {"pending": pending, "task_results": {
        g["task_id"]: task_results.get(g["task_id"]) for g in pending
    }}


@router.post("/{contract_id}/hitl/{task_id}/approve")
async def ADM_hitl_approve(
    contract_id: str, task_id: str, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Row 6g: approve — final. Enqueues resume_contract_task."""
    await ADM__get_owned_contract(contract_id, current_user_id)
    db = ADM_get_db()
    run_state = await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": contract_id})
    if not run_state:
        raise HTTPException(404, "No run state for contract")

    gates = run_state.get("hitl_gates", [])
    found = False
    for g in gates:
        if g["task_id"] == task_id:
            g["status"] = "approved"
            found = True
    if not found:
        raise HTTPException(404, "No such pending HITL gate for this task")

    await db[ADM_COLLECTION_RUN_STATE].update_one(
        {"contract_id": contract_id}, {"$set": {"hitl_gates": gates, "updated_at": ADM_now()}}
    )
    ADM_resume_contract_task.delay(contract_id)
    return {"status": "approved", "task_id": task_id}


@router.post("/{contract_id}/hitl/{task_id}/edit")
async def ADM_hitl_edit(
    contract_id: str, task_id: str, body: ADM_HitlResolveRequest,
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    """Row 6g: edit — NEW snapshot, user_override: true, original untouched."""
    await ADM__get_owned_contract(contract_id, current_user_id)
    db = ADM_get_db()
    run_state = await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": contract_id})
    if not run_state:
        raise HTTPException(404, "No run state for contract")
    if body.edited_output is None:
        raise HTTPException(400, "edited_output is required for an edit resolution")

    gates = run_state.get("hitl_gates", [])
    found = False
    for g in gates:
        if g["task_id"] == task_id:
            g["status"] = "edited"
            g["result_snapshot"] = body.edited_output
            g["user_override"] = True
            found = True
    if not found:
        raise HTTPException(404, "No such pending HITL gate for this task")

    task_results = run_state.get("task_results", {})
    original = task_results.get(task_id, {})
    task_results[task_id] = {**original, "output": body.edited_output, "user_override": True}

    await db[ADM_COLLECTION_RUN_STATE].update_one(
        {"contract_id": contract_id},
        {"$set": {"hitl_gates": gates, "task_results": task_results, "updated_at": ADM_now()}},
    )
    ADM_resume_contract_task.delay(contract_id)
    return {"status": "edited", "task_id": task_id}


@router.get("/{contract_id}/provenance")
async def ADM_get_provenance(contract_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    await ADM__get_owned_contract(contract_id, current_user_id)
    db = ADM_get_db()
    report = await db[ADM_COLLECTION_PROVENANCE_REPORTS].find_one(
        {"contract_id": contract_id}, {"_id": 0}, sort=[("generated_at", -1)]
    )
    if not report:
        raise HTTPException(404, "No provenance report yet — run may not be complete")
    return report


@router.post("/{contract_id}/comments")
async def ADM_add_plan_comment(
    contract_id: str, body: ADM_CommentCreateRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """
    Free-text comment on the Plan — any project member can comment,
    including after approval (a comment on an approved/running contract
    is a normal thing to want, e.g. explaining an edit) — this is
    deliberately not blocked by `immutable`, unlike PATCH /contracts/{id}'s
    stage edits, which are.
    """
    await ADM__get_owned_contract(contract_id, current_user_id)
    comment = ADM_PlanComment(author_user_id=current_user_id, text=body.text)
    db = ADM_get_db()
    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].update_one(
        {"contract_id": contract_id}, {"$push": {"comments": comment.model_dump()}}
    )
    return comment


@router.get("/{contract_id}/download")
async def ADM_download_artifact(contract_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Row 9: direct file response, no Celery."""
    await ADM__get_owned_contract(contract_id, current_user_id)
    db = ADM_get_db()
    artifact = await db[ADM_COLLECTION_ARTIFACT_REGISTRY].find_one({"contract_id": contract_id}, {"_id": 0})
    if not artifact or not os.path.exists(artifact["local_path"]):
        raise HTTPException(404, "No downloadable artifact yet")
    return FileResponse(artifact["local_path"], filename=artifact["filename"])


@router.post("/{contract_id}/push-to-git")
async def ADM_push_to_git(
    contract_id: str, repo_path: str, remote_url: str = "", branch: str = "main",
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    """Row 8: enqueues git_push_task (stateless)."""
    await ADM__get_owned_contract(contract_id, current_user_id)
    ADM_git_push_task.delay(contract_id, repo_path, remote_url, branch)
    return {"status": "enqueued", "contract_id": contract_id}
