"""
Admin ingestion — the real replacement for seed.py. One upload page, one
endpoint, two dropdown-driven behaviors:

  kb_type=modeling  -> chunking_strategy applies. Any of .md/.txt/.pdf/
                        .docx/.pptx. Chunked, embedded, stored as
                        modeling_reference rows (chunk-level, citable).

  kb_type=skill     -> chunking_strategy is ignored (skills aren't
                        chunked — they're small structured units, one
                        embedding each). A .yaml/.yml file is parsed
                        directly (deterministic, exact schema match) and
                        written straight to `skills` at scope=global —
                        this is what makes it show up on the Skill
                        Library page immediately, because Skill Library
                        already reads directly from `skills` with no
                        separate sync step needed. Any other format goes
                        through the Skill Normalizer's free-text
                        extraction first (convert to the standard
                        template, THEN embed — never the other way
                        around, see module note below), also landing at
                        scope=global since this is an admin upload.

  Every admin-uploaded skill lands at scope=global, regardless of what a
  YAML file's own `scope` field says — admin content is platform-
  authoritative by definition, distinct from a regular user's in-chat
  skill import (which stays scope=user, unaffected by anything here; see
  app/agents/skill_normalizer.py's target_scope parameter, which both
  paths share).

  Convert-then-embed, not embed-then-convert: a free-text upload is
  ALWAYS normalized into the schema (title/purpose/expected_output)
  before anything is embedded. Embedding raw, unstructured text would put
  it in a different, inconsistent region of the same vector space as
  every templated skill's embedding, degrading every future semantic
  search's ranking — not just for this skill, for all of them. This
  applies identically whether the free-text upload came from a regular
  user or from an admin.

Every route here requires ADM_require_admin, not just ADM_get_current_user_id.
Text/format extraction (pypdf/python-docx/python-pptx/PyYAML) is
synchronous, CPU/IO-bound work — run via asyncio.to_thread so it can't
block the event loop for other concurrent requests on the same worker.
"""
import asyncio

import yaml
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.celery_app.tasks import ADM_embed_skill_task, ADM_ingest_kb_document_task, ADM_normalize_skill_task
from app.core.auth import ADM_require_admin
from app.core.chunking import ADM_CHUNKING_STRATEGIES
from app.core.redis_pubsub import ADM_subscribe_chat_channel
from app.db.collections import ADM_COLLECTION_BUSINESS_STANDARDS, ADM_COLLECTION_KB_DOCUMENTS, ADM_COLLECTION_PROJECTS, ADM_COLLECTION_SKILLS
from app.db.mongo_client import ADM_get_db
from app.db.vector_search import ADM_delete_modeling_reference_chunks
from app.models.schemas import ADM_BusinessStandardsDocument, ADM_KbDocument, ADM_Skill, ADM_new_id, ADM_now
from app.tools.document_text_extract import ADM_extract_document_text

router = APIRouter(prefix="/admin", tags=["admin"])

ADM_KB_TYPES = {
    "modeling": "Modelling reference documents — methodology, rules, best practices. Chunked and embedded for semantic retrieval.",
    "skill": "Skill files — Workflow/Task/Utility Skill YAML (parsed directly, scope forced to global) or a free-form skill description (Skill Normalizer, converted to template then embedded, scope forced to global).",
    "business_standards": "Project-scoped business rules/standards text. Stored whole (no chunking, no embedding) as run-invariant context for that project's modeling runs — one document per project_id, re-uploading overwrites the prior one.",
}


@router.get("/kb/config")
async def ADM_admin_kb_config(admin_user_id: str = Depends(ADM_require_admin)):
    """Single call to populate both UI dropdowns: KB type, and chunking strategy (shown only when kb_type=modeling)."""
    return {"kb_types": ADM_KB_TYPES, "chunking_strategies": ADM_CHUNKING_STRATEGIES}


# ---------------------------------------------------------------------------
# The one upload endpoint
# ---------------------------------------------------------------------------

