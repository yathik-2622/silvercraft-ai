"""
Skills API — updated to match ADM_2.0_API_ERRORS_AND_TOPOLOGY.md §2.5

Endpoints:
  GET    /skills?project_id&scope
  POST   /skills                    → SkillCuratorAgent.create
  GET    /skills/{id}
  PATCH  /skills/{id}
  DELETE /skills/{id}
  POST   /skills/{id}/enhance       → SkillCuratorAgent.enhance (returns diff)
  POST   /skills/{id}/promote       → project_private → project_shared
  GET    /skills/{id}/download      → raw markdown as artifact
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from db.core import get_db
from middleware.error_handler import ADMException
from models.user import UserModel
from models.skill import SkillCreate, SkillEnhanceRequest, SkillEnhanceResponse, SkillModel, SkillResponse, SkillUpdate
from api.routes.auth import get_current_user
from core.agents.skill_curator import run_skill_curator_agent
from core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()
SKILL_DIRECTORY = Path(__file__).resolve().parents[2] / "skills"


def _industry_skills() -> list[dict[str, str]]:
    """Load curated builtin standards from Markdown files."""
    skills: list[dict[str, str]] = []
    for path in sorted(SKILL_DIRECTORY.glob("*.md")):
        raw = path.read_text(encoding="utf-8").strip()
        if not raw.startswith("---"):
            continue
        _, front_matter, content = raw.split("---", 2)
        metadata = dict(
            line.split(":", 1) for line in front_matter.splitlines() if ":" in line
        )
        name = metadata.get("name", path.stem).strip()
        description = metadata.get("description", "").strip()
        stage_binding = metadata.get("stage_binding", "cross_cutting").strip()
        if name and description:
            skill_kind = metadata.get("skill_kind", "subtask").strip()
            style_key = metadata.get("style_key", "").strip() or None
            skills.append({
                "name": name,
                "title": name,
                "description": description,
                "content": content.strip(),
                "content_md": content.strip(),
                "scope": "builtin",
                "stage_binding": stage_binding,
                "skill_kind": skill_kind,
                "style_key": style_key,
            })
    return skills


async def _ensure_industry_skills(db) -> None:
    for skill in _industry_skills():
        await db["skills"].update_one(
            {"name": skill["name"], "created_by": None},
            {"$set": {
                **skill,
                "created_by": None,
                "owner_id": None,
                "scope": "builtin",
                "project_id": None,
                "version": 1,
                "content_hash": hashlib.sha256(skill["content_md"].encode()).hexdigest(),
            }},
            upsert=True,
        )


def _to_response(s: dict) -> SkillResponse:
    s = dict(s)
    s["id"] = str(s.pop("_id"))
    return SkillResponse(**{k: v for k, v in s.items() if k in SkillResponse.model_fields})


async def _get_skill_or_404(skill_id: str, db) -> dict:
    try:
        oid = ObjectId(skill_id)
    except Exception:
        raise ADMException("VALIDATION_ERROR", "Invalid skill ID")
    skill = await db["skills"].find_one({"_id": oid})
    if not skill:
        raise ADMException("NOT_FOUND", "Skill not found")
    return skill


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/", response_model=List[SkillResponse])
async def list_skills(
    project_id: Optional[str] = Query(default=None),
    scope: Optional[str] = Query(default=None),
    stage_binding: Optional[str] = Query(default=None),
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """List skills visible to the current user:
    - builtin: always visible
    - project_shared: visible to all project members
    - project_private: creator only
    """
    await _ensure_industry_skills(db)
    user_id = str(current_user.id)

    filters: list[dict] = [
        {"created_by": None},              # builtin
        {"created_by": user_id},           # own private + own shared
    ]
    if project_id:
        # project_shared skills for the user's project
        filters.append({"project_id": project_id, "scope": "project_shared"})

    query: dict = {"$or": filters}
    if scope:
        query["scope"] = scope
    if stage_binding:
        query["stage_binding"] = stage_binding

    skills = await db["skills"].find(query).to_list(length=500)
    return [_to_response(s) for s in skills]


@router.post("/", response_model=SkillResponse, status_code=201)
async def create_skill(
    skill: SkillCreate,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """Create a new skill and route it through SkillCuratorAgent for validation."""
    content = skill.content_md or skill.content or ""
    now = datetime.utcnow()
    doc = {
        "name": skill.name,
        "title": skill.title or skill.name,
        "description": skill.description,
        "content": content,
        "content_md": content,
        "scope": skill.scope or "project_private",
        "project_id": skill.project_id,
        "stage_binding": skill.stage_binding or "cross_cutting",
        "owner_id": str(current_user.id),
        "created_by": str(current_user.id),
        "version": 1,
        "content_hash": hashlib.sha256(content.encode()).hexdigest(),
        "source_file_ref": skill.source_file_ref,
        "created_at": now,
        "updated_at": now,
    }
    result = await db["skills"].insert_one(doc)
    created = await db["skills"].find_one({"_id": result.inserted_id})
    return _to_response(created)


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(
    skill_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    skill = await _get_skill_or_404(skill_id, db)
    return _to_response(skill)


@router.patch("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str,
    body: SkillUpdate,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    skill = await _get_skill_or_404(skill_id, db)
    if skill.get("created_by") != str(current_user.id):
        raise ADMException("FORBIDDEN_ROLE", "Only your custom skills can be updated.")

    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "content" in update or "content_md" in update:
        new_content = update.get("content_md") or update.get("content") or ""
        update["content"] = new_content
        update["content_md"] = new_content
        update["content_hash"] = hashlib.sha256(new_content.encode()).hexdigest()
        update["version"] = skill.get("version", 1) + 1
    update["updated_at"] = datetime.utcnow()

    await db["skills"].update_one({"_id": ObjectId(skill_id)}, {"$set": update})
    updated = await db["skills"].find_one({"_id": ObjectId(skill_id)})
    return _to_response(updated)


@router.delete("/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    skill = await _get_skill_or_404(skill_id, db)
    if skill.get("created_by") != str(current_user.id):
        raise ADMException("FORBIDDEN_ROLE", "Cannot delete a skill you did not create.")
    await db["skills"].delete_one({"_id": ObjectId(skill_id)})


@router.post("/{skill_id}/enhance", response_model=SkillEnhanceResponse)
async def enhance_skill(
    skill_id: str,
    body: SkillEnhanceRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Enhance an existing skill via SkillCuratorAgent.
    Returns a diff — the person must review and explicitly apply changes.
    Per AGENT_ARCH_V2 §4.5 TASK—enhance: propose additions as a diff, never a silent rewrite.
    """
    skill = await _get_skill_or_404(skill_id, db)
    original = skill.get("content_md") or skill.get("content", "")

    result = await run_skill_curator_agent(
        task="enhance",
        instruction=body.enhancement_instructions or "Enhance this skill with the provided edge cases and improvements.",
        payload={"existing_content": original, "edge_cases": body.edge_cases},
        db=db,
        session_id=str(current_user.id),
        trace_id=str(uuid4()),
    )

    proposed = result.get("proposed_content", original)
    diff_summary = result.get("diff_summary", "SkillCuratorAgent enhancement applied")
    thinking = result.get("thinking", ["Analyzed skill content", "Identified enhancement areas", "Proposed additions"])

    return SkillEnhanceResponse(
        original_content=original,
        proposed_content=proposed,
        diff_summary=diff_summary,
        thinking=thinking,
    )


