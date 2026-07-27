from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.routes.auth import get_current_user
from core.marketplace_seed import MARKETPLACE_TEMPLATES
from database import get_db
from models.agent import AgentModel
from models.user import UserModel
from core.audit import record_audit_event

router = APIRouter()


class InstallTemplateRequest(BaseModel):
    custom_name: str | None = None
    custom_system_prompt: str | None = None


async def ensure_marketplace_templates(db):
    for template in MARKETPLACE_TEMPLATES:
        doc = {**template, "default_model_name": template.get("default_model_name", "gpt-4o")}
        await db["marketplace_templates"].update_one({"template_id": doc["template_id"]}, {"$set": doc}, upsert=True)


@router.get("/templates")
async def list_templates(search: str | None = Query(default=None), current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await ensure_marketplace_templates(db)
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"tags": {"$regex": search, "$options": "i"}},
            {"suggested_tools": {"$regex": search, "$options": "i"}},
        ]
    templates = await db["marketplace_templates"].find(query, {"_id": 0}).sort("name", 1).to_list(200)
    installed = await db["agents"].find(
        {"created_by": str(current_user.id), "template_id": {"$exists": True}, "is_system": False},
        {"_id": 0, "template_id": 1},
    ).to_list(500)
    installed_ids = {item["template_id"] for item in installed}
    for template in templates:
        template["installed"] = template["template_id"] in installed_ids
    return {"templates": templates, "count": len(templates)}


@router.get("/templates/{template_id}")
async def get_template(template_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await ensure_marketplace_templates(db)
    template = await db["marketplace_templates"].find_one({"template_id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template["installed"] = bool(await db["agents"].find_one({"created_by": str(current_user.id), "template_id": template_id, "is_system": False}))
    return template


@router.post("/templates/{template_id}/install", status_code=201)
async def install_template(template_id: str, body: InstallTemplateRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await ensure_marketplace_templates(db)
    template = await db["marketplace_templates"].find_one({"template_id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    existing = await db["agents"].find_one({"created_by": str(current_user.id), "template_id": template_id, "is_system": False})
    if existing and not body.custom_name and not body.custom_system_prompt:
        return {"id": str(existing["_id"]), "name": existing["name"], "already_installed": True}
    agent = AgentModel(
        name=body.custom_name or template["name"],
        description=template["description"],
        agent_type="local",
        default_skills=template.get("suggested_tools", []),
        is_system=False,
        created_by=str(current_user.id),
    ).model_dump(by_alias=True, exclude={"id"})
    agent.update({
        "template_id": template_id,
        "framework": template.get("framework", "langgraph"),
        "system_prompt": body.custom_system_prompt or template.get("default_system_prompt", ""),
        "model_name": template.get("default_model_name", "gpt-4o"),
        "tools": template.get("suggested_tools", []),
        "tags": template.get("tags", []),
        "hitl_enabled": template.get("hitl_enabled", False),
        "a2a_enabled": template.get("a2a_enabled", True),
        "created_at": datetime.utcnow(),
    })
    result = await db["agents"].insert_one(agent)
    await record_audit_event(db, user_id=str(current_user.id), action="marketplace.agent_installed", resource_type="agent", resource_id=str(result.inserted_id), payload={"template_id": template_id})
    return {"id": str(result.inserted_id), "name": agent["name"], "already_installed": False}