@router.post("/kb/upload")
async def ADM_admin_upload(
    kb_type: str = Form(..., description="'modeling', 'skill', or 'business_standards' — see GET /admin/kb/config"),
    file: UploadFile = File(...),
    title: str | None = Form(None, description="Required for kb_type=modeling; ignored otherwise (skill titles come from the YAML; business_standards has no title)."),
    chunking_strategy: str = Form("markdown", description="Only used when kb_type=modeling — see GET /admin/kb/config"),
    project_id: str | None = Form(None, description="Required for kb_type=business_standards; only required for kb_type=skill with a non-YAML (free-text) file."),
    admin_user_id: str = Depends(ADM_require_admin),
):
    if kb_type not in ADM_KB_TYPES:
        raise HTTPException(400, f"kb_type must be one of {list(ADM_KB_TYPES)}")

    if kb_type == "skill":
        return await ADM__handle_skill_upload(file, project_id, admin_user_id)
    if kb_type == "business_standards":
        return await ADM__handle_business_standards_upload(file, project_id, admin_user_id)
    return await ADM__handle_modeling_upload(file, title, chunking_strategy, admin_user_id)


async def ADM__handle_modeling_upload(file: UploadFile, title: str | None, chunking_strategy: str, admin_user_id: str):
    if not title:
        raise HTTPException(400, "title is required for kb_type=modeling")
    if chunking_strategy not in ADM_CHUNKING_STRATEGIES:
        raise HTTPException(400, f"chunking_strategy must be one of {list(ADM_CHUNKING_STRATEGIES)}")

    try:
        # Synchronous parsing library (pypdf/python-docx/python-pptx) run in
        # a thread — never block the event loop with this.
        text = await asyncio.to_thread(ADM_extract_document_text, file.file, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        await file.close()

    if not text.strip():
        raise HTTPException(400, "No extractable text found in this file.")

    doc = ADM_KbDocument(
        title=title, filename=file.filename, full_text=text, char_length=len(text),
        chunking_strategy=chunking_strategy, uploaded_by=admin_user_id,
    )
    db = ADM_get_db()
    await db[ADM_COLLECTION_KB_DOCUMENTS].insert_one(doc.model_dump())

    ADM_ingest_kb_document_task.delay(doc.doc_id, admin_user_id)
    return {"doc_id": doc.doc_id, "status": "processing", "char_length": doc.char_length, "chunking_strategy": chunking_strategy}


async def ADM__handle_skill_upload(file: UploadFile, project_id: str | None, admin_user_id: str):
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

        # Admin uploads are platform-authoritative — scope is always forced
        # to global, regardless of what the YAML file itself declares.
        original_scope = data.get("scope")
        data["scope"] = "global"
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
        # share this skill_id+version — this exact filter shape clobbered
        # the real scope=global profile_source skill during testing of the
        # user-facing mirror of this endpoint (app/api/routes_skills.py's
        # ADM_import_skill_file), before that one got the same fix.
        await db[ADM_COLLECTION_SKILLS].update_one(
            {"skill_id": skill.skill_id, "scope": "global", "version": skill.version}, {"$set": skill_doc}, upsert=True,
        )
        # Embeds asynchronously via Celery (LLM-gateway call, never inline).
        # No separate "sync to Skill Library" step needed — GET /skills
        # already reads this same collection directly.
        ADM_embed_skill_task.delay(skill.skill_id, skill.version, skill.scope)
        result = {"status": "uploaded", "path": "direct_yaml", "skill_id": skill.skill_id, "kind": skill.kind, "version": skill.version, "scope": "global"}
        if original_scope and original_scope != "global":
            result["note"] = f"YAML declared scope='{original_scope}' — forced to 'global' for admin uploads."
        return result

    # Non-YAML skill file — free-form description, needs the Normalizer.
    # Convert to template FIRST (Normalizer), THEN embed — never the other
    # way around, see the module docstring for why.
    if not project_id:
        raise HTTPException(
            400,
            "This file isn't a .yaml/.yml Skill file, so it needs the Skill Normalizer's "
            "free-text extraction — that path is project-scoped, so 'project_id' is required "
            "for this upload. It will still land at scope='global' once approved (admin upload), "
            "same as the direct-YAML path — see app/agents/skill_normalizer.py's target_scope.",
        )
    try:
        text = await asyncio.to_thread(ADM_extract_document_text, file.file, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        await file.close()

    draft_id = ADM_new_id("draft")
    ADM_normalize_skill_task.delay(project_id, text, None, "global", draft_id)
    return {
        "status": "accepted", "path": "normalizer", "target_scope": "global", "draft_id": draft_id,
        "note": "Poll GET /skill-drafts/{draft_id}, then POST /skill-drafts/{draft_id}/approve — it will land at scope=global and be embedded automatically.",
    }


async def ADM__handle_business_standards_upload(file: UploadFile, project_id: str | None, admin_user_id: str):
    """
    kb_type=business_standards. Deterministic text extraction only — same
    ADM_extract_document_text every other kb_type uses — then ONE Mongo
    upsert, no Celery task at all (no LLM/embedding call happens here, so
    there's nothing that needs to run off the request thread). Runs inline
    in FastAPI for the same reason /uploads does: this is plain,
    deterministic computation, not agent/LLM logic.
    """
    if not project_id:
        raise HTTPException(400, "project_id is required for kb_type=business_standards")

    db = ADM_get_db()
    project = await db[ADM_COLLECTION_PROJECTS].find_one({"project_id": project_id}, {"_id": 0, "project_id": 1})
    if not project:
        raise HTTPException(404, f"No project with id '{project_id}'")

    try:
        text = await asyncio.to_thread(ADM_extract_document_text, file.file, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        await file.close()

    if not text.strip():
        raise HTTPException(400, "No extractable text found in this file.")

    doc = ADM_BusinessStandardsDocument(
        project_id=project_id, source_filename=file.filename, full_text=text, uploaded_by=admin_user_id,
    )
    # Upsert on project_id ALONE — one business-standards document per
    # project, by design; re-uploading for the same project replaces it
    # rather than accumulating a history.
    await db[ADM_COLLECTION_BUSINESS_STANDARDS].update_one(
        {"project_id": project_id}, {"$set": doc.model_dump()}, upsert=True,
    )
    return {"status": "uploaded", "project_id": project_id, "char_length": len(text)}


# ---------------------------------------------------------------------------
# Ingestion progress + document management
# ---------------------------------------------------------------------------

@router.get("/kb/upload/{doc_id}/stream")
async def ADM_admin_kb_ingest_stream(doc_id: str, admin_user_id: str = Depends(ADM_require_admin)):
    """NDJSON reasoning stream for one ingestion run — same relay pattern as /chats/{id}/stream."""
    channel_id = f"kb_ingest:{doc_id}"

    async def relay():
        pubsub = await ADM_subscribe_chat_channel(channel_id)
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = message["data"]
                line = data if isinstance(data, str) else data.decode("utf-8")
                yield (line + "\n").encode("utf-8")
        finally:
            await pubsub.unsubscribe()

    return StreamingResponse(relay(), media_type="application/x-ndjson")


@router.get("/kb/documents")
async def ADM_admin_list_kb_documents(admin_user_id: str = Depends(ADM_require_admin)):
    db = ADM_get_db()
    docs = await db[ADM_COLLECTION_KB_DOCUMENTS].find(
        {}, {"_id": 0, "full_text": 0}  # list view omits full_text — can be large
    ).sort("uploaded_at", -1).to_list(length=200)
    return docs


@router.delete("/kb/documents/{doc_id}")
async def ADM_admin_delete_kb_document(doc_id: str, admin_user_id: str = Depends(ADM_require_admin)):
    db = ADM_get_db()
    result = await db[ADM_COLLECTION_KB_DOCUMENTS].delete_one({"doc_id": doc_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Document not found")
    deleted_chunks = await ADM_delete_modeling_reference_chunks(doc_id)
    return {"status": "deleted", "doc_id": doc_id, "chunks_removed": deleted_chunks}
