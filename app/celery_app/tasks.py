"""
The 6 Celery task types from TDS §8. FastAPI never runs LLM/agent logic
inline (app/api/*) — every one of those calls enqueues exactly one of
these. Each task wraps its async work in ADM_run_async since Celery tasks
are sync entrypoints.

Each task now announces itself on the chat's reasoning stream the moment
it's picked up by a worker — "which Celery task is running" is itself
part of the reasoning trace, on top of what the graphs/agents it calls
stream internally.
"""
import asyncio
import os

from app.celery_app.celery_app import ADM_celery_app
from app.config import ADM_get_settings
from app.core.artifact_naming import ADM_build_artifact_filename
from app.core.redis_pubsub import ADM_publish_chat_event, ADM_reset_redis
from app.core.reasoning_stream import ADM_stream_error, ADM_stream_log
from app.db.mongo_client import ADM_get_db, ADM_reset_mongo_client
from app.llm.client import ADM_reset_llm_client
from app.core.runtime_settings import ADM_MissingProviderKeyError
from app.db.collections import (
    ADM_COLLECTION_CHATS, ADM_COLLECTION_EXECUTION_CONTRACTS, ADM_COLLECTION_RUN_STATE,
    ADM_COLLECTION_ARTIFACT_REGISTRY, ADM_COLLECTION_PROVENANCE_REPORTS, ADM_COLLECTION_PROJECTS,
    ADM_COLLECTION_USERS,
)
from app.models.schemas import ADM_RunState, ADM_ExecutionContract, ADM_ProvenanceReport, ADM_ArtifactRecord, ADM_now
from app.graphs.orchestrator_graph import ADM_run_orchestrator
from app.graphs.solution_agent_graph import ADM_plan, ADM_execute, ADM_all_stages_complete
from app.agents.skill_normalizer import ADM_normalize_skill
from app.tools.ddl_generator import ADM_generate_ddl_script
from app.tools.git_publish import ADM_push_artifact_to_git

ADM_SOURCE_CELERY = "celery"


def ADM__format_llm_error(exc: Exception) -> str:
    """Shared by every LLM-touching task's failure path (orchestrator_task,
    plan_task, execute_contract_task/resume_contract_task,
    normalize_skill_task). A misbehaving endpoint can hand back a full HTML
    error page as the exception body (confirmed live: a broken custom BYOK
    base_url landing on a real site's 404 route returned ~290KB of HTML,
    which openai's client embeds verbatim in str(exc)) — prefer a clean
    templated message whenever the SDK gives us a status code, and fall
    back to a short generic line otherwise. Never the raw exception text —
    it could just as easily contain infra details that don't belong in a
    user-facing message."""
    if isinstance(exc, ADM_MissingProviderKeyError):
        return str(exc)
    status_code = getattr(exc, "status_code", None)
    if status_code is not None:
        return f"the LLM provider returned HTTP {status_code}. Check your provider/base URL/API key in Settings."
    return f"{type(exc).__name__} — check the server logs for details."


async def ADM__post_chat_error(db, chat_id: str, prefix: str, exc: Exception) -> None:
    """Shared failure-notification path for every LLM-touching task that
    has a chat_id to report back to (orchestrator_task, plan_task,
    execute_contract_task/resume_contract_task). Posts a real assistant
    message through the same orchestrator_response event a successful
    response uses, so whichever screen the user is watching (chat,
    reasoning stream) actually shows something instead of hanging with no
    feedback."""
    error_detail = ADM__format_llm_error(exc)
    await ADM_stream_error(chat_id, ADM_SOURCE_CELERY, error_detail)
    error_msg = {"role": "assistant", "content": f"{prefix}: {error_detail}", "created_at": ADM_now()}
    await db[ADM_COLLECTION_CHATS].update_one({"chat_id": chat_id}, {"$push": {"messages": error_msg}})
    await ADM_publish_chat_event(chat_id, "orchestrator_response", error_msg)


def ADM_run_async(coro):
    try:
        return asyncio.run(coro)
    finally:
        # Each call above tears its event loop down; the cached redis,
        # mongo, and LLM-gateway clients are all bound to it and break on
        # reuse by the next task's fresh loop (see ADM_reset_redis/
        # ADM_reset_mongo_client/ADM_reset_llm_client).
        ADM_reset_redis()
        ADM_reset_mongo_client()
        ADM_reset_llm_client()


