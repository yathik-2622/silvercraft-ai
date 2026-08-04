"""
Redis usage is restricted to exactly the two logical uses in TDS §8:
Celery broker/backend (configured separately in celery_app.py) and
WebSocket/streaming Pub/Sub for chat progress. No general-purpose caching
happens anywhere in this codebase — that's an explicit non-goal (§1).
"""
import json

import redis.asyncio as aioredis

from app.config import ADM_get_settings

_redis: aioredis.Redis | None = None


def ADM_get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        settings = ADM_get_settings()
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def ADM_reset_redis() -> None:
    """
    Drops the cached client so the next ADM_get_redis() call opens a fresh
    one. Celery tasks each run in their own asyncio.run()-created event
    loop (see app.celery_app.tasks.ADM_run_async); redis.asyncio's client
    holds connections bound to the loop that created them, so reusing the
    module-level client across tasks throws "Event loop is closed" the
    moment a second task's loop touches a connection opened under the
    first. Call this at the end of every task — never from FastAPI, which
    runs one persistent loop and should keep the long-lived cached client.
    """
    global _redis
    _redis = None


def ADM_chat_channel(chat_id: str) -> str:
    return f"chat:{chat_id}"


async def ADM_publish_chat_event(chat_id: str, event_type: str, payload: dict) -> None:
    r = ADM_get_redis()
    message = json.dumps({"type": event_type, "payload": payload})
    await r.publish(ADM_chat_channel(chat_id), message)


async def ADM_subscribe_chat_channel(chat_id: str):
    r = ADM_get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(ADM_chat_channel(chat_id))
    return pubsub