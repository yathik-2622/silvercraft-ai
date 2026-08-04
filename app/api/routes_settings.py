"""
User-level LLM runtime settings (BYOK) — GET/PUT the calling user's own
saved provider + keys, and a live model-catalog discovery endpoint. See
app/core/runtime_settings.py's module docstring for the encryption and
scope-boundary details; this file is just the thin HTTP layer over it.
"""
from fastapi import APIRouter, Depends

from app.core.auth import ADM_get_current_user_id
from app.core.runtime_settings import (
    ADM_discover_models_for_user,
    ADM_get_user_runtime_settings,
    ADM_merge_settings_update,
    ADM_sanitize_user_settings,
)
from app.db.collections import ADM_COLLECTION_USER_SETTINGS
from app.db.mongo_client import ADM_get_db
from app.models.schemas import ADM_UserSettingsUpdateRequest

router = APIRouter(prefix="/settings", tags=["settings"])


def ADM__public_settings_shape(stored: dict) -> dict:
    return {
        "provider": stored.get("provider", "gateway"),
        "base_url": stored.get("base_url", ""),
        "default_model": stored.get("default_model", ""),
        "embedding_model": stored.get("embedding_model", ""),
        **ADM_sanitize_user_settings(stored),
    }


@router.get("")
async def ADM_get_settings_route(current_user_id: str = Depends(ADM_get_current_user_id)):
    stored = await ADM_get_user_runtime_settings(current_user_id)
    return {"settings": ADM__public_settings_shape(stored)}


@router.put("")
async def ADM_update_settings_route(
    body: ADM_UserSettingsUpdateRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    db = ADM_get_db()
    existing = await ADM_get_user_runtime_settings(current_user_id)
    merged = ADM_merge_settings_update(existing, body.model_dump())
    merged["user_id"] = current_user_id
    await db[ADM_COLLECTION_USER_SETTINGS].update_one(
        {"user_id": current_user_id}, {"$set": merged}, upsert=True,
    )
    stored = await ADM_get_user_runtime_settings(current_user_id)
    return {"settings": ADM__public_settings_shape(stored)}


@router.get("/models")
async def ADM_discover_settings_models(current_user_id: str = Depends(ADM_get_current_user_id)):
    return await ADM_discover_models_for_user(current_user_id)