# ---------------------------------------------------------------------------
# 1. orchestrator_task — TDS §5 row 2
# ---------------------------------------------------------------------------

@ADM_celery_app.task(name="orchestrator_task")
def ADM_orchestrator_task(chat_id: str, project_id: str | None, message: str,
                           file_refs: list[dict], selected_skill_ids: list[str],
                           orchestrator_model: str | None = None, derive_title: bool = False,
                           user_id: str | None = None):
    return ADM_run_async(ADM_orchestrator_task_async(
        chat_id, project_id, message, file_refs, selected_skill_ids, orchestrator_model, derive_title, user_id
    ))


async def ADM_orchestrator_task_async(chat_id, project_id, message, file_refs, selected_skill_ids,
                                       orchestrator_model=None, derive_title=False, user_id=None):
    await ADM_stream_log(chat_id, ADM_SOURCE_CELERY, "orchestrator_task picked up by worker.")
    db = ADM_get_db()
    try:
        state = await ADM_run_orchestrator(
            project_id, chat_id, message, file_refs, selected_skill_ids, orchestrator_model, derive_title, user_id
        )
    except Exception as exc:
        # Without this, an exception here (a BYOK-misconfigured Orchestrator
        # call is the most common real-world trigger — see runtime_settings.py)
        # just crashes the Celery task silently: nothing ever posts back to
        # the chat, so the UI sits on "Thinking..." forever with no visible
        # failure. Post a real assistant message through the same
        # orchestrator_response path a successful run uses. Caught and
        # returned rather than re-raised — same convention as
        # ingest_kb_document_task_async below; nothing in this codebase
        # polls a Celery task's own result/FAILURE state, only Mongo +
        # Redis pub/sub, so re-raising bought nothing but an inconsistent
        # second convention.
        await ADM__post_chat_error(db, chat_id, "Something went wrong processing that message", exc)
        return {"tier": "error", "missing_info": []}

    if derive_title and state.get("derived_title"):
        # Only ever applied to a chat whose title is still the default —
        # ADM_patch_chat flips title_is_default=False the moment a user
        # renames a chat, so this never overwrites a deliberate choice.
        await db[ADM_COLLECTION_CHATS].update_one(
            {"chat_id": chat_id, "title_is_default": True},
            {"$set": {"title": state["derived_title"], "title_is_default": False}},
        )

    assistant_msg = {"role": "assistant", "content": state.get("response_text", ""), "created_at": ADM_now()}
    if state.get("matched_skill"):
        assistant_msg["skill_preview"] = {
            k: state["matched_skill"][k] for k in
            ["skill_id", "title", "purpose", "hitl_mode", "version"] if k in state["matched_skill"]
        }
    if state.get("matched_skills"):
        # Full ranked list — for "what skills do I need for X" style
        # questions where more than one skill is genuinely relevant, not
        # just the single best-match Preview card above.
        assistant_msg["matched_skills"] = [
            {k: s[k] for k in ["skill_id", "title", "purpose", "kind", "hitl_mode", "version"] if k in s}
            for s in state["matched_skills"]
        ]
    if state.get("citations"):
        assistant_msg["citations"] = state["citations"]
    if state.get("missing_info"):
        assistant_msg["missing_info"] = state["missing_info"]
    if state.get("create_project_prompt"):
        assistant_msg["create_project_prompt"] = state["create_project_prompt"]
    if state.get("follow_up_questions"):
        assistant_msg["follow_up_questions"] = state["follow_up_questions"]
    await db[ADM_COLLECTION_CHATS].update_one({"chat_id": chat_id}, {"$push": {"messages": assistant_msg}})
    await ADM_publish_chat_event(chat_id, "orchestrator_response", assistant_msg)

    if state["tier"] == "tier3" and not state["missing_info"]:
        # Contracts are shared per-project (see ADM_ExecutionContract's
        # module note) — a project only ever has ONE active model, so
        # before forking a second contract from a different chat, check
        # whether one's already in progress. The frontend resolves "the"
        # contract by project_id (GET /projects/{id}/contract), not
        # chat_id, so an existing model just shows up automatically once
        # this chat's user opens the canvas — no extra wiring needed here
        # beyond not creating a competing one.
        existing_contract = await db[ADM_COLLECTION_EXECUTION_CONTRACTS].find_one(
            {"project_id": project_id, "status": {"$nin": ["completed", "failed"]}},
            {"_id": 0, "contract_id": 1},
        )
        if existing_contract:
            resume_msg = {
                "role": "assistant",
                "content": (
                    "This project already has an active model in progress — "
                    "continuing from where it left off instead of starting a new one."
                ),
                "created_at": ADM_now(),
            }
            await db[ADM_COLLECTION_CHATS].update_one({"chat_id": chat_id}, {"$push": {"messages": resume_msg}})
            await ADM_publish_chat_event(chat_id, "orchestrator_response", resume_msg)
        else:
            workflow_skill_id = f"workflow_{state.get('modeling_style', 'canonical').lower()}"
            ADM_plan_task.delay(project_id, chat_id, workflow_skill_id, file_refs, selected_skill_ids)

    return {"tier": state["tier"], "missing_info": state.get("missing_info", [])}


