"""
Skill Normalizer — TDS §5 rows 10-12, §6. Constrained-extraction adapter,
runs as one Celery task. Maps a user-uploaded, free-form skill description
into the exact Task/Workflow Skill schema, without paraphrasing or
inventing content.

Streams its extraction reasoning live (chat_id optional — normalize_skill_task
always has one when triggered from a chat-attached upload; scripts/tests
that call this directly simply omit it).
"""
from app.core.reasoning_stream import ADM_SOURCE_SKILL_NORMALIZER, ADM_stream_agent_call, ADM_stream_log
from app.db.mongo_client import ADM_get_db
from app.db.collections import ADM_COLLECTION_SKILL_DRAFTS, ADM_COLLECTION_SKILLS
from app.models.schemas import ADM_SkillDraft, ADM_Skill, ADM_now
from app.tools.skill_normalizer_extract import ADM_extract_skill_from_text


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
        await ADM_stream_log(chat_id, ADM_SOURCE_SKILL_NORMALIZER, "Constrained-extraction: mapping uploaded skill text into the Skill schema (never inventing missing fields)...")

    extraction = await ADM_extract_skill_from_text(raw_text)
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
    skill = ADM_Skill(
        skill_id=fields["skill_id"],
        kind=fields["kind"],
        scope=target_scope,
        title=fields["title"],
        purpose=fields["purpose"],
        prompt=fields["prompt"],
        tools=fields.get("tools", []),
        expected_output=fields.get("expected_output", ""),
        stage=fields.get("stage"),
        modeling_style=fields.get("modeling_style", "canonical"),
        created_by_user_id=current_user_id if target_scope != "global" else None,
    )
    # scope AND version are both part of the filter — skill_id+scope alone
    # isn't unique across versions, and skill_id+version alone isn't unique
    # across scopes (the same skill_id legitimately exists at both
    # scope=global and scope=user, see ADM_resolve_workflow_skill's
    # scope-priority lookup). Same filter shape as the direct-YAML upload
    # paths in routes_admin.py/routes_skills.py and
    # vector_search.ADM_embed_and_store_skill.
    await db[ADM_COLLECTION_SKILLS].update_one(
        {"skill_id": skill.skill_id, "scope": target_scope, "version": skill.version},
        {"$set": skill.model_dump()},
        upsert=True,
    )
    await db[ADM_COLLECTION_SKILL_DRAFTS].update_one(
        {"draft_id": draft_id}, {"$set": {"status": "approved"}}
    )

    from app.db.vector_search import ADM_embed_and_store_skill
    await ADM_embed_and_store_skill(skill.skill_id, skill.version, skill.scope)

    return skill
