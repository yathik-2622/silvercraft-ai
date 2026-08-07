"""
BYOK (bring-your-own-key) LLM runtime settings — one document per user in
`user_settings` (not one of the TDS's original 15 collections; a later
addition). Ported from the reference implementation's shape
(aigers-universe-main/backend/core/runtime_settings.py +
api/settings_router.py + frontend/src/pages/SettingsPage.jsx), with two
deliberate differences from that reference:

1. Every provider API key field is encrypted at rest with Fernet
   (ADM_encrypt_secret/ADM_decrypt_secret) before it ever reaches Mongo.
   The reference's merge_settings_update stored these fields in plaintext
   — that's the one real gap being fixed here, not carried over. A key is
   decrypted only at the exact point an outbound call needs it
   (ADM_resolve_llm_runtime) or to compute a short masked preview for the
   settings API response (ADM_sanitize_user_settings) — the decrypted
   value is never logged and never included in any API response.

2. Scope: the reference resolves one global runtime for every LLM call
   the whole app makes. In this codebase BYOK applies to Orchestrator
   calls ONLY — see the exact divergence-point comment in
   app/graphs/orchestrator_graph.py. TaskWorker/SolutionAgent execution
   during a Tier 3 run always uses the platform's own LLM_API_KEY,
   regardless of what any user has configured here. Embeddings (KB
   ingestion, skill embedding, and the semantic-search calls inside Tier 0
   answering) are ALSO always platform-only, for a correctness reason the
   reference doesn't have to deal with: modeling_reference/skills
   documents are embedded once, at write time, with the platform's own
   EMBEDDING_MODEL — a query embedded with a different (BYOK) model would
   land in a different, incompatible vector space and silently return
   nonsense nearest-neighbors. `embedding_model` is still stored per-user
   here (for shape-parity with the reference's settings form) but is
   deliberately never read by anything that actually runs an embedding.
"""
import datetime
import json
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken
from openai import AsyncOpenAI

from app.config import ADM_get_settings
from app.db.collections import ADM_COLLECTION_USER_SETTINGS
from app.db.mongo_client import ADM_get_db

ADM_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "gateway": {"base_url": "", "label": "Platform Gateway"},   # base_url resolved from settings.LLM_BASE_URL at call time
    "custom": {"base_url": "", "label": "Custom OpenAI Gateway"},  # user-supplied base_url, falls back to the platform gateway
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "label": "OpenRouter"},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "label": "Groq"},
    "nvidia": {"base_url": "https://integrate.api.nvidia.com/v1", "label": "NVIDIA"},
}

# Same 7 models Phase 8 hardcoded into ChatWorkspace's dropdown — kept as
# the fallback list so a provider whose /models call fails (or a user who
# hasn't configured anything yet) still gets a working dropdown, not an
# empty one. This is what ADM_discover_models_for_user falls back to.
ADM_FALLBACK_MODELS: list[dict[str, Any]] = [
    {"id": "gpt-4o", "name": "GPT-4o (default)", "provider": "gateway", "free": False},
    {"id": "gpt-4o-mini", "name": "GPT-4o mini — faster, cheaper", "provider": "gateway", "free": False},
    {"id": "gpt-4.1", "name": "GPT-4.1", "provider": "gateway", "free": False},
    {"id": "claude-sonnet-4.5", "name": "Claude Sonnet 4.5", "provider": "gateway", "free": False},
    {"id": "claude-haiku-4.5", "name": "Claude Haiku 4.5 — faster, cheaper", "provider": "gateway", "free": False},
    {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "provider": "gateway", "free": False},
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash — faster, cheaper", "provider": "gateway", "free": False},
]

# Every field here is Fernet-encrypted before being written to Mongo (see
# ADM_merge_settings_update) and is never returned raw from any route —
# only `{field}_configured: bool` + `{field}_masked: str` (see
# ADM_sanitize_user_settings).
ADM_MASKED_FIELDS = {"api_key", "openrouter_api_key", "groq_api_key", "nvidia_api_key"}


def ADM_get_fernet() -> Fernet:
    settings = ADM_get_settings()
    return Fernet(settings.SETTINGS_ENCRYPTION_KEY.encode())


def ADM_encrypt_secret(plain: str) -> str:
    if not plain:
        return ""
    return ADM_get_fernet().encrypt(plain.encode()).decode()


def ADM_decrypt_secret(ciphertext: str) -> str:
    """Never raises on a bad/foreign token — treats it as "not configured"
    rather than crashing the caller (e.g. after a SETTINGS_ENCRYPTION_KEY
    rotation, or if a value somehow predates encryption)."""
    if not ciphertext:
        return ""
    try:
        return ADM_get_fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


def ADM__mask_secret(value: str) -> str:
    """Fixed-width mask regardless of the raw key's length — a long provider
    key (some run 100+ chars) previously produced a mask whose asterisk run
    scaled 1:1 with key length, overflowing the settings UI's card width.
    Always exactly first4 + 6 dots + last4 (or all-dots for short values)."""
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:4]}{'•' * 6}{value[-4:]}"


