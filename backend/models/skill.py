"""
Skill model — updated to match ADM_2.0_BUILD_SPEC.md §4.2 skills collection schema.

New fields:
  scope:         "builtin" | "project_shared" | "project_private"
  stage_binding: "source_analysis" | "conceptual" | "logical" | "physical" | "cross_cutting"
  project_id:    str | None  (None = builtin, scoped to a project otherwise)
  version:       int         (increments on each edit; used for determinism-cache invalidation)
  source_file_ref: str | None (blob_uri of the original uploaded skill file)
  content_hash:  str         (SHA-256 of content_md; keyed by Tier-1/2 determinism cache)
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from models.user import PyObjectId

STAGE_BINDINGS = {"source_analysis", "conceptual", "logical", "physical", "cross_cutting"}
SCOPES = {"builtin", "project_shared", "project_private"}


class SkillModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    # Core content
    name: str
    title: str = ""                          # Human-readable display title
    description: str = ""
    content_md: str = ""                     # Markdown skill instructions (canonical field)
    # Legacy compat — some routes use 'content'; keep both pointing to the same data
    content: str = ""

    # Scoping (BUILD_SPEC §3.3)
    scope: str = "project_private"           # builtin | project_shared | project_private
    project_id: Optional[str] = None        # None = builtin

    # Stage binding (AGENT_ARCH_V2 §3.1)
    stage_binding: str = "cross_cutting"     # source_analysis | conceptual | logical | physical | cross_cutting

    # Ownership
    owner_id: Optional[str] = None          # None = builtin
    created_by: Optional[str] = None        # legacy alias for owner_id

    # Versioning (hash used for determinism-cache invalidation)
    version: int = 1
    content_hash: str = ""
    source_file_ref: Optional[str] = None   # blob_uri of original upload

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    @model_validator(mode="after")
    def _sync_fields(self) -> "SkillModel":
        # Keep content and content_md in sync (content_md is canonical)
        if self.content_md and not self.content:
            self.content = self.content_md
        elif self.content and not self.content_md:
            self.content_md = self.content
        # Keep owner_id and created_by in sync
        if self.owner_id and not self.created_by:
            self.created_by = self.owner_id
        elif self.created_by and not self.owner_id:
            self.owner_id = self.created_by
        # Auto-compute content hash
        if self.content_md and not self.content_hash:
            self.content_hash = hashlib.sha256(self.content_md.encode()).hexdigest()
        # Auto-set title from name if not provided
        if self.name and not self.title:
            self.title = self.name
        return self


class SkillCreate(BaseModel):
    name: str
    title: str = ""
    description: str = ""
    content: str = ""
    content_md: str = ""
    scope: str = "project_private"
    project_id: Optional[str] = None
    stage_binding: str = "cross_cutting"
    source_file_ref: Optional[str] = None


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    content_md: Optional[str] = None
    scope: Optional[str] = None
    stage_binding: Optional[str] = None


class SkillEnhanceRequest(BaseModel):
    """Body for POST /skills/{id}/enhance — routed to SkillCuratorAgent."""
    enhancement_instructions: str = ""       # Free text describing what to improve
    edge_cases: list[str] = []              # Specific edge cases to add


class SkillEnhanceResponse(BaseModel):
    """Diff-style response — person must see exactly what changed before saving."""
    original_content: str
    proposed_content: str
    diff_summary: str                       # Human-readable summary of changes
    thinking: list[str] = []


class SkillResponse(BaseModel):
    id: str
    name: str
    title: str = ""
    description: str = ""
    content: str = ""
    content_md: str = ""
    scope: str = "project_private"
    project_id: Optional[str] = None
    stage_binding: str = "cross_cutting"
    owner_id: Optional[str] = None
    created_by: Optional[str] = None
    version: int = 1
    content_hash: str = ""
    source_file_ref: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
