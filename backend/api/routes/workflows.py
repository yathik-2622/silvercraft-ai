from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List
from bson import ObjectId
from datetime import datetime
from database import get_db
from models.user import UserModel
from models.workflow import WorkflowModel, WorkflowCreate, WorkflowResponse, WorkflowStep
from api.routes.auth import get_current_user

router = APIRouter()

def _fmt(w: dict) -> WorkflowResponse:
    w = dict(w)
    w["id"] = str(w.pop("_id"))
    return WorkflowResponse(**w)

@router.post("/", response_model=WorkflowResponse, status_code=201)
async def create_workflow(wf: WorkflowCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    doc = WorkflowModel(**{**wf.model_dump(), "created_by": str(current_user.id)})
    result = await db["workflows"].insert_one(doc.model_dump(by_alias=True, exclude={"id"}))
    created = await db["workflows"].find_one({"_id": result.inserted_id})
    return _fmt(created)

@router.get("/project/{project_id}", response_model=List[WorkflowResponse])
async def get_project_workflows(project_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    cursor = db["workflows"].find({"project_id": project_id})
    wfs = await cursor.to_list(length=50)
    return [_fmt(w) for w in wfs]

@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(workflow_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workflow ID")
    wf = await db["workflows"].find_one({"_id": oid})
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _fmt(wf)

@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow_steps(workflow_id: str, steps: List[WorkflowStep] = Body(...), current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(workflow_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workflow ID")
    wf = await db["workflows"].find_one({"_id": oid})
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await db["workflows"].update_one(
        {"_id": oid},
        {"$set": {"steps": [s.model_dump() for s in steps], "updated_at": datetime.utcnow()}}
    )
    updated = await db["workflows"].find_one({"_id": oid})
    return _fmt(updated)

@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(workflow_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workflow ID")
    wf = await db["workflows"].find_one({"_id": oid})
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await db["workflows"].delete_one({"_id": oid})
