"""Mongo-persisted canvas artifacts — editable, HITL-reviewable outputs per chat."""

from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.routes.auth import get_current_user
from api.routes.projects import _get_authorized_project
from database import get_db
from models.user import UserModel
from core.serialization import mongo_json

router = APIRouter()


# ── Pydantic schemas ────────────────────────────────────────────

class ArtifactCreate(BaseModel):
    chat_id: str
    title: str = "Agent output"
    stage: str = "1-source-analysis"
    content: str = ""
    status: str = Field(default="awaiting_hitl", pattern="^(awaiting_hitl|approved|rejected)$")
    agent_name: str = ""
    metadata: dict[str, Any] = {}


class ArtifactUpdate(BaseModel):
    content: str


class ArtifactStatusUpdate(BaseModel):
    status: str = Field(pattern="^(approved|rejected)$")
    comment: str = ""


class ArtifactResponse(BaseModel):
    id: str
    chat_id: str
    project_id: str
    title: str
    stage: str
    content: str
    status: str
    agent_name: str
    metadata: dict[str, Any]
    created_by: str
    created_at: datetime
    updated_at: datetime


# ── Helpers ──────────────────────────────────────────────────────

async def _artifact_for_user(artifact_id: str, user_id: str, db) -> dict:
    """Fetch an artifact and verify the user owns the parent chat's project."""
    try:
        artifact = await db["artifacts"].find_one({"_id": ObjectId(artifact_id)})
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid artifact ID") from exc
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    # Verify project access through the parent chat
    chat = await db["chats"].find_one({"_id": ObjectId(artifact["chat_id"])})
    if not chat:
        raise HTTPException(status_code=404, detail="Parent chat not found")
    await _get_authorized_project(chat["project_id"], user_id, db)
    return artifact


async def _chat_project_id(chat_id: str, user_id: str, db) -> str:
    """Return the project_id for a chat after verifying access."""
    try:
        chat = await db["chats"].find_one({"_id": ObjectId(chat_id)})
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid chat ID") from exc
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await _get_authorized_project(chat["project_id"], user_id, db)
    return chat["project_id"]


# ── Endpoints ────────────────────────────────────────────────────

@router.post("/chats/{chat_id}/artifacts", status_code=201, response_model=ArtifactResponse)
async def create_artifact(
    chat_id: str,
    body: ArtifactCreate,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    project_id = await _chat_project_id(chat_id, str(current_user.id), db)
    now = datetime.utcnow()
    doc = {
        "chat_id": chat_id,
        "project_id": project_id,
        "title": body.title,
        "stage": body.stage,
        "content": body.content,
        "status": body.status,
        "agent_name": body.agent_name,
        "metadata": body.metadata,
        "created_by": str(current_user.id),
        "created_at": now,
        "updated_at": now,
    }
    result = await db["artifacts"].insert_one(doc)
    return mongo_json(ArtifactResponse(id=str(result.inserted_id), **doc).model_dump())


@router.get("/chats/{chat_id}/artifacts", response_model=list[ArtifactResponse])
async def list_artifacts(
    chat_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    await _chat_project_id(chat_id, str(current_user.id), db)
    cursor = db["artifacts"].find({"chat_id": chat_id}).sort("created_at", 1)
    artifacts = await cursor.to_list(length=200)
    return [
        mongo_json(ArtifactResponse(id=str(a["_id"]), **{k: v for k, v in a.items() if k != "_id"}).model_dump())
        for a in artifacts
    ]


@router.put("/artifacts/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact_content(
    artifact_id: str,
    body: ArtifactUpdate,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    artifact = await _artifact_for_user(artifact_id, str(current_user.id), db)
    now = datetime.utcnow()
    await db["artifacts"].update_one(
        {"_id": artifact["_id"]},
        {"$set": {"content": body.content, "updated_at": now}},
    )
    artifact["content"] = body.content
    artifact["updated_at"] = now
    return ArtifactResponse(id=str(artifact["_id"]), **{k: v for k, v in artifact.items() if k != "_id"})


@router.put("/artifacts/{artifact_id}/status", response_model=ArtifactResponse)
async def update_artifact_status(
    artifact_id: str,
    body: ArtifactStatusUpdate,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    artifact = await _artifact_for_user(artifact_id, str(current_user.id), db)
    now = datetime.utcnow()
    await db["artifacts"].update_one(
        {"_id": artifact["_id"]},
        {"$set": {"status": body.status, "updated_at": now}},
    )
    # Also persist the decision to hitl_decisions for audit trail
    chat = await db["chats"].find_one({"_id": ObjectId(artifact["chat_id"])})
    if chat:
        await db["hitl_decisions"].insert_one({
            "workflow_id": artifact.get("metadata", {}).get("workflow_id", ""),
            "project_id": artifact.get("project_id", ""),
            "gate_id": artifact["stage"],
            "artifact_id": artifact_id,
            "decision": body.status,
            "comment": body.comment,
            "decided_by": str(current_user.id),
            "decided_at": now,
        })
    artifact["status"] = body.status
    artifact["updated_at"] = now
    return ArtifactResponse(id=str(artifact["_id"]), **{k: v for k, v in artifact.items() if k != "_id"})


@router.delete("/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(
    artifact_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    artifact = await _artifact_for_user(artifact_id, str(current_user.id), db)
    await db["artifacts"].delete_one({"_id": artifact["_id"]})