# ---------------------------------------------------------------------------
# 2. plan_task — TDS §5 row 3
# ---------------------------------------------------------------------------

@ADM_celery_app.task(name="plan_task")
def ADM_plan_task(project_id: str, chat_id: str, workflow_skill_id: str,
                   source_refs: list[dict], selected_skill_ids: list[str]):
    return ADM_run_async(ADM_plan_task_async(project_id, chat_id, workflow_skill_id, source_refs, selected_skill_ids))


async def ADM_plan_task_async(project_id, chat_id, workflow_skill_id, source_refs, selected_skill_ids):
    await ADM_stream_log(chat_id, ADM_SOURCE_CELERY, "plan_task picked up by worker.")
    db = ADM_get_db()
    # `/`-selected skills apply to whichever task_id they were declared against;
    # for this simplified mapping we treat the list positionally against the
    # workflow's task_list order when task_ids aren't explicitly given.
    user_selected_skills = {}
    workflow = await db["skills"].find_one({"skill_id": workflow_skill_id, "kind": "workflow"})
    if workflow and selected_skill_ids:
        for task_entry, chosen in zip(workflow.get("task_list", []), selected_skill_ids):
            user_selected_skills[task_entry["task_id"]] = chosen

    try:
        contract = await ADM_plan(project_id, chat_id, workflow_skill_id, source_refs, user_selected_skills)
    except Exception as exc:
        # Same silent-hang class as orchestrator_task's fix, one screen
        # over: without this, a failure here (e.g. an LLM call inside
        # ADM_plan while resolving/describing tasks) never creates a
        # contract and never publishes anything — the chat's Live
        # Reasoning stream just goes quiet forever with no Plan panel and
        # no visible error, which looks identical to "still working."
        await ADM__post_chat_error(db, chat_id, "Something went wrong building the plan", exc)
        return {"contract_id": None, "error": True}

    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].insert_one(contract.model_dump())
    await ADM_publish_chat_event(chat_id, "plan_ready", {"contract_id": contract.contract_id})
    return {"contract_id": contract.contract_id}


# ---------------------------------------------------------------------------
# 3 & 4. execute_contract_task / resume_contract_task — TDS §5 rows 6, 6h
# ---------------------------------------------------------------------------

@ADM_celery_app.task(name="execute_contract_task")
def ADM_execute_contract_task(contract_id: str):
    return ADM_run_async(ADM_execute_contract_task_async(contract_id, resumed=False))


@ADM_celery_app.task(name="resume_contract_task")
def ADM_resume_contract_task(contract_id: str):
    return ADM_run_async(ADM_execute_contract_task_async(contract_id, resumed=True))  # identical entrypoint, different trigger


async def ADM_execute_contract_task_async(contract_id: str, resumed: bool = False):
    db = ADM_get_db()
    contract_doc = await db[ADM_COLLECTION_EXECUTION_CONTRACTS].find_one({"contract_id": contract_id})
    if not contract_doc:
        raise ValueError(f"No such contract: {contract_id}")
    contract = ADM_ExecutionContract(**contract_doc)

    await ADM_stream_log(
        contract.chat_id, ADM_SOURCE_CELERY,
        f"{'resume_contract_task' if resumed else 'execute_contract_task'} picked up by worker (contract={contract_id}).",
    )

    run_state_doc = await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": contract_id})
    run_state = ADM_RunState(**run_state_doc) if run_state_doc else ADM_RunState(contract_id=contract_id)

    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].update_one(
        {"contract_id": contract_id}, {"$set": {"status": "running"}}
    )

    try:
        run_state = await ADM_execute(contract, run_state)
    except Exception as exc:
        # Same silent-hang class as orchestrator_task/plan_task's fixes,
        # a third screen over: without this, a failure inside ADM_execute
        # (every TaskWorker invocation is an LLM call) leaves the contract
        # status stuck at "running" forever — PlanCanvas polls contract
        # status every 4s while running/approved/paused and would just
        # keep showing a live "Running" badge with a frozen graph and no
        # error, indistinguishable from still-working. PlanCanvas already
        # has a real "Failed" badge (STATUS_LABEL) for exactly this status
        # value — it was just never reachable from here.
        await db[ADM_COLLECTION_EXECUTION_CONTRACTS].update_one(
            {"contract_id": contract_id}, {"$set": {"status": "failed"}}
        )
        await ADM__post_chat_error(db, contract.chat_id, "The run failed partway through", exc)
        return {"contract_id": contract_id, "error": True}

    await db[ADM_COLLECTION_RUN_STATE].update_one(
        {"contract_id": contract_id}, {"$set": run_state.model_dump()}, upsert=True
    )

    if ADM_all_stages_complete(run_state):
        await db[ADM_COLLECTION_EXECUTION_CONTRACTS].update_one(
            {"contract_id": contract_id}, {"$set": {"status": "completed"}}
        )
        await ADM_generate_provenance_and_artifacts(contract, run_state)
        await ADM_publish_chat_event(contract.chat_id, "run_completed", {"contract_id": contract_id})
    else:
        status = "paused" if any(g.status == "pending" for g in run_state.hitl_gates) else "running"
        await db[ADM_COLLECTION_EXECUTION_CONTRACTS].update_one(
            {"contract_id": contract_id}, {"$set": {"status": status}}
        )
        await ADM_publish_chat_event(contract.chat_id, "hitl_pending", {
            "contract_id": contract_id,
            "pending_tasks": [g.task_id for g in run_state.hitl_gates if g.status == "pending"],
        })

    return {"contract_id": contract_id, "current_stage": run_state.current_stage}


