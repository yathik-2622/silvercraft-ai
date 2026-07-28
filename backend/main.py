"""
ADM Agent Studio 2.0 — FastAPI entry point

Registered routes and services:
  /api/v1/auth             Authentication (login, refresh, logout)
  /api/v1/projects         Project CRUD + RBAC + Git push
  /api/v1/skills           Skill CRUD + enhance/promote/download
  /api/v1/agents           Agent registry + run + peer-call + agent cards
  /api/v1/sessions         HITL gate control + push endpoints
  /api/v1/db-connections   DB connection intake (encrypted creds)
  /api/v1/workflows        Workflow canvas management
  /api/v1/settings         LLM provider profiles
  /api/v1/a2a              Legacy A2A compat (stage-agent invocation)
  /api/v1/mcp              MCP tool bridge
  /api/v1/orchestrator     Chat/LLM orchestration (run + stream SSE)
  /api/v1/chat/{id}/stream WebSocket trace-event stream (ADM_2.0 spec)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import connect_to_mongo, close_mongo_connection
from middleware.error_handler import register_error_handlers

from api.routes import a2a, artifacts, auth, mcp, projects, skills, agents, workflows
from api.routes import settings as settings_routes
from api.routes import sessions
from api.routes.gates import router as gates_router
from api.routes.db_connections import router as db_connections_router
from api.routes.git_push import router as git_push_router
from api.websocket import router as ws_router
from orchestrator import orchestrator_router

# ─── App factory ─────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="ADM Agent Studio 2.0 — Enterprise AI-powered data modeling platform",
    version="2.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

# ─── Error envelope (must be first) ──────────────────────────────────────────
# Per ADM_2.0_API_ERRORS_AND_TOPOLOGY.md §1 — all exceptions return structured envelope
register_error_handlers(app)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Lifespan events ─────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()


@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()


# ─── REST routes ─────────────────────────────────────────────────────────────
V1 = settings.API_V1_STR

# Auth
app.include_router(auth.router,              prefix=f"{V1}/auth",            tags=["Auth"])

# Projects — includes Git push sub-routes
app.include_router(projects.router,          prefix=f"{V1}/projects",         tags=["Projects"])
app.include_router(git_push_router,          prefix=f"{V1}/projects",         tags=["Git Push"])

# Skills (CRUD + enhance/promote/download)
app.include_router(skills.router,            prefix=f"{V1}/skills",           tags=["Skills"])

# Agents (registry + run + peer-call + A2A agent cards)
app.include_router(agents.router,            prefix=f"{V1}/agents",           tags=["Agents"])

# Gate control + push targets (sessions/{id}/gates/* and sessions/{id}/push/*)
app.include_router(gates_router,             prefix=V1,                       tags=["Gate Control"])

# DB Connections
app.include_router(db_connections_router,    prefix=f"{V1}",                  tags=["DB Connections"])

# Workflows
app.include_router(workflows.router,         prefix=f"{V1}/workflows",        tags=["Workflows"])

# Settings (LLM provider profiles)
app.include_router(settings_routes.router,   prefix=f"{V1}/settings",         tags=["Settings"])

# Modeling sessions (chat + HITL decisions)
app.include_router(sessions.router,          prefix=V1,                       tags=["Modeling Sessions"])

# Artifacts (export/download)
app.include_router(artifacts.router,         prefix=V1,                       tags=["Artifacts"])

# Legacy A2A compat
app.include_router(a2a.router,               prefix=f"{V1}/a2a",              tags=["A2A"])

# MCP bridge
app.include_router(mcp.router,               prefix=f"{V1}/mcp",              tags=["MCP"])

# Orchestrator (chat, run, stream SSE — legacy path kept for compatibility)
app.include_router(orchestrator_router,      prefix=f"{V1}/orchestrator",     tags=["Orchestrator"])

# ─── WebSocket ────────────────────────────────────────────────────────────────
# WS /api/v1/chat/{session_id}/stream — per ADM_2.0_API_ERRORS §2.4
app.include_router(ws_router,                prefix=V1,                       tags=["WebSocket Stream"])


# ─── Health ──────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "service": "SilverCraft AI — ADM Agent Studio 2.0",
        "version": "2.0.0",
        "docs": f"{V1}/docs",
        "ws_stream": f"{V1}/chat/{{session_id}}/stream",
        "status": "operational",
    }


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": __import__("datetime").datetime.utcnow().isoformat()}
