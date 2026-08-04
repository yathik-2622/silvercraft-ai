"""
Thin OpenAI-compatible chat client against the user's LLM gateway.
Every LLM-touching call in the codebase (Orchestrator, SolutionAgent,
TaskWorker, Skill Normalizer) goes through ADM_chat_completion so the
gateway config lives in exactly one place.
"""
import json

from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import ADM_get_settings

_client: AsyncOpenAI | None = None


def ADM_get_llm_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        settings = ADM_get_settings()
        _client = AsyncOpenAI(base_url=settings.LLM_BASE_URL, api_key=settings.LLM_API_KEY)
    return _client


def ADM_reset_llm_client() -> None:
    """
    Same event-loop-per-Celery-task issue as
    app.core.redis_pubsub.ADM_reset_redis / app.db.mongo_client.
    ADM_reset_mongo_client: AsyncOpenAI wraps an httpx.AsyncClient bound to
    the event loop that was running when it was first created. Celery
    tasks each run in their own asyncio.run()-created loop
    (app.celery_app.tasks.ADM_run_async), so reusing the module-level
    client across tasks throws "RuntimeError: Event loop is closed" the
    moment a later task's loop touches a connection opened under an
    earlier one — observed directly (self-recovered via this client's own
    retry) while verifying the per-chat orchestrator_model override.
    Drops the reference (not an awaited .close() — AsyncOpenAI.close() is
    async, and this runs after asyncio.run() has already torn the loop
    down, so there's nothing to await it on; same reasoning
    ADM_reset_redis already relies on). Call this at the end of every
    Celery task — never from FastAPI, which keeps one persistent loop.
    """
    global _client
    _client = None


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def ADM_chat_completion(
    messages: list[dict],
    temperature: float = 0.2,
    response_format_json: bool = False,
    model: str | None = None,
) -> str:
    settings = ADM_get_settings()
    client = ADM_get_llm_client()
    kwargs = {}
    if response_format_json:
        kwargs["response_format"] = {"type": "json_object"}
    resp = await client.chat.completions.create(
        model=model or settings.LLM_MODEL,
        messages=messages,
        temperature=temperature,
        **kwargs,
    )
    return resp.choices[0].message.content or ""


async def ADM_chat_completion_json(messages: list[dict], temperature: float = 0.1, model: str | None = None) -> dict:
    raw = await ADM_chat_completion(messages, temperature=temperature, response_format_json=True, model=model)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        cleaned = raw.strip().strip("```").replace("json\n", "", 1)
        return json.loads(cleaned)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def ADM_stream_chat_completion(messages: list[dict], temperature: float = 0.3, model: str | None = None):
    """
    Async generator yielding token deltas as they arrive from the gateway —
    the primitive every live-typing "reasoning"/answer stream is built on
    (Orchestrator's Tier 0 answer, in particular). Callers are responsible
    for both forwarding each delta live (e.g. via ADM_stream_token) AND
    accumulating the full text for persistence.

    `model` is the per-chat Orchestrator override (app.models.schemas.
    ADM_Chat.orchestrator_model) — this function is only ever called from
    Orchestrator code paths, never TaskWorker/SolutionAgent, which is
    exactly the scoping the override is supposed to have: it changes what
    the Orchestrator answers with, never what a TaskWorker executes with.
    """
    settings = ADM_get_settings()
    client = ADM_get_llm_client()
    stream = await client.chat.completions.create(
        model=model or settings.LLM_MODEL,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta