"""
Context Builder — TDS §5 row 6b. Assembles run-invariant + task-specific
context per task, before each TaskWorker runs. Vector search is NOT
exposed to the react agent directly (§8) — retrieval happens here,
deterministically, ahead of time.

Every fetch here is announced live via app.core.reasoning_stream BEFORE
it runs (chat_id/source are optional — callers outside a live chat run,
e.g. tests or scripts, simply omit them and get silent behavior).
"""
import logging

from app.core.reasoning_stream import ADM_SOURCE_CONTEXT_BUILDER, ADM_stream_fetch, ADM_stream_log
from app.db.mongo_client import ADM_get_db
from app.db.collections import (
    ADM_COLLECTION_BUSINESS_STANDARDS,
    ADM_COLLECTION_PROJECTS,
    ADM_COLLECTION_RAW_FILES,
    ADM_COLLECTION_SKILLS,
)
from app.db.vector_search import ADM_semantic_search

logger = logging.getLogger(__name__)


async def ADM_build_run_invariant_context(project_id: str, chat_id: str | None = None, source: str | None = None) -> dict:
    """Cached per-run: business standards + the project's target_platform +
    resolved workflow skill content."""
    src = source or ADM_SOURCE_CONTEXT_BUILDER
    if chat_id:
        await ADM_stream_fetch(chat_id, src, f"business standards for project '{project_id}'")

    db = ADM_get_db()
    # {"_id": 0} matters here specifically (unlike some other reads in this
    # codebase where it's just tidiness): this dict flows straight into the
    # Send-based fan-out graph's state, which LangGraph checkpoints via
    # msgpack — a raw Mongo ObjectId isn't msgpack-serializable and crashes
    # the whole stage. business_standards was always empty until this pass
    # (nothing ever wrote to it before), so this had never been exercised
    # with a real document — found live, running a real Tier 3 stage
    # against an actual uploaded business-standards doc for the first time.
    standards = await db[ADM_COLLECTION_BUSINESS_STANDARDS].find(
        {"project_id": project_id}, {"_id": 0}
    ).to_list(length=200)

    # target_platform feeds generate_ddl's tool call (app/tools/ddl_generator.py)
    # — read from the project doc itself, not re-asked anywhere. Defaults to
    # "postgresql" the same way the tool itself defaults, so a task's context
    # always shows a concrete value rather than null.
    project = await db[ADM_COLLECTION_PROJECTS].find_one({"project_id": project_id}, {"_id": 0, "target_platform": 1})
    target_platform = (project or {}).get("target_platform") or "postgresql"

    if chat_id:
        await ADM_stream_log(
            chat_id, src,
            f"Loaded {len(standards)} business standard(s) and target_platform='{target_platform}' as run-invariant context.",
        )
    return {"business_standards": standards, "target_platform": target_platform}


async def ADM_build_task_context(
    task_query: str, stage: int, top_k: int = 5, chat_id: str | None = None, source: str | None = None
) -> dict:
    """
    Fresh, per-task: semantic retrieval against the Modelling Reference KB
    (Atlas Vector Search). Query is derived from the task's purpose/stage so
    retrieval stays targeted rather than generic.

    Also returns `citations` — one entry per retrieved chunk, carrying
    source_doc_id/chunk_id/char_start/char_end so this task's contribution
    to the Skill Provenance Report's "knowledge used" can point at an exact
    chunk within an exact document, not just a generic collection name.
    """
    src = source or ADM_SOURCE_CONTEXT_BUILDER
    if chat_id:
        await ADM_stream_fetch(chat_id, src, f"modeling reference material for stage {stage} (Atlas Vector Search, top_k={top_k})")

    refs = await ADM_semantic_search(query=task_query, top_k=top_k)
    citations = [
        {
            "source_doc_id": r.get("source_doc_id"), "chunk_id": r.get("chunk_id"),
            "title": r.get("title"), "chunk_index": r.get("chunk_index"),
            "char_start": r.get("char_start"), "char_end": r.get("char_end"),
            "snippet": (r.get("content") or "")[:200], "score": r.get("_score"),
        }
        for r in refs if r.get("source_doc_id")
    ]

    if chat_id:
        await ADM_stream_log(chat_id, src, f"Retrieved {len(refs)} reference doc(s) for this task's context.")
    return {"modeling_reference_hits": refs, "stage": stage, "citations": citations}


async def ADM_summarize_attached_files(file_refs: list[dict], chat_id: str | None = None, source: str | None = None) -> str:
    """
    Tier 0 conversational answers previously had zero awareness of an
    attached chat file — ADM_node_extract_intent only ever checked
    `bool(file_refs)`. This resolves each `{raw_file_id}` pointer to its
    already-computed structural/aggregate stats in `raw_files` (the same
    lookup ADM__resolve_source_refs does for Tier 3, reused here so Tier 0
    gets the same column-level-metadata-only visibility) and formats a
    short per-file summary line for the answer prompt.

    Never row content, only schema — same privacy boundary as Tier 3
    (app/core/privacy.py already stripped anything else at upload time).
    A raw_file_id that no longer resolves (deleted, bad ref) is skipped,
    not raised — a stale attachment reference must never break a chat answer.
    """
    if not file_refs:
        return ""
    src = source or ADM_SOURCE_CONTEXT_BUILDER
    db = ADM_get_db()
    lines: list[str] = []
    missing = 0
    for ref in file_refs:
        raw_file_id = ref.get("raw_file_id")
        if not raw_file_id:
            continue
        doc = await db[ADM_COLLECTION_RAW_FILES].find_one({"raw_file_id": raw_file_id}, {"_id": 0})
        if not doc:
            missing += 1
            continue
        columns = doc.get("columns", [])
        col_summary = ", ".join(f"{c.get('column_name')} ({c.get('dtype')})" for c in columns)
        lines.append(f"- {doc.get('table_name', raw_file_id)} ({doc.get('row_count', '?')} rows): {col_summary}")

    logger.info(
        "ADM_summarize_attached_files: resolved %d/%d file_refs (%d missing/stale)",
        len(lines), len(file_refs), missing,
    )
    if chat_id and lines:
        await ADM_stream_log(chat_id, src, f"Resolved {len(lines)} attached file(s) into schema context for this answer.")
    return "\n".join(lines)


async def ADM_load_pinned_skill(skill_id: str, version: int | None = None) -> dict | None:
    """TaskWorker input: loads exactly one pinned Task Skill by task_id + version."""
    db = ADM_get_db()
    query = {"skill_id": skill_id}
    if version is not None:
        query["version"] = version
    doc = await db[ADM_COLLECTION_SKILLS].find_one(query, sort=[("version", -1)])
    return doc
