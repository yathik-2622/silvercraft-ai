"""
The 15 Cosmos DB collections from TDS §8, unchanged, now living in Mongo.
Exposed as constants so nothing in the codebase hardcodes a collection
name string more than once.
"""

ADM_COLLECTION_USERS = "users"
ADM_COLLECTION_PROJECTS = "projects"
ADM_COLLECTION_CHATS = "chats"
ADM_COLLECTION_RAW_FILES = "raw_files"                 # thin registration only — no content
ADM_COLLECTION_PARSED_CHUNKS = "parsed_chunks"
ADM_COLLECTION_DB_CONNECTIONS = "db_connections"
ADM_COLLECTION_SKILLS = "skills"                        # kind x scope indexed
ADM_COLLECTION_SKILL_DRAFTS = "skill_drafts"
ADM_COLLECTION_BUSINESS_STANDARDS = "business_standards"
ADM_COLLECTION_EXECUTION_CONTRACTS = "execution_contracts"
ADM_COLLECTION_RUN_STATE = "run_state"
ADM_COLLECTION_ARTIFACT_REGISTRY = "artifact_registry"
ADM_COLLECTION_MODELING_REFERENCE = "modeling_reference"  # Atlas Vector Search backed — now CHUNK-level rows
ADM_COLLECTION_KB_DOCUMENTS = "kb_documents"               # full source documents, for citation reconstruction
ADM_COLLECTION_PROVENANCE_REPORTS = "provenance_reports"
ADM_COLLECTION_AGENT_CHECKPOINTS = "agent_checkpoints"     # LangGraph native checkpointer schema
ADM_COLLECTION_USER_SETTINGS = "user_settings"             # BYOK LLM runtime settings — not one of the original 15
ADM_COLLECTION_CHAT_ARTIFACTS = "chat_artifacts"           # per-task structured outputs, persisted for artifact chips to survive a reload — not one of the original 15

ADM_ALL_COLLECTIONS = [
    ADM_COLLECTION_USERS,
    ADM_COLLECTION_PROJECTS,
    ADM_COLLECTION_CHATS,
    ADM_COLLECTION_RAW_FILES,
    ADM_COLLECTION_PARSED_CHUNKS,
    ADM_COLLECTION_DB_CONNECTIONS,
    ADM_COLLECTION_SKILLS,
    ADM_COLLECTION_SKILL_DRAFTS,
    ADM_COLLECTION_BUSINESS_STANDARDS,
    ADM_COLLECTION_EXECUTION_CONTRACTS,
    ADM_COLLECTION_RUN_STATE,
    ADM_COLLECTION_ARTIFACT_REGISTRY,
    ADM_COLLECTION_MODELING_REFERENCE,
    ADM_COLLECTION_KB_DOCUMENTS,
    ADM_COLLECTION_PROVENANCE_REPORTS,
    ADM_COLLECTION_AGENT_CHECKPOINTS,
    ADM_COLLECTION_USER_SETTINGS,
    ADM_COLLECTION_CHAT_ARTIFACTS,
]