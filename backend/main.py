from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import connect_to_mongo, close_mongo_connection
from api.routes import a2a, auth, mcp, projects, skills, agents, workflows, settings as settings_routes, sessions
from orchestrator import orchestrator_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="2.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

app.include_router(auth.router,         prefix=f"{settings.API_V1_STR}/auth",         tags=["Auth"])
app.include_router(projects.router,     prefix=f"{settings.API_V1_STR}/projects",     tags=["Projects"])
app.include_router(skills.router,       prefix=f"{settings.API_V1_STR}/skills",       tags=["Skills"])
app.include_router(agents.router,       prefix=f"{settings.API_V1_STR}/agents",       tags=["Agents"])
app.include_router(workflows.router,    prefix=f"{settings.API_V1_STR}/workflows",    tags=["Workflows"])
app.include_router(settings_routes.router, prefix=f"{settings.API_V1_STR}/settings", tags=["Settings"])
app.include_router(sessions.router, prefix=f"{settings.API_V1_STR}", tags=["Modeling Sessions"])
app.include_router(a2a.router, prefix=f"{settings.API_V1_STR}/a2a", tags=["A2A"])
app.include_router(mcp.router, prefix=f"{settings.API_V1_STR}/mcp", tags=["MCP"])
app.include_router(orchestrator_router, prefix=f"{settings.API_V1_STR}/orchestrator", tags=["Orchestrator"])

@app.get("/")
async def root():
    return {"message": "SilverCraft AI — Data Modeling Platform v2.0", "docs": "/docs"}
