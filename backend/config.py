from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "SilverCraft AI - Data Modeling Platform"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_A_LONG_RANDOM_STRING"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # ── MongoDB (system of record for all app-layer state) ────────────────────
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "silvercraft"

    # ── LLM Provider (platform default — OpenAI-compatible endpoint) ──────────
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o"

    # ── Redis (Celery broker + result backend + WebSocket pub/sub) ────────────
    # Per BUILD_SPEC §4.1 and API_ERRORS_AND_TOPOLOGY §4
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # ── S3-compatible Blob Store (MinIO locally) ──────────────────────────────
    # Per BUILD_SPEC §4.1 — raw uploaded files + generated artifacts
    BLOB_STORE_ENDPOINT: str = "http://localhost:9000"
    BLOB_STORE_ACCESS_KEY: str = "minioadmin"
    BLOB_STORE_SECRET_KEY: str = "minioadmin"
    BLOB_STORE_BUCKET: str = "silvercraft-files"
    BLOB_STORE_REGION: str = "us-east-1"

    # ── PostgreSQL Metastore (explicit push target — NOT the app DB) ──────────
    # Per BUILD_SPEC §4.1 Exception #1: only written to on owner-gated push.
    # Replace these with your actual Postgres credentials.
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "REPLACE_WITH_POSTGRES_PASSWORD"
    POSTGRES_DB: str = "silvercraft_metastore"
    POSTGRES_SCHEMA: str = "public"

    # ── Neo4j Knowledge Graph (explicit push target) ──────────────────────────
    # Per BUILD_SPEC §4.1 Exception #2: 27-level ontology, adm_silver_kg_v2.py.
    # Replace these with your actual Neo4j credentials.
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "REPLACE_WITH_NEO4J_PASSWORD"
    NEO4J_DATABASE: str = "neo4j"

    # ── A2A Protocol ──────────────────────────────────────────────────────────
    A2A_SHARED_SECRET: str = ""
    A2A_PUBLIC_BASE_URL: str = ""
    # Max peer calls per agent task — AGENT_ARCH_V2 §2.2 step 4
    A2A_MAX_PEER_CALLS: int = 5

    # ── GitHub Integration (Push to Git feature) ──────────────────────────────
    # Optional: platform-level GitHub token (users can supply per-request too)
    GITHUB_TOKEN: Optional[str] = None
    GITHUB_DEFAULT_BRANCH: str = "main"

    ENCRYPTION_KEY: Optional[str] = None
    METASTORE_URI: Optional[str] = None

    # ── Agent Timeout Budgets (seconds) — API_ERRORS_AND_TOPOLOGY §3.3 ───────
    TIMEOUT_INTAKE: int = 60
    TIMEOUT_SOURCE_INTELLIGENCE_PER_TABLE: int = 90
    TIMEOUT_SOURCE_INTELLIGENCE_STAGE: int = 720       # 12 min
    TIMEOUT_CONCEPTUAL_STAGE: int = 300                # 5 min
    TIMEOUT_LOGICAL_PER_ENTITY: int = 90
    TIMEOUT_LOGICAL_STAGE: int = 900                   # 15 min
    TIMEOUT_PHYSICAL_PER_TABLE: int = 60
    TIMEOUT_PHYSICAL_STAGE: int = 600                  # 10 min
    TIMEOUT_SKILL_CURATOR: int = 30
    TIMEOUT_PEER_CALL: int = 20


    # ── Embeddings ──────────────────────────────────────────
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_API_KEY: Optional[str] = None  # Falls back to LLM_API_KEY if not set
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    model_config = {
        "case_sensitive": True,
        "env_file": ".env",
        "extra": "ignore"
    }


settings = Settings()