async def ADM_generate_provenance_and_artifacts(contract: ADM_ExecutionContract, run_state: ADM_RunState):
    """TDS §5 row 7 — Skill Provenance Report + final artifacts."""
    db = ADM_get_db()
    settings = ADM_get_settings()

    await ADM_stream_log(contract.chat_id, ADM_SOURCE_CELERY, "Generating Skill Provenance Report + final artifacts...")

    entries = []
    for stage_tasks in contract.stages.values():
        for pt in stage_tasks:
            result = run_state.task_results.get(pt.task_id, {})
            gate = next((g for g in run_state.hitl_gates if g.task_id == pt.task_id), None)
            entries.append({
                "task_id": pt.task_id,
                "skill_id": pt.skill_id,
                "skill_version": pt.skill_version,
                "user_selected": pt.user_selected,
                "hitl_mode": pt.hitl_mode.value if hasattr(pt.hitl_mode, "value") else pt.hitl_mode,
                "hitl_outcome": gate.status if gate else "n/a",
                "confidence": result.get("confidence"),
                "knowledge_used": result.get("citations", []),
            })
    report = ADM_ProvenanceReport(contract_id=contract.contract_id, entries=entries)
    await db[ADM_COLLECTION_PROVENANCE_REPORTS].insert_one(report.model_dump())

    ddl_task_result = None
    for task_id, result in run_state.task_results.items():
        if result.get("skill_id") == "generate_ddl":
            ddl_task_result = result
            break

    if ddl_task_result and ddl_task_result.get("output", {}).get("tables"):
        os.makedirs(settings.ARTIFACT_STORAGE_DIR, exist_ok=True)
        # The actual bug: this is the real code path that renders the DDL
        # FILE — from generate_ddl's persisted task *output* (the LLM's
        # final "tables" JSON answer), not from a live tool call. The
        # target_platform binding added to app/agents/task_worker.py's
        # ADM_build_declared_tools only affects tool calls made DURING the
        # ReAct loop — it was never reachable from here, which is why
        # "IF NOT EXISTS"/bracket-quoting never showed up in a downloaded
        # artifact no matter how the tool-binding mechanism was fixed.
        # Found by isolating the fan-out graph directly (confirmed
        # target_platform survives that round-trip intact) rather than
        # continuing to guess from live end-to-end runs.
        project = await db[ADM_COLLECTION_PROJECTS].find_one(
            {"project_id": contract.project_id}, {"_id": 0, "target_platform": 1, "name": 1, "owner_user_id": 1}
        )
        target_platform = (project or {}).get("target_platform") or "postgresql"
        ddl_text = ADM_generate_ddl_script(ddl_task_result["output"]["tables"], target_platform=target_platform)

        # Human-readable filename (item 9) — was bare f"{contract_id}.sql".
        # contract_id stays the registry/download lookup key (unchanged,
        # see GET /contracts/{contract_id}/download); only the on-disk/
        # downloaded filename changes.
        chat = await db[ADM_COLLECTION_CHATS].find_one({"chat_id": contract.chat_id}, {"_id": 0, "title": 1})
        owner_user_id = (project or {}).get("owner_user_id")
        owner = await db[ADM_COLLECTION_USERS].find_one({"user_id": owner_user_id}, {"_id": 0, "username": 1}) if owner_user_id else None
        name_kwargs = dict(
            owner_username=(owner or {}).get("username") or "unknown_user",
            project_name=(project or {}).get("name") or "project",
            chat_title=(chat or {}).get("title") or "chat",
            artifact_type="ddl", extension="sql",
        )
        filename = ADM_build_artifact_filename(**name_kwargs)
        local_path = os.path.join(settings.ARTIFACT_STORAGE_DIR, filename)
        if os.path.exists(local_path):
            # Real collision (not the common case) — same owner/project/
            # chat/type combination already has a file on disk from a
            # different contract. Disambiguate rather than overwrite.
            filename = ADM_build_artifact_filename(**name_kwargs, disambiguator=contract.contract_id[-6:])
            local_path = os.path.join(settings.ARTIFACT_STORAGE_DIR, filename)
        with open(local_path, "w") as f:
            f.write(ddl_text)
        artifact = ADM_ArtifactRecord(
            contract_id=contract.contract_id, artifact_type="ddl",
            filename=filename, local_path=local_path,
        )
        await db[ADM_COLLECTION_ARTIFACT_REGISTRY].insert_one(artifact.model_dump())
        await ADM_stream_log(contract.chat_id, ADM_SOURCE_CELERY, f"Artifact written: {filename}")


# ---------------------------------------------------------------------------
# 5. git_push_task — TDS §5 row 8
# ---------------------------------------------------------------------------

@ADM_celery_app.task(name="git_push_task")
def ADM_git_push_task(contract_id: str, repo_path: str, remote_url: str, branch: str = "main"):
    return ADM_run_async(ADM_git_push_task_async(contract_id, repo_path, remote_url, branch))


async def ADM_git_push_task_async(contract_id, repo_path, remote_url, branch):
    """Stateless — loads persisted artifact, no live SolutionAgent needed."""
    db = ADM_get_db()
    artifact = await db[ADM_COLLECTION_ARTIFACT_REGISTRY].find_one({"contract_id": contract_id})
    if not artifact:
        raise ValueError(f"No artifact found for contract {contract_id}")

    contract_doc = await db[ADM_COLLECTION_EXECUTION_CONTRACTS].find_one({"contract_id": contract_id})
    if contract_doc:
        await ADM_stream_log(contract_doc["chat_id"], ADM_SOURCE_CELERY, "git_push_task picked up by worker — pushing artifact to git.")

    result_msg = ADM_push_artifact_to_git(artifact["local_path"], repo_path, remote_url, branch)

    if contract_doc:
        await ADM_stream_log(contract_doc["chat_id"], ADM_SOURCE_CELERY, f"git push result: {result_msg}")
    return {"message": result_msg}


# ---------------------------------------------------------------------------
# 6. normalize_skill_task — TDS §5 row 11
# ---------------------------------------------------------------------------

