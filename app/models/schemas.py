"""
Pydantic document/request/response models. One model class per collection
shape referenced in the TDS, plus API request bodies. Field names mirror
the TDS tables directly so there's no translation layer to reason about.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


def ADM_new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def ADM_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Auth / Users — JWT login, DB is the only source of truth (no localStorage)
# ---------------------------------------------------------------------------

class ADM_UserRegisterRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str


class ADM_UserLoginRequest(BaseModel):
    username: str
    password: str


class ADM_User(BaseModel):
    """Stored document — includes hashed_password, NEVER returned to a client.
    No is_admin field here — admin status isn't stored per-user, it's
    computed live from settings.ADMIN_USERNAMES (app/core/auth.py's
    ADM_is_admin_username)."""
    user_id: str = Field(default_factory=lambda: ADM_new_id("user"))
    username: str
    email: Optional[str] = None
    hashed_password: str
    created_at: str = Field(default_factory=ADM_now)


class ADM_UserPublic(BaseModel):
    """Safe-to-return shape — no hashed_password. is_admin is computed at
    response time from ADM_is_admin_username, never stored."""
    user_id: str
    username: str
    email: Optional[str] = None
    is_admin: bool = False
    created_at: str


class ADM_TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: ADM_UserPublic


# ---------------------------------------------------------------------------
# BYOK LLM runtime settings — app/core/runtime_settings.py
# ---------------------------------------------------------------------------

class ADM_UserSettingsUpdateRequest(BaseModel):
    provider: str = "gateway"          # gateway | custom | openrouter | groq | nvidia
    base_url: str = ""                 # only meaningful for provider=custom
    default_model: str = ""
    embedding_model: str = ""          # stored for shape-parity only — never actually used, see runtime_settings.py docstring
    api_key: str = ""                  # shared by gateway/custom
    openrouter_api_key: str = ""
    groq_api_key: str = ""
    nvidia_api_key: str = ""


# ---------------------------------------------------------------------------
# Projects / Chats
# ---------------------------------------------------------------------------

class ADM_ProjectCreateRequest(BaseModel):
    name: str
    layer: Literal["silver", "gold", "bronze"] = "silver"
    domain: str


class ADM_Project(BaseModel):
    project_id: str = Field(default_factory=lambda: ADM_new_id("proj"))
    owner_user_id: str
    name: str
    layer: str
    domain: str
    target_platform: Optional[str] = None  # postgresql | snowflake | sqlserver — see app/tools/ddl_generator.py; None treated as postgresql
    collaborator_user_ids: list[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=ADM_now)
    # Denormalized so GET /projects can render the dashboard's Business
    # Standards chip without an N+1 lookup per project. Set by the
    # PUT/PATCH /{project_id}/business-standards routes, never read
    # elsewhere as the source of truth (the business_standards collection
    # itself is) — this is purely a "does one exist" flag for the UI.
    has_business_standards: bool = False


class ADM_ProjectPatchRequest(BaseModel):
    """Owner-only (see app.core.ownership.ADM_assert_project_owner)."""
    name: Optional[str] = None
    domain: Optional[str] = None
    target_platform: Optional[str] = None


class ADM_CollaboratorAddRequest(BaseModel):
    """Add by username, not raw user_id — matches how a project owner
    actually identifies a teammate."""
    username: str


class ADM_ChatCreateRequest(BaseModel):
    project_id: Optional[str] = None      # None = a "dashboard" chat, not yet attached to a project
    title: Optional[str] = "New chat"


class ADM_Chat(BaseModel):
    chat_id: str = Field(default_factory=lambda: ADM_new_id("chat"))
    project_id: Optional[str] = None      # None until POST /chats/{chat_id}/create-project migrates it
    user_id: str                          # creator — kept for provenance, no longer the visibility filter
    title: str = "New chat"
    title_is_default: bool = True         # flips false on first rename OR first auto-derived title, so auto-naming never overwrites a deliberate choice
    orchestrator_model: Optional[str] = None   # per-chat override — Orchestrator only, never TaskWorker/SolutionAgent
    messages: list[dict] = Field(default_factory=list)
    created_at: str = Field(default_factory=ADM_now)


class ADM_ChatPatchRequest(BaseModel):
    title: Optional[str] = None
    orchestrator_model: Optional[str] = None


class ADM_FileRef(BaseModel):
    """Reference to an uploaded file or DB connection — never raw content."""
    raw_file_id: Optional[str] = None
    db_connection_id: Optional[str] = None
    # Display-only fields, populated by ADM__enrich_file_refs_for_display at
    # persist time so a reloaded chat can still render the "file attached to
    # this message" card. Never consulted at execution time — the graph's own
    # source-ref resolution re-looks-up raw_file_id/db_connection_id fresh.
    original_filename: Optional[str] = None
    row_count: Optional[int] = None


class ADM_MessageCreateRequest(BaseModel):
    content: str
    file_refs: list[ADM_FileRef] = Field(default_factory=list)
    selected_skill_ids: list[str] = Field(default_factory=list)  # `/`-attached skills, row 2c


# ---------------------------------------------------------------------------
# Skills (Workflow / Task / Utility) — TDS §5, §6
# ---------------------------------------------------------------------------

class ADM_SkillKind(str, Enum):
    workflow = "workflow"
    task = "task"
    utility = "utility"


class ADM_SkillScope(str, Enum):
    global_ = "global"
    org = "org"
    user = "user"


class ADM_HitlMode(str, Enum):
    auto = "auto"
    confidence_gated = "confidence_gated"
    mandatory = "mandatory"


class ADM_Skill(BaseModel):
    skill_id: str
    kind: ADM_SkillKind
    scope: ADM_SkillScope = ADM_SkillScope.global_
    version: int = 1
    title: str
    purpose: str
    prompt: str
    tools: list[str] = Field(default_factory=list)  # declared, never inferred
    expected_output: str = ""
    hitl_mode: Optional[ADM_HitlMode] = None
    hitl_reason: Optional[str] = None
    stage: Optional[int] = None            # 1-4, Canonical/3NF staging
    modeling_style: Optional[str] = "canonical"
    depends_on: list[str] = Field(default_factory=list)  # task_ids within a workflow
    task_list: list[dict] = Field(default_factory=list)  # only present for kind=workflow — each entry {task_id, skill_id, name}
    embedding: Optional[list[float]] = None   # skill-level semantic search — see app/db/vector_search.py
    created_by_user_id: Optional[str] = None  # None for admin/global uploads (nothing personal to
                                               # attribute); the actual user for anything from the
                                               # in-chat /create skill flow or direct import — this is
                                               # what makes GET /skills?mine=true answerable at all
    created_at: str = Field(default_factory=ADM_now)
    last_modified: str = Field(default_factory=ADM_now)


class ADM_SkillImportRequest(BaseModel):
    project_id: str
    raw_text: str  # free-form skill description (already parsed in-memory upstream)


class ADM_SkillDraft(BaseModel):
    draft_id: str = Field(default_factory=lambda: ADM_new_id("draft"))
    project_id: str
    extracted: dict[str, Any] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    # "failed": the extraction LLM call itself raised, before there was
    # anything to review — distinct from "awaiting_clarification" (a
    # successful extraction that's merely incomplete). Needed so a caller
    # polling GET /skill-drafts/{id} for a draft_id that failed before this
    # document ever existed has *something* to eventually see — see
    # ADM_normalize_skill_task_async, which now pre-inserts a placeholder
    # draft up front specifically so this status has somewhere to land.
    status: Literal["pending", "awaiting_clarification", "approved", "failed"] = "pending"
    error: Optional[str] = None
    target_scope: str = "user"   # "user" for the normal in-chat import flow, "global" for admin uploads —
                                  # same Normalizer/approve pipeline, different destination scope
    created_at: str = Field(default_factory=ADM_now)


# ---------------------------------------------------------------------------
# Execution Contract / Run State — TDS §5 rows 3-9
# ---------------------------------------------------------------------------

class ADM_HitlGate(BaseModel):
    task_id: str
    mode: ADM_HitlMode
    reason: str
    status: Literal["pending", "approved", "edited"] = "pending"
    result_snapshot: Optional[dict] = None
    user_override: bool = False


class ADM_PlannedTask(BaseModel):
    task_id: str
    skill_id: str
    skill_version: int
    stage: int
    hitl_mode: ADM_HitlMode
    hitl_reason: str
    alternative_skill_id: Optional[str] = None  # planner default when user picked via `/`
    user_selected: bool = False


class ADM_PlanComment(BaseModel):
    author_user_id: str
    text: str
    created_at: str = Field(default_factory=ADM_now)
    # None = plan-wide (the original behavior). Set = scoped to one task's
    # planned_task["task_id"] — ADM_execute_one_task injects matching
    # comments into that task's own input_payload as a real instruction,
    # not just a passive annotation. See ADM_add_plan_comment for the
    # once-approved write restriction this implies.
    task_id: Optional[str] = None


class ADM_CommentCreateRequest(BaseModel):
    text: str
    task_id: Optional[str] = None


class ADM_ExecutionContract(BaseModel):
    contract_id: str = Field(default_factory=lambda: ADM_new_id("contract"))
    project_id: str
    chat_id: str
    workflow_skill_id: str
    modeling_style: str = "canonical"
    status: Literal["draft", "approved", "running", "paused", "completed", "failed"] = "draft"
    stages: dict[str, list[ADM_PlannedTask]] = Field(default_factory=dict)  # "1".."4" -> tasks
    source_refs: list[ADM_FileRef] = Field(default_factory=list)
    user_selected_skills: dict[str, str] = Field(default_factory=dict)  # task_id -> skill_id
    comments: list[ADM_PlanComment] = Field(default_factory=list)
    immutable: bool = False
    created_at: str = Field(default_factory=ADM_now)
    approved_at: Optional[str] = None


class ADM_ContractPatchRequest(BaseModel):
    stages: Optional[dict[str, list[ADM_PlannedTask]]] = None


class ADM_RunState(BaseModel):
    contract_id: str
    current_stage: int = 1
    stage_status: dict[str, str] = Field(default_factory=dict)  # "1": "in_progress"|"done"|...
    task_results: dict[str, dict] = Field(default_factory=dict)  # task_id -> {output, confidence}
    hitl_gates: list[ADM_HitlGate] = Field(default_factory=list)
    checkpoint_id: Optional[str] = None
    updated_at: str = Field(default_factory=ADM_now)


class ADM_HitlResolveRequest(BaseModel):
    edited_output: Optional[dict] = None  # present only for "edit"


# ---------------------------------------------------------------------------
# Raw files / DB connections — TDS §3 (no content ever persisted)
# ---------------------------------------------------------------------------

class ADM_RawFileRegistration(BaseModel):
    raw_file_id: str = Field(default_factory=lambda: ADM_new_id("file"))
    project_id: str
    filename: str
    file_type: str
    schema_summary: dict[str, Any] = Field(default_factory=dict)  # column names/types only
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    registered_at: str = Field(default_factory=ADM_now)


class ADM_DbConnection(BaseModel):
    db_connection_id: str = Field(default_factory=lambda: ADM_new_id("dbc"))
    project_id: str
    dialect: str
    dsn_ref: str  # a reference/secret name, never the raw credential blob
    created_at: str = Field(default_factory=ADM_now)


class ADM_DbConnectionCreateRequest(BaseModel):
    project_id: str
    dialect: str
    dsn_ref: str  # env var name the real DSN lives under — see routes_db_connections.py


# ---------------------------------------------------------------------------
# Provenance / Artifacts
# ---------------------------------------------------------------------------

class ADM_ProvenanceReport(BaseModel):
    report_id: str = Field(default_factory=lambda: ADM_new_id("prov"))
    contract_id: str
    entries: list[dict] = Field(default_factory=list)  # per task: skill used, version, hitl outcome, knowledge_used (citations)
    generated_at: str = Field(default_factory=ADM_now)


class ADM_ArtifactRecord(BaseModel):
    artifact_id: str = Field(default_factory=lambda: ADM_new_id("art"))
    contract_id: str
    artifact_type: Literal["ddl", "sttm", "json", "other"]
    filename: str
    local_path: str
    created_at: str = Field(default_factory=ADM_now)


# ---------------------------------------------------------------------------
# Knowledge Base ingestion (admin) — replaces seed.py as the real content
# path. Chunking preserves character offsets so a citation can be rendered
# as "the whole document, with this exact chunk highlighted."
# ---------------------------------------------------------------------------

class ADM_KbDocumentStatus(str, Enum):
    processing = "processing"   # text extracted + saved; chunking/embedding still running (Celery)
    ready = "ready"
    failed = "failed"


class ADM_KbDocument(BaseModel):
    doc_id: str = Field(default_factory=lambda: ADM_new_id("kbdoc"))
    title: str
    filename: str
    doc_type: Literal["kb_reference"] = "kb_reference"
    full_text: str                       # complete original text — this is what citations render against
    char_length: int = 0
    chunk_count: int = 0
    chunking_strategy: str = "markdown-recursive"
    status: ADM_KbDocumentStatus = ADM_KbDocumentStatus.processing
    uploaded_by: str                     # admin user_id
    uploaded_at: str = Field(default_factory=ADM_now)
    # One-per-DOCUMENT LLM summary/keywords (app/tools/kb_metadata.py),
    # set once ingestion completes — never duplicated onto every chunk row.
    # Best-effort: "" / [] if the LLM call failed, never blocks ingestion.
    summary: str = ""
    keywords: list[str] = Field(default_factory=list)
    # Dedupe key (app/core/fingerprint.py) — set at upload time, before
    # ingestion even starts, so a re-upload of the same content is caught
    # up front rather than after a wasted chunk/embed pass.
    content_hash: str = ""
    # Original file bytes, stored to local_blob_storage alongside the
    # already-extracted full_text — added specifically so a citation can
    # open a true native preview (real PDF embed, real CSV/XLSX table),
    # not just the extracted-text-with-highlight view. Scoped to KB docs
    # only — raw source data files uploaded in chat still never touch
    # disk (app/tools/upload_ingestion.py's privacy boundary is unchanged).
    # None for documents ingested before this field existed — the preview
    # route degrades to the existing text view when unset, no migration
    # needed.
    blob_path: Optional[str] = None
    original_extension: str = ""


class ADM_BusinessStandardsDocument(BaseModel):
    """
    One document PER PROJECT — re-uploading overwrites the prior one
    (upsert on project_id alone). Deliberately NOT chunked, NOT embedded,
    NOT stored in modeling_reference: read whole, by app.agents.
    context_builder.ADM_build_run_invariant_context, as run-invariant
    context for every Stage 1-4 task — there's no citation/semantic-search
    concept for this collection, unlike modeling reference docs.
    """
    project_id: str
    source_filename: str
    full_text: str
    uploaded_by: str
    uploaded_at: str = Field(default_factory=ADM_now)


class ADM_BusinessStandardsUpdateRequest(BaseModel):
    """The direct-text-edit path (PATCH) — the file-upload path (PUT) uses
    multipart Form fields instead, see routes_projects.py."""
    full_text: Optional[str] = None


class ADM_Citation(BaseModel):
    """What gets attached to a chat message / provenance entry whenever an
    LLM answer draws on retrieved KB content — enough to render 'the whole
    doc, with this chunk highlighted' client-side, no extra lookups needed
    beyond GET /kb/documents/{source_doc_id}."""
    source_doc_id: str
    chunk_id: str
    title: str
    chunk_index: int
    char_start: int
    char_end: int
    snippet: str                         # short preview, not the full chunk
    score: Optional[float] = None