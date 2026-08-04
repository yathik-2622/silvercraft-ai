"""
Chat endpoints — TDS §5 rows 1-2e. FastAPI persists + enqueues only; it
never runs LLM/agent logic inline.

Visibility changed from "creator only" to "any project member" (owner or
collaborator) — a shared project means shared chats, matching how the
rest of the project (files, contracts, skills) already works. `user_id`
on the chat document is kept as creator provenance, not a visibility
filter — see app.core.ownership.ADM_assert_chat_access, which every
route below goes through.
"""
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.celery_app.tasks import ADM_orchestrator_task, ADM_normalize_skill_task
from app.core.auth import ADM_get_current_user_id
from app.core.ownership import ADM_assert_chat_access, ADM_assert_project_access
from app.core.redis_pubsub import ADM_subscribe_chat_channel
from app.db.mongo_client import ADM_get_db, ADM_get_mongo_client
from app.db.collections import ADM_COLLECTION_CHATS, ADM_COLLECTION_PROJECTS, ADM_COLLECTION_RAW_FILES
from app.models.schemas import (
    ADM_Chat,
    ADM_ChatCreateRequest,
    ADM_ChatPatchRequest,
    ADM_MessageCreateRequest,
    ADM_Project,
    ADM_ProjectCreateRequest,
    ADM_now,
)

router = APIRouter(prefix="/chats", tags=["chats"])


class ADM__ChatAlreadyMigrated(Exception):
    """
    Internal signal only, never an HTTP error itself — raised inside
    ADM__migrate_chat_to_new_project's transaction callback when a
    concurrent call already set this chat's project_id first. The route
    handler catches it and returns the winning project instead.
    """


async def ADM__migrate_chat_to_new_project(
    chat_id: str, chat_doc: dict, current_user_id: str, body: ADM_ProjectCreateRequest,
) -> ADM_Project:
    """
    Reusable migration helper for POST /chats/{chat_id}/create-project —
    kept as its own function rather than inlined in the route, same
    separation as every other multi-step operation in this codebase
    (e.g. app.graphs.solution_agent_graph.ADM__resolve_source_refs).

    Atomically: (a) creates the new project, (b) sets chat.project_id,
    (c) re-parents every raw_files document this chat's messages
    reference (via file_refs[].raw_file_id) from project_id=None to the
    new project. All three writes happen inside one multi-document Mongo
    transaction (Atlas replica set — same cluster every other write here
    already targets), so a mid-transaction crash can never leave the chat
    pointing at a project whose files never got re-parented.

    Idempotency/concurrency: the chat update's filter requires
    project_id: None. If two calls race, MongoDB's transaction layer
    write-conflicts whichever commits second; with_transaction retries
    its callback automatically on that conflict, and on retry the
    conditional update matches nothing (the winner already committed) —
    at that point this raises ADM__ChatAlreadyMigrated instead of
    inserting an orphaned second project. The route handler below catches
    that and returns whichever project actually won.
    """
    raw_file_ids = sorted({
        ref.get("raw_file_id")
        for msg in chat_doc.get("messages", [])
        for ref in msg.get("file_refs", [])
        if ref.get("raw_file_id")
    })

    db = ADM_get_db()
    client = ADM_get_mongo_client()
    result_holder: dict = {}

    async def _callback(session):
        project = ADM_Project(
            owner_user_id=current_user_id, name=body.name, layer=body.layer, domain=body.domain,
        )
        chat_update = await db[ADM_COLLECTION_CHATS].update_one(
            {"chat_id": chat_id, "project_id": None},
            {"$set": {"project_id": project.project_id}},
            session=session,
        )
        if chat_update.matched_count == 0:
            raise ADM__ChatAlreadyMigrated()

        await db[ADM_COLLECTION_PROJECTS].insert_one(project.model_dump(), session=session)

        if raw_file_ids:
            await db[ADM_COLLECTION_RAW_FILES].update_many(
                {"raw_file_id": {"$in": raw_file_ids}, "project_id": None},
                {"$set": {"project_id": project.project_id}},
                session=session,
            )

        result_holder["project"] = project

    async with await client.start_session() as session:
        await session.with_transaction(_callback)

    return result_holder["project"]