@ADM_celery_app.task(name="normalize_skill_task")
def ADM_normalize_skill_task(project_id: str, raw_text: str, chat_id: str | None = None, target_scope: str = "user", draft_id: str | None = None):
    return ADM_run_async(ADM_normalize_skill_task_async(project_id, raw_text, chat_id, target_scope, draft_id))


async def ADM_normalize_skill_task_async(project_id: str, raw_text: str, chat_id: str | None, target_scope: str = "user", draft_id: str | None = None):
    if chat_id:
        await ADM_stream_log(chat_id, ADM_SOURCE_CELERY, "normalize_skill_task picked up by worker.")

    try:
        draft = await ADM_normalize_skill(project_id, raw_text, chat_id=chat_id, target_scope=target_scope, draft_id=draft_id)
    except Exception as exc:
        # Same silent-hang class, a fourth screen over — and the one place
        # the fix has to look different: the caller (CreateSkillModal.tsx's
        # pollDraft, and app/api/routes_skills.py's admin-upload mirror)
        # already knows draft_id before this task even starts, and polls
        # GET /skill-drafts/{draft_id} treating every 404 as "not written
        # yet, keep polling" — with no timeout. ADM_normalize_skill only
        # ever inserts the draft document on a SUCCESSFUL extraction, so a
        # failure here previously meant that draft_id 404s forever and the
        # modal polls indefinitely with zero feedback. Write a real
        # status="failed" document at the known draft_id instead, so the
        # frontend has something other than "still 404" to poll into.
        error_detail = ADM__format_llm_error(exc)
        if chat_id:
            await ADM_stream_error(chat_id, ADM_SOURCE_CELERY, error_detail)
        if draft_id:
            from app.db.collections import ADM_COLLECTION_SKILL_DRAFTS
            from app.models.schemas import ADM_SkillDraft

            db = ADM_get_db()
            placeholder = ADM_SkillDraft(
                draft_id=draft_id, project_id=project_id, status="failed",
                error=error_detail, target_scope=target_scope,
            )
            await db[ADM_COLLECTION_SKILL_DRAFTS].update_one(
                {"draft_id": draft_id}, {"$set": placeholder.model_dump()}, upsert=True,
            )
        return {"draft_id": draft_id, "missing_fields": [], "error": True}

    if chat_id and draft.missing_fields:
        db = ADM_get_db()
        question = (
            f"I imported your skill but need a few more details: "
            f"{', '.join(draft.missing_fields)}. (draft_id: {draft.draft_id})"
        )
        msg = {"role": "assistant", "content": question, "created_at": ADM_now()}
        await db[ADM_COLLECTION_CHATS].update_one({"chat_id": chat_id}, {"$push": {"messages": msg}})
        await ADM_publish_chat_event(chat_id, "skill_import_clarification", msg)
    return {"draft_id": draft.draft_id, "missing_fields": draft.missing_fields}


# ---------------------------------------------------------------------------
# 7. ingest_kb_document_task — Admin KB ingestion pipeline (replaces seed.py
#    as the real content path). Runs via Celery, not inline in FastAPI,
#    because chunk embedding is an LLM-gateway call, not deterministic
#    computation — same FastAPI/Celery boundary rule as everywhere else.
#    The FastAPI route has already extracted text and saved the
#    ADM_KbDocument as "processing" before this task is even enqueued; this
#    task only chunks, embeds, and writes the modeling_reference rows.
# ---------------------------------------------------------------------------

@ADM_celery_app.task(name="ingest_kb_document_task")
def ADM_ingest_kb_document_task(doc_id: str, admin_user_id: str):
    return ADM_run_async(ADM_ingest_kb_document_task_async(doc_id, admin_user_id))


