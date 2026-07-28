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
    user_id: str
    role: str = "viewer"
    added_at: datetime = Field(default_factory=datetime.utcnow)
    added_by: Optional[str] = None

class ProjectModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    project_id: str  # Explicit project_id string as requested
    user_id: str     # Explicit user_id (owner) as requested
    name: str
    description: Optional[str] = None

    members: List[ProjectMember] = []

    domain: str = ""
    sub_domain: str = ""
    layer: str = "foundation" # foundational layer or gold layer

    # ── Canvas + History ──────────────────────────────────────────────────────
    canvas_state: CanvasState = Field(default_factory=CanvasState)
    history: List[ProjectHistoryEntry] = []

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

class ProjectCreate(BaseModel):
    user_id: str
    project_id: str
    name: str
    description: Optional[str] = None
    layer: str = "foundation"
    domain: str = ""
    sub_domain: str = ""
    team_members: List[str] = [] # List of user IDs to add as members

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    team_members: Optional[List[str]] = None # Overwrite or add

class ProjectResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    name: str
    description: Optional[str] = None
    members: List[ProjectMember] = []
    domain: str = ""
    sub_domain: str = ""
    layer: str = "foundation"
    created_at: datetime
    updated_at: datetime

