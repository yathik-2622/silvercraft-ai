"""Persisted chat, HITL, and agent-run state used by the modeling workspace."""

from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.routes.auth import get_current_user
from api.routes.projects import _get_authorized_project
from core.audit import record_audit_event
from database import get_db
from models.user import UserModel

router = APIRouter()


class ChatCreate(BaseModel):
    title: str = "New modeling chat"
    workflow_id: str | None = None


class MessageCreate(BaseModel):
    sender: str = Field(pattern="^(user|assistant|system)$")
    text: str = Field(min_length=1)
    stage: str = "1-source-analysis"
    attachments: list[dict[str, Any]] = []
    requires_approval: bool = False


class HitlDecision(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|edited)$")
    comment: str = ""
    artifact: dict[str, Any] = {}


async def _chat_access(chat_id: str, user_id: str, db) -> dict:
    """Resolve a chat through its project so chats cannot be read cross-project."""
    try:
        oid = ObjectId(chat_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid chat ID") from exc
    chat = await db["chats"].find_one({"_id": oid})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await _get_authorized_project(chat["project_id"], user_id, db)
    return chat


@router.post("/projects/{project_id}/chats", status_code=201)
async def create_chat(project_id: str, body: ChatCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Create a new conversation while retaining the same project inputs."""
    await _get_authorized_project(project_id, str(current_user.id), db)
    now = datetime.utcnow()
    doc = {"project_id": project_id, "workflow_id": body.workflow_id, "title": body.title, "created_by": str(current_user.id), "messages": [], "created_at": now, "updated_at": now}
    result = await db["chats"].insert_one(doc)
    await record_audit_event(db, user_id=str(current_user.id), action="chat.created", resource_type="chat", resource_id=str(result.inserted_id), project_id=project_id)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)
    return doc


@router.get("/projects/{project_id}/chats")
async def list_chats(project_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Return chat history for the project, newest first."""
    await _get_authorized_project(project_id, str(current_user.id), db)
    chats = await db["chats"].find({"project_id": project_id}).sort("updated_at", -1).to_list(length=200)
    for chat in chats:
        chat["id"] = str(chat.pop("_id"))
    return chats


@router.post("/chats/{chat_id}/messages")
async def append_message(chat_id: str, body: MessageCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Append a message and keep the complete conversational transcript in MongoDB."""
    chat = await _chat_access(chat_id, str(current_user.id), db)
    message = {**body.model_dump(), "id": str(ObjectId()), "created_by": str(current_user.id), "created_at": datetime.utcnow()}
    await db["chats"].update_one({"_id": chat["_id"]}, {"$push": {"messages": message}, "$set": {"updated_at": datetime.utcnow()}})
    await record_audit_event(db, user_id=str(current_user.id), action="chat.message_added", resource_type="chat", resource_id=chat_id, project_id=chat["project_id"], payload={"sender": body.sender, "stage": body.stage})
    return message


@router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Load one full transcript for the chat sidebar or workspace."""
    chat = await _chat_access(chat_id, str(current_user.id), db)
    chat["id"] = str(chat.pop("_id"))
    return chat


@router.post("/workflows/{workflow_id}/hitl/{gate_id}")
async def decide_hitl(workflow_id: str, gate_id: str, body: HitlDecision, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Persist each stage approval/rejection/edit as an immutable gate decision."""
    try:
        workflow = await db["workflows"].find_one({"_id": ObjectId(workflow_id)})
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid workflow ID") from exc
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await _get_authorized_project(workflow["project_id"], str(current_user.id), db)
    gate = {"workflow_id": workflow_id, "project_id": workflow["project_id"], "gate_id": gate_id, **body.model_dump(), "decided_by": str(current_user.id), "decided_at": datetime.utcnow()}
    result = await db["hitl_decisions"].insert_one(gate)
    await db["workflows"].update_one({"_id": workflow["_id"]}, {"$set": {"orchestrator_state.last_hitl_gate": gate_id, "orchestrator_state.last_hitl_decision": body.decision, "updated_at": datetime.utcnow()}})
    await record_audit_event(db, user_id=str(current_user.id), action="hitl.decided", resource_type="hitl_decision", resource_id=str(result.inserted_id), project_id=workflow["project_id"], payload={"workflow_id": workflow_id, "gate_id": gate_id, "decision": body.decision})
    gate["id"] = str(result.inserted_id)
    gate.pop("_id", None)
    return gate


@router.post("/workflows/{workflow_id}/agent-runs", status_code=201)
async def create_agent_run(workflow_id: str, payload: dict[str, Any], current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Create a durable agent-run record before runtime execution begins."""
    try:
        workflow = await db["workflows"].find_one({"_id": ObjectId(workflow_id)})
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid workflow ID") from exc
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await _get_authorized_project(workflow["project_id"], str(current_user.id), db)
    run = {"workflow_id": workflow_id, "project_id": workflow["project_id"], "agent_id": payload.get("agent_id"), "stage": payload.get("stage"), "status": "queued", "input": payload.get("input", {}), "output": None, "created_by": str(current_user.id), "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
    result = await db["agent_runs"].insert_one(run)
    await record_audit_event(db, user_id=str(current_user.id), action="agent_run.queued", resource_type="agent_run", resource_id=str(result.inserted_id), project_id=workflow["project_id"], payload={"agent_id": run["agent_id"], "stage": run["stage"]})
    return {"id": str(result.inserted_id), **{key: value for key, value in run.items() if key != "_id"}}
