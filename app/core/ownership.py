"""
Shared ownership/access-check helpers. Every route that touches a
project-scoped resource goes through here so "can this caller touch
this" is answered by one real DB lookup, in one place — never duplicated
logic, never inferred from anything the client sent.

Two tiers, deliberately different:
  ADM_assert_project_access — owner OR collaborator. Used for anything a
    team member should be able to do inside a shared project: create/
    view/use chats, upload files, approve plans, resolve HITL gates.
  ADM_assert_project_owner  — owner ONLY. Used for anything that changes
    the project itself: rename/delete the project, add/remove
    collaborators. A collaborator never sees these controls at all in
    the UI, and the backend refuses them even if asked directly.
"""
from fastapi import HTTPException

from app.db.collections import ADM_COLLECTION_CHATS, ADM_COLLECTION_PROJECTS
from app.db.mongo_client import ADM_get_db


async def ADM_assert_project_owner(project_id: str, current_user_id: str) -> dict:
    """Owner-only. Returns the project doc if the caller owns it; raises
    404 otherwise (never 403 — don't reveal that a project_id exists at
    all to someone who isn't on it in any capacity)."""
    db = ADM_get_db()
    project = await db[ADM_COLLECTION_PROJECTS].find_one(
        {"project_id": project_id, "owner_user_id": current_user_id}
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return project


async def ADM_assert_project_access(project_id: str, current_user_id: str) -> dict:
    """Owner OR collaborator. Returns the project doc if the caller can
    use it in any capacity; raises 404 otherwise."""
    db = ADM_get_db()
    project = await db[ADM_COLLECTION_PROJECTS].find_one(
        {
            "project_id": project_id,
            "$or": [
                {"owner_user_id": current_user_id},
                {"collaborator_user_ids": current_user_id},
            ],
        }
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return project


async def ADM_assert_chat_access(chat_id: str, current_user_id: str) -> dict:
    """
    A chat attached to a project is visible/usable by any member of that
    project (owner or collaborator) — not just its creator. This is the
    shared-workspace default: "my own chats" means "chats I created," but
    visibility is project-wide, matching how the rest of the project is
    shared.

    A chat with no project yet (project_id: null — a "dashboard" chat,
    see POST /chats/{chat_id}/create-project) has no project to be a
    member of, so it's creator-only instead: there's no collaborator
    concept to fall back to. Returns the chat doc if accessible; raises
    404 otherwise (never 403 — same reasoning as everywhere else in this
    module).
    """
    db = ADM_get_db()
    chat = await db[ADM_COLLECTION_CHATS].find_one({"chat_id": chat_id})
    if not chat:
        raise HTTPException(404, "Chat not found")
    if chat.get("project_id") is None:
        if chat["user_id"] != current_user_id:
            raise HTTPException(404, "Chat not found")
        return chat
    await ADM_assert_project_access(chat["project_id"], current_user_id)
    return chat
