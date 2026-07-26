from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.routes.auth import get_current_user
from core.runtime_settings import (
    discover_models_for_user,
    get_user_runtime_settings,
    merge_settings_update,
    sanitize_user_settings,
)
from database import get_db
from models.user import UserModel

router = APIRouter()


class UpdateSettingsRequest(BaseModel):
    provider: str = Field(default="gateway")
    base_url: str = Field(default="")
    default_model: str = Field(default="gpt-4o")
    theme: str = Field(default="dark")
    api_key: str = Field(default="")
    openai_api_key: str = Field(default="")
    openrouter_api_key: str = Field(default="")
    groq_api_key: str = Field(default="")
    nvidia_api_key: str = Field(default="")


def _settings_response(stored: dict) -> dict:
    return {
        "provider": stored.get("provider", "gateway"),
        "base_url": stored.get("base_url", ""),
        "default_model": stored.get("default_model", "gpt-4o"),
        "theme": stored.get("theme", "dark"),
        **sanitize_user_settings(stored),
    }


@router.get("")
async def get_settings(current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    stored = await get_user_runtime_settings(db, str(current_user.id))
    return {"settings": _settings_response(stored)}


@router.put("")
async def update_settings(body: UpdateSettingsRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    existing = await get_user_runtime_settings(db, user_id)
    merged = merge_settings_update(existing, body.model_dump())
    merged["user_id"] = user_id
    await db["user_settings"].update_one({"user_id": user_id}, {"$set": merged}, upsert=True)
    stored = await get_user_runtime_settings(db, user_id)
    return {"settings": _settings_response(stored)}


@router.get("/models")
async def discover_models(current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    return await discover_models_for_user(db, str(current_user.id))
