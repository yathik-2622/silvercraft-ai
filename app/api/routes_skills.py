"""
Skill Library + Skill Normalizer endpoints — TDS §5 rows 10-12, §6.
"""
import asyncio

import yaml
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.celery_app.tasks import ADM_embed_skill_task, ADM_normalize_skill_task
from app.core.auth import ADM_get_current_user_id
from app.db.mongo_client import ADM_get_db
from app.db.collections import ADM_COLLECTION_SKILLS, ADM_COLLECTION_SKILL_DRAFTS
from app.models.schemas import ADM_Skill, ADM_SkillImportRequest, ADM_new_id, ADM_now
from app.agents.skill_normalizer import ADM_supply_missing_fields, ADM_approve_skill_draft
from app.tools.document_text_extract import ADM_extract_document_text

router = APIRouter(tags=["skills"])


@router.get("/skills")
async def ADM_list_skills(
    kind: str | None = None, scope: str | None = None, q: str | None = None,
    mine: bool = False,
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    """Skill Library page (§6): filterable by kind, scope, searchable by
    title/purpose. `mine=true` restricts to skills created by the calling
    user (created_by_user_id) — this is the "My Skills" tab's query, not
    just scope=user (which would show every user's personal skills mixed
    together, not just the caller's own)."""
    db = ADM_get_db()
    query: dict = {}
    if kind:
        query["kind"] = kind
    if scope:
        query["scope"] = scope
    if mine:
        query["created_by_user_id"] = current_user_id
    if q:
        query["$or"] = [{"title": {"$regex": q, "$options": "i"}},
                         {"purpose": {"$regex": q, "$options": "i"}}]
    docs = await db[ADM_COLLECTION_SKILLS].find(query, {"_id": 0}).to_list(length=500)
    return docs


@router.get("/skills/{skill_id}")
async def ADM_get_skill(skill_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_SKILLS].find_one({"skill_id": skill_id}, {"_id": 0}, sort=[("version", -1)])
    if not doc:
        raise HTTPException(404, "Skill not found")
    return doc


@router.post("/skills/import")
async def ADM_import_skill(body: ADM_SkillImportRequest, current_user_id: str = Depends(ADM_get_current_user_id)):
    """
    Row 10: streams/parses in-memory (§3 policy), enqueues normalize_skill_task.
    raw_text is the already-extracted text content of the uploaded file —
    the file bytes themselves are never persisted anywhere upstream of this call.

    draft_id is generated here and handed to the Celery task rather than
    left for the task to generate itself — this is the only DB-free way
    to return it synchronously, so a UI (the `/create skill` composer
    modal in particular) has something to poll/stream immediately instead
    of no way to find out which draft its upload produced.
    """
    draft_id = ADM_new_id("draft")
    ADM_normalize_skill_task.delay(body.project_id, body.raw_text, None, "user", draft_id)
    return {"status": "accepted", "draft_id": draft_id}


@router.post("/skills/import-file")
async def ADM_import_skill_file(
    project_id: str = Form(...),
    file: UploadFile = File(...),
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    """
    File-upload variant of POST /skills/import, for the in-chat
    `/create skill` modal's upload option. Mirrors
    app/api/routes_admin.py's ADM__handle_skill_upload exactly — same
    deterministic YAML fast-path (already-structured, no Normalizer
    round-trip needed), same ADM_extract_document_text call for any other
    format, same downstream normalize_skill_task hand-off — just at
    scope="user" (attributed to the uploading user, findable via
    GET /skills?mine=true) instead of admin's forced scope="global", and
    with no ADM_require_admin gate. See that module's docstring for why
    convert-then-embed order matters for the free-text path.
    """
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

    if ext in (".yaml", ".yml"):
        try:
            raw = (await file.read()).decode("utf-8")
        finally:
            await file.close()
        try:
            data = await asyncio.to_thread(yaml.safe_load, raw)
        except yaml.YAMLError as e:
            raise HTTPException(400, f"Invalid YAML: {e}")
        if not isinstance(data, dict) or "skill_id" not in data or "kind" not in data:
            raise HTTPException(400, "Skill YAML must be a mapping with at least 'skill_id' and 'kind'.")

        data["scope"] = "user"
        data["created_by_user_id"] = current_user_id
        try:
            skill = ADM_Skill(**data)
        except Exception as e:
            raise HTTPException(400, f"Skill file doesn't match the schema: {e}")

        db = ADM_get_db()
        skill_doc = skill.model_dump()
        skill_doc["last_modified"] = ADM_now()
        # scope is part of the filter — skill_id+version alone isn't unique
        # across scopes (the same skill_id legitimately exists at both
        # scope=global and scope=user, see ADM_resolve_workflow_skill's
        # scope-priority lookup). Omitting it would upsert into (and
        # silently overwrite) whichever other-scoped document happens to
        # share this skill_id+version — confirmed the hard way: this is
        # the same filter shape app/api/routes_admin.py's
        # ADM__handle_skill_upload uses, and it clobbered the real
        # scope=global profile_source skill during testing.
        await db[ADM_COLLECTION_SKILLS].update_one(
            {"skill_id": skill.skill_id, "scope": "user", "version": skill.version}, {"$set": skill_doc}, upsert=True,
        )
        ADM_embed_skill_task.delay(skill.skill_id, skill.version, skill.scope)
        return {
            "status": "uploaded", "path": "direct_yaml", "skill_id": skill.skill_id,
            "kind": skill.kind, "version": skill.version, "scope": "user",
        }

    # Non-YAML — free-form description, needs the Normalizer (same
    # convert-then-embed reasoning as the admin path).
    try:
        text = await asyncio.to_thread(ADM_extract_document_text, file.file, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        await file.close()

    if not text.strip():
        raise HTTPException(400, "No extractable text found in this file.")

    draft_id = ADM_new_id("draft")
    ADM_normalize_skill_task.delay(project_id, text, None, "user", draft_id)
    return {"status": "accepted", "path": "normalizer", "draft_id": draft_id}


@router.get("/skill-drafts/{draft_id}")
async def ADM_get_skill_draft(draft_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_SKILL_DRAFTS].find_one({"draft_id": draft_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Draft not found")
    return doc


@router.patch("/skill-drafts/{draft_id}")
async def ADM_patch_skill_draft(draft_id: str, field_values: dict, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Row 11a: supply the specific missing fields the Orchestrator asked for."""
    draft = await ADM_supply_missing_fields(draft_id, field_values)
    return draft


@router.post("/skill-drafts/{draft_id}/approve")
async def ADM_approve_draft(draft_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Row 12: moves draft to `skills` at its target scope (user or global)."""
    try:
        skill = await ADM_approve_skill_draft(draft_id, current_user_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return skill