def ADM__normalize_provider(provider: str | None) -> str:
    value = (provider or "gateway").strip().lower()
    return value if value in ADM_PROVIDER_DEFAULTS else "gateway"


async def ADM_get_user_runtime_settings(user_id: str | None) -> dict:
    if not user_id:
        return {}
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_USER_SETTINGS].find_one({"user_id": user_id}, {"_id": 0})
    return doc or {}


def ADM_sanitize_user_settings(doc: dict) -> dict:
    """
    Decrypts each masked field only long enough to compute a short preview
    (e.g. "sk-a...z9") — the decrypted value itself is discarded
    immediately after, never included in the returned dict.
    """
    safe = {k: v for k, v in (doc or {}).items() if k not in ADM_MASKED_FIELDS and k != "user_id"}
    for field in ADM_MASKED_FIELDS:
        ciphertext = (doc or {}).get(field)
        if not ciphertext:
            continue
        plain = ADM_decrypt_secret(ciphertext)
        if plain:
            safe[f"{field}_configured"] = True
            safe[f"{field}_masked"] = ADM__mask_secret(plain)
    return safe


def ADM_merge_settings_update(existing: dict, updates: dict) -> dict:
    """
    The one real fix over the reference: every ADM_MASKED_FIELDS value is
    encrypted here, before it's ever merged into what gets written to
    Mongo. A blank/omitted masked field keeps whatever's already stored
    (the frontend never round-trips a real key back — only the masked
    preview — so submitting blank means "leave it alone," not "clear it").
    """
    merged = dict(existing or {})
    for key, value in (updates or {}).items():
        if key in ADM_MASKED_FIELDS:
            if isinstance(value, str) and value.strip():
                merged[key] = ADM_encrypt_secret(value.strip())
            continue
        merged[key] = value
    merged["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return merged


def ADM__provider_api_key(provider: str, settings_doc: dict) -> str:
    settings = ADM_get_settings()
    if provider == "openrouter":
        return ADM_decrypt_secret(settings_doc.get("openrouter_api_key", "")) or ""
    if provider == "groq":
        return ADM_decrypt_secret(settings_doc.get("groq_api_key", "")) or ""
    if provider == "nvidia":
        return ADM_decrypt_secret(settings_doc.get("nvidia_api_key", "")) or ""
    if provider == "custom":
        return ADM_decrypt_secret(settings_doc.get("api_key", "")) or settings.LLM_API_KEY
    # "gateway" — deliberately NEVER reads settings_doc at all, even though
    # "api_key" is stored under the same field name "custom" uses. Found
    # live: without this branch, switching provider back to "gateway"
    # after trying "custom" silently kept using whatever (possibly wrong,
    # possibly stale) key was left in "api_key" — "gateway" only means
    # "definitely the platform's key" if it never looks at anything the
    # user configured, not just "custom" with a different default label.
    return settings.LLM_API_KEY


def ADM__provider_base_url(provider: str, settings_doc: dict) -> str:
    settings = ADM_get_settings()
    if provider == "custom":
        return (settings_doc.get("base_url") or settings.LLM_BASE_URL).strip()
    if provider == "gateway":
        return settings.LLM_BASE_URL
    return ADM_PROVIDER_DEFAULTS[provider]["base_url"]


async def ADM_resolve_llm_runtime(user_id: str | None) -> dict:
    """
    The BYOK equivalent of the reference's resolve_llm_runtime. Returns
    everything an Orchestrator LLM call needs: which provider, its
    base_url/api_key (real key, decrypted — caller must not log it), and
    the account-level default_model (the per-chat `orchestrator_model`
    override, where set, still wins over this — see
    app/graphs/orchestrator_graph.py).
    """
    settings = ADM_get_settings()
    settings_doc = await ADM_get_user_runtime_settings(user_id)
    provider = ADM__normalize_provider(settings_doc.get("provider"))
    default_model = (settings_doc.get("default_model") or settings.LLM_MODEL).strip() or settings.LLM_MODEL
    return {
        "provider": provider,
        "provider_label": ADM_PROVIDER_DEFAULTS[provider]["label"],
        "base_url": ADM__provider_base_url(provider, settings_doc),
        "api_key": ADM__provider_api_key(provider, settings_doc),
        "default_model": default_model,
    }


def ADM__to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except (InvalidOperation, TypeError):
        return Decimal("0")


def ADM__normalize_model_item(raw: dict, provider: str) -> dict:
    """
    Different providers' /models responses carry different fields
    (OpenRouter has pricing/context_length/supported_parameters; a plain
    OpenAI-compatible gateway may have just an id) — render whatever's
    actually present rather than assuming a fixed shape.
    """
    model_id = raw.get("id") or raw.get("name") or ""
    name = raw.get("name") or model_id
    pricing = raw.get("pricing") or {}
    free = bool(pricing) and all(
        ADM__to_decimal(pricing.get(field)) == 0 for field in ("prompt", "completion", "request", "image")
    )
    context_length = raw.get("context_length") or (raw.get("top_provider") or {}).get("context_length")
    return {
        "id": model_id,
        "name": name,
        "provider": provider,
        "context_length": context_length,
        "description": raw.get("description") or "",
        "free": free,
    }


async def ADM_discover_provider_models(
    provider: str, api_key: str = "", base_url: str = "", timeout_seconds: float = 20.0,
) -> dict:
    """Live GET {base_url}/models call. Raises on failure — callers that
    want a graceful fallback should go through ADM_discover_models_for_user
    instead of calling this directly."""
    normalized_provider = ADM__normalize_provider(provider)
    effective_base_url = (base_url or ADM_PROVIDER_DEFAULTS[normalized_provider]["base_url"]).rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    url = f"{effective_base_url}/models"
    async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        payload = response.json()

    items = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        items = []
    models = [ADM__normalize_model_item(item, normalized_provider) for item in items if isinstance(item, dict) and item.get("id")]
    models.sort(key=lambda item: (not item["free"], item["name"].lower()))
    return {"provider": normalized_provider, "base_url": effective_base_url, "count": len(models), "models": models}


async def ADM_discover_models_for_user(user_id: str | None) -> dict:
    """
    Live models for the calling user's saved provider, with a graceful
    fallback to ADM_FALLBACK_MODELS (+ fallback: true, error: <message>) if
    the live call fails for any reason — an unreachable/misconfigured
    provider must never leave the model dropdown empty.
    """
    runtime = await ADM_resolve_llm_runtime(user_id)
    try:
        result = await ADM_discover_provider_models(
            provider=runtime["provider"], api_key=runtime["api_key"], base_url=runtime["base_url"],
        )
        return {**result, "default": runtime["default_model"], "provider_label": runtime["provider_label"]}
    except Exception as exc:
        return {
            "provider": runtime["provider"],
            "provider_label": runtime["provider_label"],
            "base_url": runtime["base_url"],
            "default": runtime["default_model"],
            "count": len(ADM_FALLBACK_MODELS),
            "models": ADM_FALLBACK_MODELS,
            "fallback": True,
            "error": str(exc),
        }


class ADM_MissingProviderKeyError(RuntimeError):
    """Raised when a non-gateway BYOK provider (openrouter/groq/nvidia) has
    no usable API key — either never configured, or its stored ciphertext no
    longer decrypts (e.g. after a SETTINGS_ENCRYPTION_KEY rotation, which
    silently loses the old value — see ADM_decrypt_secret's docstring).
    Without this check, a blank Authorization header would still reach the
    real provider and bounce back a generic 401 that looks identical to "the
    key is wrong" — confirmed live: a batch of pre-rotation user_settings
    documents all silently stopped decrypting, and every one of those
    users' next chat message failed with an indistinguishable 401, even
    though (from their side) nothing about their saved key had changed.
    Raised early instead, with a message that actually tells them what to
    do: re-enter and re-save the key so it's encrypted with the key
    currently in use. "custom" is deliberately excluded — it always falls
    back to the platform's own key (see ADM__provider_api_key), so it can
    never hit this "no key at all" case; a wrong key there is a genuine
    provider-side rejection, and the existing generic 401 message is the
    right one for that."""


# ---------------------------------------------------------------------------
# BYOK-aware chat-completion calls — used ONLY from
# app/graphs/orchestrator_graph.py's two LLM call sites. Every other caller
# in the codebase (Skill Normalizer, TaskWorker/SolutionAgent) keeps using
# app/llm/client.py's ADM_chat_completion[_json]/ADM_stream_chat_completion,
# which always use the platform's own cached client — see the divergence
# comment in orchestrator_graph.py for exactly where these two paths split.
# ---------------------------------------------------------------------------

def ADM__require_provider_key(runtime: dict) -> None:
    if runtime["provider"] != "gateway" and not runtime["api_key"]:
        raise ADM_MissingProviderKeyError(
            f"No API key configured for {runtime['provider_label']}. Open Settings, "
            f"enter your {runtime['provider_label']} key, and save — if you already "
            f"saved one before, it may no longer be readable after a server-side "
            f"security key rotation and needs to be re-entered."
        )


async def ADM_chat_completion_json_for_user(
    messages: list[dict], user_id: str | None, temperature: float = 0.1, model: str | None = None,
) -> dict:
    runtime = await ADM_resolve_llm_runtime(user_id)
    ADM__require_provider_key(runtime)
    resolved_model = model or runtime["default_model"]
    client = AsyncOpenAI(api_key=runtime["api_key"], base_url=runtime["base_url"])
    resp = await client.chat.completions.create(
        model=resolved_model, messages=messages, temperature=temperature,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content or ""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        cleaned = raw.strip().strip("`").replace("json\n", "", 1)
        return json.loads(cleaned)


async def ADM_stream_chat_completion_for_user(
    messages: list[dict], user_id: str | None, temperature: float = 0.3, model: str | None = None,
):
    runtime = await ADM_resolve_llm_runtime(user_id)
    ADM__require_provider_key(runtime)
    resolved_model = model or runtime["default_model"]
    client = AsyncOpenAI(api_key=runtime["api_key"], base_url=runtime["base_url"])
    stream = await client.chat.completions.create(
        model=resolved_model, messages=messages, temperature=temperature, stream=True,
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