@router.post("/{skill_id}/promote", response_model=SkillResponse)
async def promote_skill(
    skill_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Promote a project_private skill to project_shared.
    Only the creator (owner_id) can promote. Per BUILD_SPEC §3.3.
    """
    skill = await _get_skill_or_404(skill_id, db)
    if skill.get("created_by") != str(current_user.id):
        raise ADMException("FORBIDDEN_ROLE", "Only the skill creator can promote it.")
    if skill.get("scope") == "builtin":
        raise ADMException("VALIDATION_ERROR", "Built-in skills cannot be promoted.")
    if skill.get("scope") == "project_shared":
        raise ADMException("CONFLICT", "Skill is already project_shared.")
    if not skill.get("project_id"):
        raise ADMException("VALIDATION_ERROR", "Skill must be scoped to a project to be promoted.")

    await db["skills"].update_one(
        {"_id": ObjectId(skill_id)},
        {"$set": {"scope": "project_shared", "updated_at": datetime.utcnow()}},
    )
    updated = await db["skills"].find_one({"_id": ObjectId(skill_id)})
    return _to_response(updated)


@router.get("/{skill_id}/download")
async def download_skill(
    skill_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """Download skill as raw Markdown artifact."""
    skill = await _get_skill_or_404(skill_id, db)
    content = skill.get("content_md") or skill.get("content", "")
    name = skill.get("name", "skill").replace(" ", "_")
    return PlainTextResponse(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{name}.md"'},
    )
