import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

import httpx

from config import settings

PROVIDER_DEFAULTS = {
    "platform": {"base_url": settings.LLM_BASE_URL, "label": "Platform Provider"},
    "gateway": {"base_url": settings.LLM_BASE_URL, "label": "Gateway"},
    "custom": {"base_url": settings.LLM_BASE_URL, "label": "Custom Gateway"},
    "openai": {"base_url": "https://api.openai.com/v1", "label": "OpenAI"},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "label": "OpenRouter"},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "label": "Groq"},
    "nvidia": {"base_url": "https://integrate.api.nvidia.com/v1", "label": "NVIDIA"},
}

FALLBACK_MODELS = [
    {"id": "gpt-4o", "name": "GPT-4o", "provider": "gateway", "free": False},
    {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "gateway", "free": False},
    {"id": "gpt-4.1", "name": "GPT-4.1", "provider": "gateway", "free": False},
    {"id": "gpt-4.1-mini", "name": "GPT-4.1 Mini", "provider": "gateway", "free": False},
    {"id": "gpt-5", "name": "GPT-5", "provider": "gateway", "free": False},
    {"id": "gpt-5-mini", "name": "GPT-5 Mini", "provider": "gateway", "free": False},
    {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B Versatile", "provider": "groq", "free": False},
    {"id": "meta/llama-3.1-405b-instruct", "name": "Llama 3.1 405B Instruct", "provider": "openrouter", "free": False},
]

MASKED_FIELDS = {
    "api_key",
    "openai_api_key",
    "openrouter_api_key",
    "groq_api_key",
    "nvidia_api_key",
}


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}{'*' * max(4, len(value) - 8)}{value[-4:]}"


def _normalize_provider(provider: Optional[str]) -> str:
    value = (provider or "platform").strip().lower()
    return value if value in PROVIDER_DEFAULTS else "platform"


async def get_user_runtime_settings(db, user_id: str | None) -> dict:
    if not user_id:
        return {}
    doc = await db["user_settings"].find_one({"user_id": user_id}, {"_id": 0})
    return doc or {}


def sanitize_user_settings(doc: dict) -> dict:
    safe = dict(doc or {})
    for field in MASKED_FIELDS:
        if safe.get(field):
            safe[f"{field}_configured"] = True
            safe[f"{field}_masked"] = _mask_secret(safe[field])
        safe.pop(field, None)
    return safe


def _provider_api_key(provider: str, settings_doc: dict) -> str:
    if provider == "openai":
        return (settings_doc.get("openai_api_key") or settings_doc.get("api_key") or settings.LLM_API_KEY).strip()
    if provider == "openrouter":
        return (settings_doc.get("openrouter_api_key") or "").strip()
    if provider == "groq":
        return (settings_doc.get("groq_api_key") or "").strip()
    if provider == "nvidia":
        return (settings_doc.get("nvidia_api_key") or "").strip()
    return (settings_doc.get("api_key") or settings.LLM_API_KEY).strip()


def _provider_base_url(provider: str, settings_doc: dict) -> str:
    if provider in {"custom", "gateway", "platform"}:
        return (settings_doc.get("base_url") or settings.LLM_BASE_URL).strip()
    return PROVIDER_DEFAULTS[provider]["base_url"].strip()


async def resolve_llm_runtime(db, user_id: str | None = None) -> dict:
    settings_doc = await get_user_runtime_settings(db, user_id)
    provider = _normalize_provider(settings_doc.get("provider"))
    default_model = (settings_doc.get("default_model") or settings.LLM_MODEL).strip() or settings.LLM_MODEL
    return {
        "provider": provider,
        "provider_label": PROVIDER_DEFAULTS[provider]["label"],
        "base_url": _provider_base_url(provider, settings_doc),
        "api_key": _provider_api_key(provider, settings_doc),
        "default_model": default_model,
    }


def _to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except (InvalidOperation, TypeError):
        return Decimal("0")


def _normalize_model_item(raw: dict, provider: str) -> dict:
    model_id = raw.get("id") or raw.get("name") or ""
    name = raw.get("name") or model_id
    pricing = raw.get("pricing") or {}
    free = all(_to_decimal(pricing.get(field)) == 0 for field in ("prompt", "completion", "request", "image"))
    context_length = raw.get("context_length") or raw.get("top_provider", {}).get("context_length")
    return {
        "id": model_id,
        "value": model_id,
        "name": name,
        "label": name,
        "provider": provider,
        "context_length": context_length,
        "description": raw.get("description") or "",
        "free": free,
        "supports_tools": "tools" in (raw.get("supported_parameters") or []),
        "pricing": pricing,
    }


async def discover_provider_models(provider: str, api_key: str = "", base_url: str = "", timeout_seconds: float = 20.0) -> dict:
    normalized_provider = _normalize_provider(provider)
    effective_base_url = (base_url or PROVIDER_DEFAULTS[normalized_provider]["base_url"]).rstrip("/")
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
        response = await client.get(f"{effective_base_url}/models", headers=headers)
        response.raise_for_status()
        payload = response.json()
    items = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        items = []
    models = [_normalize_model_item(item, normalized_provider) for item in items if isinstance(item, dict) and item.get("id")]
    models.sort(key=lambda item: (not item["free"], item["name"].lower()))
    return {"provider": normalized_provider, "base_url": effective_base_url, "count": len(models), "models": models}


async def discover_models_for_user(db, user_id: str | None = None) -> dict:
    runtime = await resolve_llm_runtime(db, user_id)
    try:
        result = await discover_provider_models(runtime["provider"], runtime["api_key"], runtime["base_url"])
        return {**result, "default": runtime["default_model"], "provider_label": runtime["provider_label"]}
    except Exception as exc:
        return {
            "provider": runtime["provider"],
            "provider_label": runtime["provider_label"],
            "base_url": runtime["base_url"],
            "default": runtime["default_model"],
            "count": len(FALLBACK_MODELS),
            "models": FALLBACK_MODELS,
            "fallback": True,
            "error": str(exc),
        }


def merge_settings_update(existing: dict, updates: dict) -> dict:
    merged = dict(existing or {})
    for key, value in (updates or {}).items():
        if key in MASKED_FIELDS:
            if isinstance(value, str) and value.strip():
                merged[key] = value.strip()
            continue
        merged[key] = value
    merged["updated_at"] = datetime.datetime.utcnow().isoformat()
    return merged
