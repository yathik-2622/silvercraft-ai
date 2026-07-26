from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime
from database import get_db
from models.agent import AgentModel, AgentCreate, AgentResponse
from models.user import UserModel
from api.routes.auth import get_current_user

router = APIRouter()

SYSTEM_AGENTS = [
    {
        "_id": "agent-source-profiler",
        "name": "Source Data Profiler",
        "description": "Profiles raw source tables: row counts, null rates, distinct counts. Flags PII and sensitive columns. Generates a data dictionary.",
        "agent_type": "local",
        "remote_uri": None,
        "default_skills": ["source-analysis"],
        "is_system": True,
    },
    {
        "_id": "agent-pii-guard",
        "name": "PII Guardian",
        "description": "Detects and classifies PII/PHI/Financial columns. Recommends masking: SHA-256 hash, tokenization, truncation, or suppression.",
        "agent_type": "local",
        "remote_uri": None,
        "default_skills": ["pii-classification"],
        "is_system": True,
    },
    {
        "_id": "agent-conceptual-modeler",
        "name": "Conceptual Modeler",
        "description": "Generates high-level business concepts, entities, and cardinality relationships from profiled source data.",
        "agent_type": "local",
        "remote_uri": None,
        "default_skills": ["source-analysis"],
        "is_system": True,
    },
    {
        "_id": "agent-logical-normalizer",
        "name": "Logical Normalizer",
        "description": "Normalizes entities to 3NF (or Data Vault 2.0). Assigns PK/FK constraints and ISO-standard data types.",
        "agent_type": "local",
        "remote_uri": None,
        "default_skills": ["3nf-normalization"],
        "is_system": True,
    },
    {
        "_id": "agent-sttm-automator",
        "name": "STTM Automator",
        "description": "Generates Source-to-Target Mapping rows with transformation rules (TRIM, CAST, COALESCE) and physical DDL for the target dialect.",
        "agent_type": "local",
        "remote_uri": None,
        "default_skills": ["sttm"],
        "is_system": True,
    },
    {
        "_id": "agent-dimensional-modeler",
        "name": "Dimensional Modeler",
        "description": "Builds Kimball-style star/snowflake schemas. Generates fact and dimension tables with surrogate keys and SCD Type 2 support.",
        "agent_type": "local",
        "remote_uri": None,
        "default_skills": ["dimensional-modeling"],
        "is_system": True,
    },
    {
        "_id": "agent-data-vault",
        "name": "Data Vault Architect",
        "description": "Creates Data Vault 2.0 structures: Hubs (business keys), Links (relationships), Satellites (descriptive attributes) with hash keys and LDTS/RSRC metadata.",
        "agent_type": "local",
        "remote_uri": None,
        "default_skills": ["data-vault"],
        "is_system": True,
    },
]

def _fmt(a: dict) -> AgentResponse:
    a = dict(a)
    a["id"] = str(a.pop("_id"))
    return AgentResponse(**a)

async def ensure_system_agents(db):
    for agent in SYSTEM_AGENTS:
        existing = await db["agents"].find_one({"_id": agent["_id"]})
        if not existing:
            await db["agents"].insert_one({
                **agent,
                "created_by": None,
                "created_at": datetime.utcnow(),
            })

@router.get("/predefined", response_model=List[AgentResponse])
async def list_predefined_agents(current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await ensure_system_agents(db)
    cursor = db["agents"].find({"is_system": True})
    agents = await cursor.to_list(length=200)
    return [_fmt(a) for a in agents]

@router.post("/", response_model=AgentResponse, status_code=201)
async def create_custom_agent(agent: AgentCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    doc = AgentModel(**agent.model_dump(), created_by=str(current_user.id), is_system=False)
    result = await db["agents"].insert_one(doc.model_dump(by_alias=True, exclude={"id"}))
    created = await db["agents"].find_one({"_id": result.inserted_id})
    return _fmt(created)

@router.get("/", response_model=List[AgentResponse])
async def list_custom_agents(current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await ensure_system_agents(db)
    cursor = db["agents"].find({"$or": [{"is_system": True}, {"created_by": str(current_user.id)}]})
    agents = await cursor.to_list(length=200)
    return [_fmt(a) for a in agents]