async def ADM_ingest_kb_document_task_async(doc_id: str, admin_user_id: str):
    import asyncio
    import logging

    from app.core.chunking import ADM_chunk_text_with_offsets
    from app.core.reasoning_stream import ADM_SOURCE_KB_INGEST
    from app.db.collections import ADM_COLLECTION_KB_DOCUMENTS
    from app.db.vector_search import ADM_upsert_modeling_reference_chunks
    from app.tools.kb_metadata import ADM_generate_document_metadata

    logger = logging.getLogger(__name__)
    channel = f"kb_ingest:{doc_id}"  # synthetic channel, same Pub/Sub infra as chat streaming
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_KB_DOCUMENTS].find_one({"doc_id": doc_id})
    if not doc:
        logger.warning("ingest_kb_document_task: doc_id=%s not found", doc_id)
        return {"status": "failed", "error": "document_not_found"}

    strategy = doc.get("chunking_strategy", "markdown")
    logger.info("ingest_kb_document_task starting: doc_id=%s title=%r strategy=%s chars=%d", doc_id, doc["title"], strategy, len(doc.get("full_text", "")))
    await ADM_stream_log(channel, ADM_SOURCE_KB_INGEST, f"ingest_kb_document_task picked up by worker for '{doc['title']}' (strategy={strategy}).")

    try:
        # LangChain's splitters are synchronous, CPU-bound — run in a
        # thread so this Celery task's event loop isn't blocked by it.
        chunks = await asyncio.to_thread(ADM_chunk_text_with_offsets, doc["full_text"], strategy)
        logger.info("ingest_kb_document_task: doc_id=%s chunked into %d piece(s)", doc_id, len(chunks))
        await ADM_stream_log(channel, ADM_SOURCE_KB_INGEST, f"Split into {len(chunks)} chunk(s) using '{strategy}' strategy (with character offsets for citation highlighting).")

        written = await ADM_upsert_modeling_reference_chunks(
            source_doc_id=doc_id, doc_type=doc["doc_type"], title=doc["title"], chunks=chunks
        )
        logger.info("ingest_kb_document_task: doc_id=%s embedded+upserted %d chunk(s)", doc_id, written)
        await ADM_stream_log(channel, ADM_SOURCE_KB_INGEST, f"Embedded and upserted {written} chunk(s) into modeling_reference.")

        # One-per-document metadata call (app/tools/kb_metadata.py) — best
        # effort, never fails ingestion; runs after chunks are already
        # written so a slow/failed summary never blocks the document from
        # being searchable.
        metadata = await ADM_generate_document_metadata(doc["full_text"])
        if metadata.get("summary"):
            await ADM_stream_log(channel, ADM_SOURCE_KB_INGEST, f"Generated document summary: {metadata['summary'][:150]}")
        logger.info("ingest_kb_document_task: doc_id=%s summary_len=%d keywords=%s", doc_id, len(metadata.get("summary", "")), metadata.get("keywords"))

        await db[ADM_COLLECTION_KB_DOCUMENTS].update_one(
            {"doc_id": doc_id},
            {"$set": {"status": "ready", "chunk_count": written, "summary": metadata["summary"], "keywords": metadata["keywords"]}},
        )
        await ADM_publish_chat_event(channel, "kb_ingest_complete", {"doc_id": doc_id, "chunk_count": written})
        return {"status": "ready", "doc_id": doc_id, "chunk_count": written}

    except Exception as e:
        logger.error("ingest_kb_document_task failed: doc_id=%s error=%s", doc_id, e, exc_info=True)
        await ADM_stream_log(channel, ADM_SOURCE_KB_INGEST, f"Ingestion failed: {e}")
        await db[ADM_COLLECTION_KB_DOCUMENTS].update_one({"doc_id": doc_id}, {"$set": {"status": "failed"}})
        await ADM_publish_chat_event(channel, "kb_ingest_failed", {"doc_id": doc_id, "error": str(e)})
        return {"status": "failed", "doc_id": doc_id, "error": str(e)}


# ---------------------------------------------------------------------------
# 8. embed_skill_task — computes/refreshes one skill's embedding after a
#    direct YAML upload. Small (one embed_text call), but still an
#    LLM-gateway call, so it still goes via Celery, not inline in FastAPI —
#    same boundary rule applied uniformly regardless of how small the call is.
# ---------------------------------------------------------------------------

@ADM_celery_app.task(name="embed_skill_task")
def ADM_embed_skill_task(skill_id: str, version: int, scope: str):
    return ADM_run_async(ADM_embed_skill_task_async(skill_id, version, scope))


async def ADM_embed_skill_task_async(skill_id: str, version: int, scope: str):
    from app.db.vector_search import ADM_embed_and_store_skill
    await ADM_embed_and_store_skill(skill_id, version, scope)
    return {"status": "embedded", "skill_id": skill_id, "version": version}
