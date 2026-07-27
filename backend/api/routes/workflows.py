"""Project-scoped workflow persistence for default, DIY, and orchestrator builders."""

from datetime import datetime
from typing import Any, List, Union

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from api.routes.auth import get_current_user
from api.routes.projects import _get_authorized_project
from core.audit import record_audit_event
from database import get_db
from models.user import UserModel
from models.workflow import WorkflowCreate, WorkflowModel, WorkflowResponse, WorkflowStep

router = APIRouter()
ALLOWED_WORKFLOW_TYPES = {"default", "diy", "orchestrator", "custom"}


class WorkflowCanvasUpdate(BaseModel):
    """Mutable canvas and runtime configuration persisted by the builder."""

    name: str | None = None
    description: str | None = None
    workflow_type: str | None = None
    steps: List[WorkflowStep] | None = None
    nodes: List[dict[str, Any]] | None = None
    edges: List[dict[str, Any]] | None = None
    input_config: dict[str, Any] | None = None
    orchestrator_state: dict[str, Any] | None = None
    status: str | None = None


def _fmt(workflow: dict) -> WorkflowResponse:
    """Convert Mongo's ObjectId into the API's stable string identifier."""
    value = dict(workflow)
    value["id"] = str(value.pop("_id"))
    return WorkflowResponse(**value)


async def _owned_or_shared_workflow(workflow_id: str, user_id: str, db) -> tuple[ObjectId, dict]:
    """Resolve a workflow only when its project is accessible to the current user."""
    try:
        oid = ObjectId(workflow_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid workflow ID") from exc
    workflow = await db["workflows"].find_one({"_id": oid})
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await _get_authorized_project(workflow["project_id"], user_id, db)
    return oid, workflow


@router.post("/", response_model=WorkflowResponse, status_code=201)
async def create_workflow(workflow: WorkflowCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Create a project workflow and enforce the fixed four-agent default limit."""
    await _get_authorized_project(workflow.project_id, str(current_user.id), db)
    workflow_type = workflow.workflow_type.lower()
    if workflow_type not in ALLOWED_WORKFLOW_TYPES:
        raise HTTPException(status_code=422, detail="workflow_type must be default, diy, or orchestrator")
    if workflow_type == "default" and len(workflow.nodes or workflow.steps) > 4:
        raise HTTPException(status_code=422, detail="Default workflow cannot contain more than four agents")
    payload = workflow.model_dump(exclude={"created_by"})
    payload["created_by"] = str(current_user.id)
    doc = WorkflowModel(**payload)
    result = await db["workflows"].insert_one(doc.model_dump(by_alias=True, exclude={"id"}))
    created = await db["workflows"].find_one({"_id": result.inserted_id})
    await record_audit_event(db, user_id=str(current_user.id), action="workflow.created", resource_type="workflow", resource_id=str(result.inserted_id), project_id=workflow.project_id, payload={"workflow_type": workflow_type})
    return _fmt(created)


@router.get("/project/{project_id}", response_model=List[WorkflowResponse])
async def get_project_workflows(project_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """List only workflows belonging to an accessible project."""
    await _get_authorized_project(project_id, str(current_user.id), db)
    workflows = await db["workflows"].find({"project_id": project_id}).sort("updated_at", -1).to_list(length=100)
    return [_fmt(workflow) for workflow in workflows]


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Return one workflow after checking project membership."""
    _, workflow = await _owned_or_shared_workflow(workflow_id, str(current_user.id), db)
    return _fmt(workflow)


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(workflow_id: str, body: Union[WorkflowCanvasUpdate, List[WorkflowStep]] = Body(...), current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Persist DIY canvas edits or orchestrator plans as an atomic workflow snapshot."""
    oid, existing = await _owned_or_shared_workflow(workflow_id, str(current_user.id), db)
    # Accept the legacy steps-array payload while exposing the richer canvas contract.
    update = {"steps": [step.model_dump() for step in body]} if isinstance(body, list) else body.model_dump(exclude_unset=True)
    workflow_type = update.get("workflow_type", existing.get("workflow_type", "default")).lower()
    if workflow_type not in ALLOWED_WORKFLOW_TYPES:
        raise HTTPException(status_code=422, detail="workflow_type must be default, diy, or orchestrator")
    node_count = len(update.get("nodes", existing.get("nodes", []))) or len(update.get("steps", existing.get("steps", [])))
    if workflow_type == "default" and node_count > 4:
        raise HTTPException(status_code=422, detail="Default workflow cannot contain more than four agents")
    update["workflow_type"] = workflow_type
    update["updated_at"] = datetime.utcnow()
    await db["workflows"].update_one({"_id": oid}, {"$set": update})
    updated = await db["workflows"].find_one({"_id": oid})
    await record_audit_event(db, user_id=str(current_user.id), action="workflow.updated", resource_type="workflow", resource_id=workflow_id, project_id=existing["project_id"], payload={"fields": list(update.keys())})
    return _fmt(updated)


@router.put("/{workflow_id}/steps", response_model=WorkflowResponse)
async def update_workflow_steps(workflow_id: str, steps: List[WorkflowStep] = Body(...), current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Retain the original steps-only contract for existing clients."""
    return await update_workflow(workflow_id, WorkflowCanvasUpdate(steps=steps), current_user, db)


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Delete a workflow only through its project authorization boundary."""
    oid, existing = await _owned_or_shared_workflow(workflow_id, str(current_user.id), db)
    if existing.get("created_by") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the workflow creator can delete it")
    await db["workflows"].delete_one({"_id": oid})
    await record_audit_event(db, user_id=str(current_user.id), action="workflow.deleted", resource_type="workflow", resource_id=workflow_id, project_id=existing["project_id"])
