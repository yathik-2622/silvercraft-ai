"""
Skill Normalizer — TDS §5 rows 10-12, §6. Constrained-drafting adapter,
runs as one Celery task. Maps a user-uploaded, free-form skill description
into a complete Task/Workflow/Utility Skill definition — see
app/tools/skill_normalizer_extract.py's module docstring for the Phase 6
policy change (draft everything except skill_id/title, never leave the
rest blank for the user to fill in).

Streams its extraction reasoning live (chat_id optional — normalize_skill_task
always has one when triggered from a chat-attached upload; scripts/tests
that call this directly simply omit it).
"""
import logging

from app.core.reasoning_stream import ADM_SOURCE_SKILL_NORMALIZER, ADM_stream_agent_call, ADM_stream_log
from app.db.mongo_client import ADM_get_db
from app.db.collections import ADM_COLLECTION_SKILL_DRAFTS, ADM_COLLECTION_SKILLS
from app.models.schemas import ADM_SkillDraft, ADM_Skill, ADM_now
from app.tools.skill_normalizer_extract import ADM_extract_skill_from_text

logger = logging.getLogger(__name__)


async def ADM_load_task_skill_catalog() -> list[dict]:
    """Reference context for workflow task_list drafting (see
    skill_normalizer_extract.py) — every global, kind=task skill's
    skill_id/title/purpose, so the LLM can match a described step to a
    real skill instead of inventing a duplicate. Kept to the LATEST
    version per skill_id (a workflow shouldn't reference a stale one)."""
    from app.db.vector_search import ADM__dedupe_latest_skill_version

    db = ADM_get_db()
    docs = await db[ADM_COLLECTION_SKILLS].find(
        {"kind": "task", "scope": "global"}, {"_id": 0, "skill_id": 1, "title": 1, "purpose": 1, "version": 1}
    ).to_list(length=200)
    return ADM__dedupe_latest_skill_version(docs)


async def ADM_normalize_skill(
    project_id: str, raw_text: str, chat_id: str | None = None,
    target_scope: str = "user", draft_id: str | None = None,
) -> ADM_SkillDraft:
    """
    §3 policy applies here too: raw_text is only ever held in memory for
    the duration of this call; only the resulting draft (extracted schema
    fields) is persisted, never the original free-form file content.

    `target_scope` decides where an approved draft lands: "user" for the
    normal in-chat skill import flow, "global" for admin uploads — same
    extraction pipeline either way, since the whole point is that every
    free-text skill gets mapped into the same template before it's ever
    embedded, regardless of who uploaded it.

    `draft_id`, if provided, is used instead of generating a fresh one —
    this is what lets the calling route (POST /skills/import,
    POST /admin/kb/upload) return the draft_id to the client
    synchronously, before this async extraction has even started, so a
    UI can poll/stream it immediately instead of having no way to find
    out which draft its upload produced.
    """
    if chat_id:
        await ADM_stream_log(chat_id, ADM_SOURCE_SKILL_NORMALIZER, "Drafting a complete skill definition from the uploaded text (only skill ID/title will ever be asked of you)...")

    task_catalog = await ADM_load_task_skill_catalog()
    logger.info("ADM_normalize_skill: project_id=%s target_scope=%s task_catalog_size=%d", project_id, target_scope, len(task_catalog))
    extraction = await ADM_extract_skill_from_text(raw_text, task_catalog=task_catalog)
    draft_kwargs = {
        "project_id": project_id,
        "extracted": extraction["extracted"],
        "missing_fields": extraction["missing_fields"],
        "status": "awaiting_clarification" if extraction["missing_fields"] else "pending",
        "target_scope": target_scope,
    }
    if draft_id:
        draft_kwargs["draft_id"] = draft_id
    draft = ADM_SkillDraft(**draft_kwargs)
    db = ADM_get_db()
    await db[ADM_COLLECTION_SKILL_DRAFTS].insert_one(draft.model_dump())

    if chat_id:
        if extraction["missing_fields"]:
            await ADM_stream_log(chat_id, ADM_SOURCE_SKILL_NORMALIZER, f"Extraction incomplete — missing fields: {extraction['missing_fields']}. Will ask the user rather than guessing.")
            await ADM_stream_agent_call(chat_id, ADM_SOURCE_SKILL_NORMALIZER, "orchestrator", "Handing back to Orchestrator to ask the user for missing fields.")
        else:
            await ADM_stream_log(chat_id, ADM_SOURCE_SKILL_NORMALIZER, f"Extraction complete — draft {draft.draft_id} ready for approval.")
    return draft