@router.post("", response_model=ADM_Chat)
async def ADM_create_chat(
    body: ADM_ChatCreateRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """
    Owner or collaborator can create a chat — 'do their own stuff' in a
    shared project includes starting new chats. project_id is optional:
    omitting it creates a "dashboard" chat with no project yet — no
    access check applies since there's no project to check access
    against, and it's private to its creator (see
    app.core.ownership.ADM_assert_chat_access) until it's migrated into
    a project via POST /chats/{chat_id}/create-project.
    """
    if body.project_id:
        await ADM_assert_project_access(body.project_id, current_user_id)
    db = ADM_get_db()
    chat = ADM_Chat(project_id=body.project_id, user_id=current_user_id, title=body.title or "New chat")
    if body.title and body.title != "New chat":
        chat.title_is_default = False
    await db[ADM_COLLECTION_CHATS].insert_one(chat.model_dump())
    return chat


@router.get("", response_model=list[ADM_Chat])
async def ADM_list_chats(
    project_id: str | None = None, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """
    GET /chats?project_id=... — every chat in that project, visible to
    every member, not just its creator (unchanged).
    GET /chats (no project_id) — the caller's own project-less
    "dashboard" chats only (project_id: null AND user_id: caller) — this
    is what powers the dashboard's chat history list. Dashboard chats are
    creator-only (see ADM_assert_chat_access), so there's no "every
    member" concept to apply here.
    """
    db = ADM_get_db()
    if project_id:
        await ADM_assert_project_access(project_id, current_user_id)
        query = {"project_id": project_id}
    else:
        query = {"project_id": None, "user_id": current_user_id}
    docs = await db[ADM_COLLECTION_CHATS].find(
        query, {"_id": 0, "messages": 0}
    ).sort("created_at", -1).to_list(length=200)
    return docs


@router.get("/{chat_id}", response_model=ADM_Chat)
async def ADM_get_chat(chat_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    doc = await ADM_assert_chat_access(chat_id, current_user_id)
    doc.pop("_id", None)
    return doc


@router.patch("/{chat_id}", response_model=ADM_Chat)
async def ADM_patch_chat(
    chat_id: str, body: ADM_ChatPatchRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """
    Rename and/or set the per-chat Orchestrator model override. A manual
    title set here always wins over auto-naming — title_is_default flips
    false, so the orchestrator_task's auto-title logic (app/celery_app/
    tasks.py) skips this chat on the next message instead of overwriting
    a name the user chose.
    """
    await ADM_assert_chat_access(chat_id, current_user_id)
    update: dict = {}
    if body.title is not None:
        update["title"] = body.title
        update["title_is_default"] = False
    if body.orchestrator_model is not None:
        update["orchestrator_model"] = body.orchestrator_model
    db = ADM_get_db()
    if update:
        await db[ADM_COLLECTION_CHATS].update_one({"chat_id": chat_id}, {"$set": update})
    doc = await db[ADM_COLLECTION_CHATS].find_one({"chat_id": chat_id}, {"_id": 0})
    return doc


@router.delete("/{chat_id}")
async def ADM_delete_chat(chat_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Any project member can delete any chat in a shared project —
    consistent with the shared-visibility default above. If you want
    delete restricted to a chat's own creator instead, change this one
    check to `chat['user_id'] == current_user_id` after the access
    assertion — flagging the decision point rather than silently picking
    the stricter behavior for you."""
    await ADM_assert_chat_access(chat_id, current_user_id)
    db = ADM_get_db()
    result = await db[ADM_COLLECTION_CHATS].delete_one({"chat_id": chat_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Chat not found")
    return {"status": "deleted", "chat_id": chat_id}


@router.post("/{chat_id}/messages")
async def ADM_post_message(
    chat_id: str, body: ADM_MessageCreateRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Row 1: persist message, enqueue orchestrator_task, return 202."""
    chat_doc = await ADM_assert_chat_access(chat_id, current_user_id)

    user_msg = {"role": "user", "content": body.content, "created_at": ADM_now(),
                "file_refs": [f.model_dump() for f in body.file_refs],
                "selected_skill_ids": body.selected_skill_ids}
    db = ADM_get_db()
    await db[ADM_COLLECTION_CHATS].update_one({"chat_id": chat_id}, {"$push": {"messages": user_msg}})

    is_first_message = len(chat_doc.get("messages", [])) == 0
    ADM_orchestrator_task.delay(
        chat_id, chat_doc["project_id"], body.content,
        [f.model_dump() for f in body.file_refs], body.selected_skill_ids,
        chat_doc.get("orchestrator_model"), is_first_message and chat_doc.get("title_is_default", True),
        current_user_id,
    )
    return {"status": "accepted", "chat_id": chat_id}


@router.post("/{chat_id}/create-project", response_model=ADM_Project)
async def ADM_create_project_for_chat(
    chat_id: str, body: ADM_ProjectCreateRequest, current_user_id: str = Depends(ADM_get_current_user_id),
):
    """
    Migrates a project-less ("dashboard") chat into a brand-new project —
    the backend half of the dashboard's inline Create Project card
    (missing_info containing "project", see app.graphs.orchestrator_graph).
    See ADM__migrate_chat_to_new_project for the atomicity/idempotency
    mechanics; this handler only does the idempotent short-circuit and
    error-to-response translation around it.
    """
    chat_doc = await ADM_assert_chat_access(chat_id, current_user_id)
    db = ADM_get_db()

    if chat_doc.get("project_id") is not None:
        existing = await db[ADM_COLLECTION_PROJECTS].find_one(
            {"project_id": chat_doc["project_id"]}, {"_id": 0}
        )
        if existing:
            return existing
        raise HTTPException(409, "Chat already has a project, but that project could not be found")

    try:
        return await ADM__migrate_chat_to_new_project(chat_id, chat_doc, current_user_id, body)
    except ADM__ChatAlreadyMigrated:
        fresh_chat = await db[ADM_COLLECTION_CHATS].find_one({"chat_id": chat_id}, {"_id": 0, "project_id": 1})
        existing = (
            await db[ADM_COLLECTION_PROJECTS].find_one({"project_id": fresh_chat["project_id"]}, {"_id": 0})
            if fresh_chat and fresh_chat.get("project_id") else None
        )
        if existing:
            return existing
        raise HTTPException(409, "Chat was migrated concurrently, but the resulting project could not be found")


async def ADM_ndjson_relay(chat_id: str) -> AsyncGenerator[bytes, None]:
    """
    Relays every event already published on this chat's Redis Pub/Sub
    channel (coarse lifecycle events AND the granular reasoning events from
    app.core.reasoning_stream — log / node / agent_call / tool_start /
    tool_end / token / error) as newline-delimited JSON, one line per
    Redis message. This is a pure relay — FastAPI still never runs any
    LLM/agent logic inline; every event already originated from a Celery
    worker via app.core.redis_pubsub.ADM_publish_chat_event.
    """
    pubsub = await ADM_subscribe_chat_channel(chat_id)
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            data = message["data"]
            line = data if isinstance(data, str) else data.decode("utf-8")
            yield (line + "\n").encode("utf-8")
    finally:
        await pubsub.unsubscribe()


@router.get("/{chat_id}/stream")
async def ADM_stream_chat(chat_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """
    NDJSON reasoning stream — HTTP fetch + ReadableStream equivalent of the
    WebSocket at /ws/chats/{chat_id}. Same project-access check as every
    other chat route.
    """
    await ADM_assert_chat_access(chat_id, current_user_id)
    return StreamingResponse(ADM_ndjson_relay(chat_id), media_type="application/x-ndjson")
