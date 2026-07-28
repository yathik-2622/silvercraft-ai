"""Mongo-persisted chat conversations and HITL decisions for the chat-first studio."""

from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.routes.auth import get_current_user
from api.routes.projects import _get_authorized_project
from database import get_db
from models.user import UserModel

router = APIRouter()


class ChatCreate(BaseModel):
    title: str = "Modeling conversation"
    workflow_id: str | None = None


class MessageCreate(BaseModel):
    sender: str = Field(pattern="^(user|assistant|system)$")
    text: str = Field(min_length=1, max_length=50000)
    stage: str = "1-source-analysis"


class ChatUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=160)


class HitlDecision(BaseModel):
    decision: str = Field(pattern="^(approved|rejected|edited)$")
    comment: str = ""
    artifact: dict[str, Any] = {}


async def _chat_for_user(chat_id: str, user_id: str, db) -> dict:
    try:
        chat = await db["chats"].find_one({"_id": ObjectId(chat_id)})
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid chat ID") from exc
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await _get_authorized_project(chat["project_id"], user_id, db)
    return chat


@router.post("/projects/{project_id}/chats", status_code=201)
async def create_chat(project_id: str, body: ChatCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await _get_authorized_project(project_id, str(current_user.id), db)
    now = datetime.utcnow()
    doc = {"project_id": project_id, "workflow_id": body.workflow_id, "title": body.title, "created_by": str(current_user.id), "messages": [], "created_at": now, "updated_at": now}
    result = await db["chats"].insert_one(doc)
    return {"id": str(result.inserted_id), **doc}


@router.get("/projects/{project_id}/chats")
async def list_chats(project_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await _get_authorized_project(project_id, str(current_user.id), db)
    chats = await db["chats"].find({"project_id": project_id}).sort("updated_at", -1).to_list(length=100)
    return [{"id": str(chat["_id"]), "title": chat["title"], "workflow_id": chat.get("workflow_id"), "updated_at": chat["updated_at"]} for chat in chats]


@router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    return {"id": str(chat["_id"]), "project_id": chat["project_id"], "title": chat["title"], "messages": chat.get("messages", []), "attachments": chat.get("attachments", []), "preferences": chat.get("preferences", {}), "updated_at": chat["updated_at"]}


@router.get("/chats/{chat_id}/history")
async def get_chat_history(chat_id: str, limit: int = 200, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    """Return chronological persisted conversation history for a single chat."""
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    safe_limit = max(1, min(limit, 500))
    messages = chat.get("messages", [])[-safe_limit:]
    return {"chat_id": chat_id, "title": chat["title"], "messages": messages, "count": len(messages)}


@router.put("/chats/{chat_id}")
async def rename_chat(chat_id: str, body: ChatUpdate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    if chat.get("created_by") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the chat creator can rename it")
    await db["chats"].update_one({"_id": chat["_id"]}, {"$set": {"title": body.title.strip(), "updated_at": datetime.utcnow()}})
    return {"id": chat_id, "title": body.title.strip()}


@router.delete("/chats/{chat_id}", status_code=204)
async def delete_chat(chat_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    if chat.get("created_by") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the chat creator can delete it")
    await db["chats"].delete_one({"_id": chat["_id"]})


@router.get("/projects/{project_id}/agent-runs")
async def list_agent_runs(project_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await _get_authorized_project(project_id, str(current_user.id), db)
    runs = await db["agent_runs"].find({"project_id": project_id}).sort("created_at", -1).to_list(length=200)
    return [{**{key: value for key, value in run.items() if key != "_id"}, "id": str(run["_id"])} for run in runs]


@router.post("/chats/{chat_id}/messages", status_code=201)
async def append_message(chat_id: str, body: MessageCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    message = {"id": str(ObjectId()), **body.model_dump(), "created_at": datetime.utcnow(), "created_by": str(current_user.id)}
    await db["chats"].update_one({"_id": chat["_id"]}, {"$push": {"messages": message}, "$set": {"updated_at": datetime.utcnow()}})
    return message


@router.post("/workflows/{workflow_id}/hitl/{gate_id}", status_code=201)
async def decide_hitl(workflow_id: str, gate_id: str, body: HitlDecision, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        workflow = await db["workflows"].find_one({"_id": ObjectId(workflow_id)})
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid workflow ID") from exc
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await _get_authorized_project(workflow["project_id"], str(current_user.id), db)
    decision = {"workflow_id": workflow_id, "project_id": workflow["project_id"], "gate_id": gate_id, **body.model_dump(), "decided_by": str(current_user.id), "decided_at": datetime.utcnow()}
    result = await db["hitl_decisions"].insert_one(decision)
    return {"id": str(result.inserted_id), **decision}


# ── Chat Attachments ─────────────────────────────────────────────


class AttachmentLink(BaseModel):
    file_id: str
    filename: str
    content_type: str = "application/octet-stream"
    size: int = 0


@router.post("/chats/{chat_id}/attachments", status_code=201)
async def attach_file_to_chat(chat_id: str, body: AttachmentLink, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    attachment = {
        "file_id": body.file_id,
        "filename": body.filename,
        "content_type": body.content_type,
        "size": body.size,
        "attached_by": str(current_user.id),
        "attached_at": datetime.utcnow(),
    }
    await db["chats"].update_one(
        {"_id": chat["_id"]},
        {"$push": {"attachments": attachment}, "$set": {"updated_at": datetime.utcnow()}},
    )
    return attachment


@router.get("/chats/{chat_id}/attachments")
async def list_chat_attachments(chat_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    return chat.get("attachments", [])


@router.delete("/chats/{chat_id}/attachments/{file_id}", status_code=204)
async def remove_chat_attachment(chat_id: str, file_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    await db["chats"].update_one(
        {"_id": chat["_id"]},
        {"$pull": {"attachments": {"file_id": file_id}}, "$set": {"updated_at": datetime.utcnow()}},
    )


# ── Per-Chat Preferences (model selection, etc.) ─────────────────


class ChatPreferences(BaseModel):
    model_name: str | None = None


@router.patch("/chats/{chat_id}/preferences")
async def update_chat_preferences(chat_id: str, body: ChatPreferences, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    chat = await _chat_for_user(chat_id, str(current_user.id), db)
    prefs = chat.get("preferences", {})
    if body.model_name is not None:
        prefs["model_name"] = body.model_name
    await db["chats"].update_one(
        {"_id": chat["_id"]},
        {"$set": {"preferences": prefs, "updated_at": datetime.utcnow()}},
    )
    return {"id": chat_id, "preferences": prefs}