async def ADM_supply_missing_fields(draft_id: str, field_values: dict) -> ADM_SkillDraft:
    db = ADM_get_db()
    draft_doc = await db[ADM_COLLECTION_SKILL_DRAFTS].find_one({"draft_id": draft_id})
    if not draft_doc:
        raise ValueError(f"No such skill draft: {draft_id}")

    extracted = {**draft_doc["extracted"], **field_values}
    still_missing = [f for f in draft_doc["missing_fields"] if f not in field_values]

    await db[ADM_COLLECTION_SKILL_DRAFTS].update_one(
        {"draft_id": draft_id},
        {"$set": {
            "extracted": extracted,
            "missing_fields": still_missing,
            "status": "pending" if not still_missing else "awaiting_clarification",
        }},
    )
    draft_doc.update({"extracted": extracted, "missing_fields": still_missing})
    return ADM_SkillDraft(**draft_doc)


async def ADM_approve_skill_draft(draft_id: str, current_user_id: str | None = None) -> ADM_Skill:
    """Row 12: moves a draft to `skills` at its draft-declared target_scope
    ("user" for the normal in-chat flow, "global" for admin uploads).

    `created_by_user_id` is set to the approving user for target_scope
    "user" (a personal skill — this is what makes GET /skills?mine=true
    answerable), and left None for target_scope "global" (an admin
    upload — nothing personal to attribute, matches the direct-YAML admin
    path, which also leaves this field unset)."""
    db = ADM_get_db()
    draft_doc = await db[ADM_COLLECTION_SKILL_DRAFTS].find_one({"draft_id": draft_id})
    if not draft_doc:
        raise ValueError(f"No such skill draft: {draft_id}")
    if draft_doc["missing_fields"]:
        raise ValueError(f"Draft {draft_id} still has missing fields: {draft_doc['missing_fields']}")

    target_scope = draft_doc.get("target_scope", "user")
    fields = draft_doc["extracted"]
    # skill_id/title are guaranteed present — that's exactly what the
    # missing_fields check above gates on. Everything else is now always
    # DRAFTED by the extractor (see skill_normalizer_extract.py's Phase 6
    # policy change), never required to be present — .get() with a safe
    # default rather than a raw KeyError, in case an older draft (created
    # before this change) or a malformed LLM response is missing one.
    skill = ADM_Skill(
        skill_id=fields["skill_id"],
        kind=fields.get("kind", "task"),
        scope=target_scope,
        title=fields["title"],
        purpose=fields.get("purpose", ""),
        prompt=fields.get("prompt", ""),
        tools=fields.get("tools", []),
        expected_output=fields.get("expected_output", ""),
        stage=fields.get("stage"),
        modeling_style=fields.get("modeling_style", "canonical"),
        # Only meaningful for kind="workflow" — drafted by the extractor
        # from a multi-step source description, editable by the user in
        # the CreateSkillModal preview before this approve call runs.
        task_list=fields.get("task_list", []) if fields.get("kind") == "workflow" else [],
        created_by_user_id=current_user_id if target_scope != "global" else None,
    )
    # Server-computed, not the schema default (version=1) — see
    # ADM_next_skill_version's docstring. Approving a draft for a skill_id
    # that already exists at this scope (e.g. re-creating "Flag PII
    # Columns" mid-chat a second time) now lands as its own new version
    # document instead of silently overwriting the first one.
    from app.db.vector_search import ADM_embed_and_store_skill, ADM_next_skill_version
    skill.version = await ADM_next_skill_version(skill.skill_id, target_scope)

    await db[ADM_COLLECTION_SKILLS].insert_one(skill.model_dump())
    await db[ADM_COLLECTION_SKILL_DRAFTS].update_one(
        {"draft_id": draft_id}, {"$set": {"status": "approved"}}
    )

    await ADM_embed_and_store_skill(skill.skill_id, skill.version, skill.scope)

    return skill
