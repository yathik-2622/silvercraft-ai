"""
Async Mongo client (Motor) — the Cosmos DB replacement. One client, reused
process-wide, exactly like the TDS's "1 account, 15 collections" (§8).
"""
from functools import lru_cache

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING

from app.config import ADM_get_settings
from app.db.collections import (
    ADM_COLLECTION_SKILLS,
    ADM_COLLECTION_EXECUTION_CONTRACTS,
    ADM_COLLECTION_RUN_STATE,
    ADM_COLLECTION_CHATS,
    ADM_COLLECTION_PROJECTS,
    ADM_COLLECTION_RAW_FILES,
    ADM_COLLECTION_DB_CONNECTIONS,
    ADM_COLLECTION_USERS,
    ADM_COLLECTION_KB_DOCUMENTS,
    ADM_COLLECTION_MODELING_REFERENCE,
    ADM_COLLECTION_USER_SETTINGS,
    ADM_COLLECTION_BUSINESS_STANDARDS,
)


@lru_cache
def ADM_get_mongo_client() -> AsyncIOMotorClient:
    settings = ADM_get_settings()
    return AsyncIOMotorClient(settings.MONGO_URI)


def ADM_get_db() -> AsyncIOMotorDatabase:
    settings = ADM_get_settings()
    client = ADM_get_mongo_client()
    return client[settings.MONGO_DB_NAME]


def ADM_reset_mongo_client() -> None:
    """
    Same event-loop-per-Celery-task issue as
    app.core.redis_pubsub.ADM_reset_redis: AsyncIOMotorClient holds
    resources (its executor's loop reference) bound to whichever event
    loop was running when it was first created. Reused across the fresh
    loop each asyncio.run() call makes (app.celery_app.tasks.ADM_run_async),
    it throws "Event loop is closed" on the next real query. Closes the
    cached client and drops it so the next ADM_get_mongo_client() call
    opens a fresh one on the new loop. Call this at the end of every
    Celery task — never from FastAPI, which keeps one persistent loop.
    """
    try:
        ADM_get_mongo_client().close()
    except Exception:
        pass
    ADM_get_mongo_client.cache_clear()


async def ADM_ensure_indexes() -> None:
    """
    Index setup for exact-lookup collections (TDS §7: 'Cosmos DB (exact
    lookup)' consumers). Run once at startup — idempotent.
    """
    db = ADM_get_db()

    # skills: kind x scope are indexed fields per TDS §8
    await db[ADM_COLLECTION_SKILLS].create_index(
        [("kind", ASCENDING), ("scope", ASCENDING), ("skill_id", ASCENDING)]
    )
    # Enforces the version-uniqueness invariant ADM_next_skill_version
    # relies on: skill_id+scope+version is now a real per-document key
    # (each write inserts a new version doc instead of upserting over the
    # old one), so this is safe to make unique.
    await db[ADM_COLLECTION_SKILLS].create_index(
        [("skill_id", ASCENDING), ("scope", ASCENDING), ("version", ASCENDING)], unique=True,
    )
    await db[ADM_COLLECTION_SKILLS].create_index([("created_by_user_id", ASCENDING)])

    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].create_index([("project_id", ASCENDING)])
    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].create_index([("status", ASCENDING)])

    await db[ADM_COLLECTION_RUN_STATE].create_index([("contract_id", ASCENDING)], unique=True)

    await db[ADM_COLLECTION_CHATS].create_index([("chat_id", ASCENDING)], unique=True)
    await db[ADM_COLLECTION_CHATS].create_index([("project_id", ASCENDING), ("user_id", ASCENDING)])
    await db[ADM_COLLECTION_PROJECTS].create_index([("project_id", ASCENDING)], unique=True)
    await db[ADM_COLLECTION_PROJECTS].create_index([("owner_user_id", ASCENDING)])
    await db[ADM_COLLECTION_PROJECTS].create_index([("collaborator_user_ids", ASCENDING)])
    await db[ADM_COLLECTION_RAW_FILES].create_index([("project_id", ASCENDING)])
    await db[ADM_COLLECTION_RAW_FILES].create_index([("raw_file_id", ASCENDING)], unique=True)

    # db_connections: was the one collection with no index at all beyond
    # the default _id_ — every other collection gets at least a lookup
    # index on its own primary key.
    await db[ADM_COLLECTION_DB_CONNECTIONS].create_index([("db_connection_id", ASCENDING)], unique=True)
    await db[ADM_COLLECTION_DB_CONNECTIONS].create_index([("project_id", ASCENDING)])

    # users: username is the login handle, must be unique
    await db[ADM_COLLECTION_USERS].create_index([("username", ASCENDING)], unique=True)
    await db[ADM_COLLECTION_USERS].create_index([("user_id", ASCENDING)], unique=True)

    # user_settings: one BYOK runtime-settings document per user
    await db[ADM_COLLECTION_USER_SETTINGS].create_index([("user_id", ASCENDING)], unique=True)

    # business_standards: plain lookup index only (no Atlas Vector Search
    # index — this collection is never chunked/embedded, only read whole
    # by project_id, see app.agents.context_builder). One document per
    # project by design (upsert on project_id), unique enforces that.
    await db[ADM_COLLECTION_BUSINESS_STANDARDS].create_index([("project_id", ASCENDING)], unique=True)

    # kb_documents: admin ingestion — one doc_id per uploaded reference file
    await db[ADM_COLLECTION_KB_DOCUMENTS].create_index([("doc_id", ASCENDING)], unique=True)
    await db[ADM_COLLECTION_KB_DOCUMENTS].create_index([("status", ASCENDING)])

    # modeling_reference: now chunk-level rows — chunk_id is the unique key,
    # source_doc_id is what citation lookups and cascade-delete filter on.
    # This Mongo index is separate from (and in addition to) the Atlas
    # Vector Search index you create manually in the Atlas UI (see README).
    await db[ADM_COLLECTION_MODELING_REFERENCE].create_index([("chunk_id", ASCENDING)], unique=True)
    await db[ADM_COLLECTION_MODELING_REFERENCE].create_index([("source_doc_id", ASCENDING)])