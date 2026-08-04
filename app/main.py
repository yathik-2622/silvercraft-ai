"""
ADM 2.0 First Cut — FastAPI entrypoint.
FastAPI validates requests, persists straightforward writes, enqueues
Celery tasks, serves downloads, and streams progress via Redis Pub/Sub —
it never runs an LLM call or agent logic inline (TDS §8).
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import ADM_get_settings
from app.db.mongo_client import ADM_ensure_indexes
from app.core.auth import ADM_decode_access_token
from app.core.ownership import ADM_assert_chat_access
from app.core.redis_pubsub import ADM_subscribe_chat_channel
from app.api.routes_projects import router as ADM_projects_router
from app.api.routes_chats import router as ADM_chats_router
from app.api.routes_contracts import router as ADM_contracts_router
from app.api.routes_skills import router as ADM_skills_router
from app.api.routes_uploads import router as ADM_uploads_router
from app.api.routes_db_connections import router as ADM_db_connections_router
from app.api.routes_auth import router as ADM_auth_router
from app.api.routes_admin import router as ADM_admin_router
from app.api.routes_kb import router as ADM_kb_router
from app.api.routes_settings import router as ADM_settings_router

logging.basicConfig(level=ADM_get_settings().LOG_LEVEL)


@asynccontextmanager
async def ADM_lifespan(app: FastAPI):
    await ADM_ensure_indexes()
    yield


app = FastAPI(
    title="ADM 2.0 — First Cut (Local)",
    description="Local Mongo/Redis build of the ADM 2.0 first-cut TDS (Canonical/3NF).",
    version="0.1.0",
    lifespan=ADM_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local demo only
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ADM_auth_router)
app.include_router(ADM_projects_router)
app.include_router(ADM_chats_router)
app.include_router(ADM_contracts_router)
app.include_router(ADM_skills_router)
app.include_router(ADM_uploads_router)
app.include_router(ADM_db_connections_router)
app.include_router(ADM_admin_router)
app.include_router(ADM_kb_router)
app.include_router(ADM_settings_router)


@app.get("/health")
async def ADM_health():
    return {"status": "ok", "env": ADM_get_settings().ENV}


@app.websocket("/ws/chats/{chat_id}")
async def ADM_chat_websocket(websocket: WebSocket, chat_id: str, token: str | None = None):
    """
    Live stage progress / HITL review cards, per TDS §4 step 3.

    Previously had NO auth check at all — anyone who guessed or observed
    a chat_id could connect and read another user's live reasoning
    stream. Browsers can't set an Authorization header on a WebSocket
    handshake, so the JWT comes via `?token=` query param instead (the
    standard workaround) — same token, same `ADM_decode_access_token`
    validation as every HTTP route, then the same project-access check
    (`ADM_assert_chat_access`) as the NDJSON stream endpoint. A missing/
    invalid token or a chat the caller can't access closes the socket
    immediately with 4401/4404 rather than accepting the connection and
    silently relaying nothing.
    """
    if not token:
        await websocket.close(code=4401)
        return
    try:
        current_user_id = ADM_decode_access_token(token)
    except Exception:
        await websocket.close(code=4401)
        return
    try:
        await ADM_assert_chat_access(chat_id, current_user_id)
    except Exception:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    pubsub = await ADM_subscribe_chat_channel(chat_id)
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe()