"""
ADM_Settings — single source of truth for env-driven config.
All values map 1:1 to .env.example; nothing here is Azure-specific anymore,
per the local-build swap documented in README.md (design in the TDS unchanged).
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class ADM_Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Mongo (Cosmos DB replacement)
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "adm2"

    # Atlas Vector Search (Azure AI Search replacement)
    VECTOR_INDEX_NAME: str = "modeling_reference_vector_index"
    SKILL_VECTOR_INDEX_NAME: str = "skills_vector_index"
    VECTOR_EMBEDDING_DIM: int = 1536

    # Redis (queue + pub/sub only)
    REDIS_URL: str = "redis://localhost:6379/0"

    # LLM gateway
    LLM_BASE_URL: str = "https://api.ai-gateway.tigeranalytics.com"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o"
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # Local artifact storage (Blob Storage replacement)
    ARTIFACT_STORAGE_DIR: str = "./local_blob_storage"

    # Knowledge Base ingestion — chunking (admin upload pipeline)
    KB_CHUNK_SIZE: int = 1500          # characters, not tokens — see app/core/chunking.py
    KB_CHUNK_OVERLAP: int = 200

    ENV: str = "local"
    LOG_LEVEL: str = "INFO"
    DISTINCT_COUNT_APPROX_THRESHOLD: int = 1_000_000

    # JWT auth — local demo signing secret. Change this in any shared env.
    JWT_SECRET_KEY: str = "change-me-local-dev-secret-do-not-use-in-shared-env"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Admin — deployment-level trust list, comma-separated usernames. There
    # is deliberately no Mongo field and no promotion flow: admin status is
    # a property of the deployment config, not of any stored user document.
    # ADM_is_admin_username() (app/core/auth.py) is the only place this is
    # read; it re-parses on every call, so editing this and restarting the
    # process is the entire "promotion" step.
    ADMIN_USERNAMES: str = ""

    @property
    def ADMIN_USERNAMES_LIST(self) -> list[str]:
        return [u.strip() for u in self.ADMIN_USERNAMES.split(",") if u.strip()]

    # BYOK settings encryption (app/core/runtime_settings.py) — Fernet needs
    # a 32-byte urlsafe-base64 key. The default below is one such valid,
    # generated key for local demo use only — change it in any shared env,
    # same as JWT_SECRET_KEY. Every saved provider API key is encrypted with
    # this before it touches Mongo; losing/rotating this key makes every
    # previously-saved key undecryptable (treated as "not configured", not
    # a crash — see ADM_decrypt_secret).
    SETTINGS_ENCRYPTION_KEY: str = "S2SM7L5d5qjhAQonktnAQN9DTg2BNq3VPEdoljE52RA="


@lru_cache
def ADM_get_settings() -> ADM_Settings:
    return ADM_Settings()