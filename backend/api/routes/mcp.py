"""Small authenticated MCP JSON-RPC endpoint for modeling skills and project context."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.routes.auth import get_current_user
from api.routes.projects import _get_authorized_project
from api.routes.skills import _ensure_industry_skills
from database import get_db
from models.user import UserModel

router = APIRouter()


class JsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str | int | None = None
    method: str
    params: dict = {}


def _result(request: JsonRpcRequest, value: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request.id, "result": value}


@router.post("")
async def mcp(request: JsonRpcRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    if request.jsonrpc != "2.0":
        raise HTTPException(status_code=400, detail="MCP requires JSON-RPC 2.0")
    method = request.method
    if method in {"tools/call", "resources/read", "prompts/list"}:
        await _ensure_industry_skills(db)
    if method == "initialize":
        return _result(request, {"protocolVersion": "2025-06-18", "capabilities": {"tools": {"listChanged": False}, "resources": {"subscribe": False, "listChanged": False}, "prompts": {"listChanged": False}}, "serverInfo": {"name": "silvercraft-modeling", "version": "1.0.0"}})
    if method == "tools/list":
        return _result(request, {"tools": [{"name": "list_industry_skills", "description": "List approved data-modeling SKILL.md templates.", "inputSchema": {"type": "object", "properties": {}}}, {"name": "get_project_context", "description": "Read project context after access control.", "inputSchema": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}]})
    if method == "tools/call":
        name = request.params.get("name")
        args = request.params.get("arguments") or {}
        if name == "list_industry_skills":
            rows = await db["skills"].find({"created_by": None}, {"name": 1, "description": 1, "content": 1}).to_list(length=100)
            text = "\n\n".join(f"# {row['name']}\n{row.get('description', '')}\n{row.get('content', '')}" for row in rows)
            return _result(request, {"content": [{"type": "text", "text": text or "No skills installed."}]})
        if name == "get_project_context":
            _, project = await _get_authorized_project(args.get("project_id", ""), str(current_user.id), db)
            safe = {key: project.get(key) for key in ("name", "description", "domain", "sub_domain", "layer", "naming_rules", "source_connects")}
            return _result(request, {"content": [{"type": "text", "text": str(safe)}]})
        return _result(request, {"content": [{"type": "text", "text": f"Unknown tool: {name}"}], "isError": True})
    if method == "resources/list":
        return _result(request, {"resources": [{"uri": "silvercraft://skills/industry", "name": "Industry modeling skills", "mimeType": "text/markdown"}]})
    if method == "resources/read":
        if request.params.get("uri") != "silvercraft://skills/industry":
            return _result(request, {"contents": []})
        rows = await db["skills"].find({"created_by": None}, {"name": 1, "content": 1}).to_list(length=100)
        text = "\n\n".join(f"# {row['name']}\n{row.get('content', '')}" for row in rows)
        return _result(request, {"contents": [{"uri": "silvercraft://skills/industry", "mimeType": "text/markdown", "text": text}]})
    if method == "prompts/list":
        rows = await db["skills"].find({"created_by": None}, {"name": 1, "description": 1}).to_list(length=100)
        return _result(request, {"prompts": [{"name": row["name"], "description": row.get("description", "")} for row in rows]})
    if method == "notifications/initialized":
        return {"jsonrpc": "2.0", "id": request.id, "result": {}}
    return _result(request, {"error": {"code": -32601, "message": f"Method not found: {method}"}})
