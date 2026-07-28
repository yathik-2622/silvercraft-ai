"""
Project model — updated to match ADM_2.0_BUILD_SPEC.md §4.2 projects collection.

Key changes:
  - members[] array with RBAC roles (owner/editor/viewer) — BUILD_SPEC §5.1
  - shared_with[] kept for backward compatibility (derived from members[])
  - active_skill_bindings map per AGENT_ARCH_V2 §3.2
  - session_summary stub for rolling summarization (BUILD_SPEC §4.3)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from models.user import PyObjectId

ROLES = {"owner", "editor", "viewer"}


class ProjectMember(BaseModel):
    """Single entry in projects.members[] — BUILD_SPEC §4.2 + §5.1."""
    user_id: str
    role: str = "viewer"   # owner | editor | viewer
    added_at: datetime = Field(default_factory=datetime.utcnow)
    added_by: Optional[str] = None


class CanvasState(BaseModel):
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    viewport: Dict[str, Any] = {"x": 0, "y": 0, "zoom": 1}


class ProjectHistoryEntry(BaseModel):
    state: CanvasState
    saved_at: datetime = Field(default_factory=datetime.utcnow)
    saved_by: str


class ProjectModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    description: Optional[str] = None
    owner_id: str

    # ── RBAC — BUILD_SPEC §4.2, §5.1 ─────────────────────────────────────────
    # Canonical: members[] with roles.  shared_with[] is the derived ID list
    # (kept for query compat — populated automatically from members[]).
    members: List[ProjectMember] = []
    shared_with: List[str] = []          # derived; kept for backward compat queries

    # ── Project configuration ─────────────────────────────────────────────────
    domain: str = ""
    sub_domain: str = ""
    layer: str = "foundation"            # foundation | product
    execution_flow: str = "default"      # default | custom
    workflow_mode: str = "default"       # default | custom
    target_dialect: str = "snowflake"    # snowflake | postgres | bigquery | sqlserver
    collaborators: List[str] = []        # emails — used at creation for invite

    # ── Skill bindings — AGENT_ARCH_V2 §3.2 ──────────────────────────────────
    # Map of stage → list[skill_id]. Auto-populated when SkillCuratorAgent binds a skill.
    active_skill_bindings: Dict[str, List[str]] = {
        "source_analysis": [],
        "conceptual": [],
        "logical": [],
        "physical": [],
    }

    # ── Legacy project-level LLM override (per-chat preferred; this is fallback) ─
    naming_convention_skill_ref: Optional[str] = None
    modeling_style_skill_ref: Optional[str] = None
    llm_provider: str = "platform"       # platform | custom
    llm_api_key: Optional[str] = None    # encrypted at rest (never returned plaintext)
    llm_base_url: Optional[str] = None
    llm_model_name: Optional[str] = None

    # ── Canvas + History ──────────────────────────────────────────────────────
    canvas_state: CanvasState = Field(default_factory=CanvasState)
    history: List[ProjectHistoryEntry] = []

    # ── Session summary (rolling summarization — BUILD_SPEC §4.3) ────────────
    session_summary: str = ""

    # ── Misc ─────────────────────────────────────────────────────────────────
    source_connects: Dict[str, Any] = {}
    naming_rules: str = "snake_case"
    ui_preferences: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    domain: str = ""
    sub_domain: str = ""
    layer: str = "foundation"
    execution_flow: str = "default"
    workflow_mode: str = "default"
    target_dialect: str = "snowflake"
    # Members at creation: list of {email, role} objects
    member_invites: List[Dict[str, str]] = []
    # Legacy flat email list (backward compat)
    collaborators: List[str] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    domain: Optional[str] = None
    sub_domain: Optional[str] = None
    layer: Optional[str] = None
    execution_flow: Optional[str] = None
    workflow_mode: Optional[str] = None
    target_dialect: Optional[str] = None
    canvas_state: Optional[CanvasState] = None
    source_connects: Optional[Dict[str, Any]] = None
    naming_rules: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model_name: Optional[str] = None
    ui_preferences: Optional[Dict[str, Any]] = None
    active_skill_bindings: Optional[Dict[str, List[str]]] = None
    session_summary: Optional[str] = None


class ProjectMemberInvite(BaseModel):
    """Body for POST /projects/{id}/members."""
    email: str
    role: str = "viewer"    # editor | viewer (owner is implicit at creation)


class ProjectMemberRoleUpdate(BaseModel):
    """Body for PATCH /projects/{id}/members/{member_id}."""
    role: str               # editor | viewer


# Legacy alias — some existing routes use this
class ProjectTeamMemberUpdate(BaseModel):
    email: str


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    members: List[ProjectMember] = []
    shared_with: List[str] = []
    domain: str = ""
    sub_domain: str = ""
    layer: str = "foundation"
    execution_flow: str = "default"
    workflow_mode: str = "default"
    target_dialect: str = "snowflake"
    collaborators: List[str] = []
    active_skill_bindings: Dict[str, List[str]] = {}
    canvas_state: CanvasState = Field(default_factory=CanvasState)
    source_connects: Dict[str, Any] = {}
    naming_rules: str = "snake_case"
    llm_provider: str = "platform"
    llm_base_url: Optional[str] = None
    llm_model_name: Optional[str] = None
    ui_preferences: Dict[str, Any] = {}
    session_summary: str = ""
    created_at: datetime
    updated_at: datetime
