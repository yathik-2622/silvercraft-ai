"""A2A agent-card discovery and authenticated remote-agent invocation."""

from __future__ import annotations

from datetime import datetime
from urllib.parse import urljoin
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from api.routes.auth import get_current_user
from api.routes.projects import _get_authorized_project
from core.chat_orchestration import STAGE_AGENTS, run_chat_orchestration
from database import get_db
from models.user import UserModel
from config import settings

router = APIRouter()

AGENTS = {
    "source-analysis": ("Source Analysis Agent", "1-source-analysis"),
    "conceptual-modeling": ("Conceptual Modeling Agent", "2-conceptual"),
    "logical-modeling": ("Logical Modeling Agent", "3-logical"),
    "physical-data-modeling": ("Physical Data Modeling Agent", "4-physical-sttm"),
}


class A2AInvokeRequest(BaseModel):
    workflow_run_id: str = Field(min_length=1)
    from_agent: str = Field(min_length=1)
    message_type: str = "delegation"
    input_data: dict = Field(default_factory=dict)
    project_id: str | None = None
    workflow_id: str | None = None
    chat_id: str | None = None


def _base_url(request: Request) -> str:
    return (settings.A2A_PUBLIC_BASE_URL or str(request.base_url)).rstrip("/") + "/"


def _check_secret(secret: str | None) -> None:
    if settings.A2A_SHARED_SECRET and secret != settings.A2A_SHARED_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid A2A shared secret")


@router.get("/agents/{agent_id}/card")
async def agent_card(agent_id: str, request: Request):
    if agent_id not in AGENTS:
        raise HTTPException(status_code=404, detail="A2A agent not found")
    name, stage = AGENTS[agent_id]
    base_url = _base_url(request)
    return {
        "name": name,
        "description": STAGE_AGENTS[stage][1],
        "url": urljoin(base_url, f"api/v1/a2a/agents/{agent_id}"),
        "version": "1.0",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "authentication": {"schemes": ["apiKey"] if settings.A2A_SHARED_SECRET else []},
        "skills": [{"id": agent_id, "name": name, "description": STAGE_AGENTS[stage][1], "tags": ["data-modeling", stage]}],
    }


@router.post("/agents/{agent_id}/invoke")
async def invoke_agent(agent_id: str, body: A2AInvokeRequest, request: Request, x_a2a_secret: str | None = Header(default=None), current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    _check_secret(x_a2a_secret)
    if agent_id not in AGENTS:
        raise HTTPException(status_code=404, detail="A2A agent not found")
    if body.project_id:
        await _get_authorized_project(body.project_id, str(current_user.id), db)
    _, stage = AGENTS[agent_id]
    message_id = str(uuid4())
    await db["a2a_messages"].insert_one({"message_id": message_id, "workflow_run_id": body.workflow_run_id, "project_id": body.project_id, "from_agent": body.from_agent, "to_agent": agent_id, "message_type": body.message_type, "payload": body.input_data, "created_at": datetime.utcnow()})
    result = await run_chat_orchestration(db, str(current_user.id), {"prompt": body.input_data.get("prompt", "Continue the assigned modeling task."), "current_stage": stage, "project_id": body.project_id, "workflow_id": body.workflow_id, "chat_id": body.chat_id, "schema_context": body.input_data.get("schema_context", {}), "skills": body.input_data.get("skills", [])})
    return {"task_id": message_id, "status": {"state": "completed"}, "artifacts": [{"name": result["artifact"]["title"], "parts": [{"kind": "text", "text": result["reply"]}]}], "result": result}


@router.get("/runs/{workflow_run_id}/messages")
async def list_messages(workflow_run_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    messages = await db["a2a_messages"].find({"workflow_run_id": workflow_run_id}).sort("created_at", 1).to_list(length=500)
    project_ids = {message.get("project_id") for message in messages if message.get("project_id")}
    for project_id in project_ids:
        await _get_authorized_project(project_id, str(current_user.id), db)
    return [{**{key: value for key, value in message.items() if key != "_id"}, "id": str(message["_id"])} for message in messages]
