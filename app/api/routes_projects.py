"""
Project bootstrap + collaborator management. Two permission tiers,
enforced via app.core.ownership:

  Owner-only:  create is implicitly owner (creator), PATCH, DELETE,
               add/remove collaborators.
  Owner-or-collaborator: view the project, view the collaborator list,
               everything else project-scoped lives in routes_chats.py/
               routes_uploads.py/routes_contracts.py using the same
               access-level check.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import ADM_get_current_user_id
from app.core.ownership import ADM_assert_project_access, ADM_assert_project_owner
from app.db.collections import ADM_COLLECTION_PROJECTS, ADM_COLLECTION_USERS
from app.db.mongo_client import ADM_get_db
from app.models.schemas import (
    ADM_CollaboratorAddRequest,
    ADM_Project,
    ADM_ProjectCreateRequest,
    ADM_ProjectPatchRequest,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ADM_Project)
async def ADM_create_project(
    body: ADM_ProjectCreateRequest,
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    db = ADM_get_db()
    project = ADM_Project(
        owner_user_id=current_user_id, name=body.name, layer=body.layer, domain=body.domain
    )
    await db[ADM_COLLECTION_PROJECTS].insert_one(project.model_dump())
    return project


@router.get("/{project_id}", response_model=ADM_Project)
async def ADM_get_project(
    project_id: str, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Owner or collaborator — either can view the project."""
    doc = await ADM_assert_project_access(project_id, current_user_id)
    doc.pop("_id", None)
    return doc


@router.get("", response_model=list[ADM_Project])
async def ADM_list_projects(
    scope: str = "all",  # "all" | "owned" | "shared" — "shared" = collaborator, not owner
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    """
    Real DB query, scoped to the caller. `scope` maps directly to the
    "My Projects" vs "Shared with me" split the UI needs — default
    returns both so the frontend can also just filter client-side on
    `owner_user_id` if it prefers one round trip.
    """
    db = ADM_get_db()
    if scope == "owned":
        query = {"owner_user_id": current_user_id}
    elif scope == "shared":
        query = {"collaborator_user_ids": current_user_id}
    else:
        query = {"$or": [{"owner_user_id": current_user_id}, {"collaborator_user_ids": current_user_id}]}
    docs = await db[ADM_COLLECTION_PROJECTS].find(query, {"_id": 0}).to_list(length=200)
    return docs


@router.patch("/{project_id}", response_model=ADM_Project)
async def ADM_patch_project(
    project_id: str, body: ADM_ProjectPatchRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Owner-only — a collaborator can use a project but never rename/redomain it."""
    await ADM_assert_project_owner(project_id, current_user_id)
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    db = ADM_get_db()
    if update:
        await db[ADM_COLLECTION_PROJECTS].update_one({"project_id": project_id}, {"$set": update})
    doc = await db[ADM_COLLECTION_PROJECTS].find_one({"project_id": project_id}, {"_id": 0})
    return doc


@router.delete("/{project_id}")
async def ADM_delete_project(project_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Owner-only. Does not cascade-delete chats/contracts in this pass —
    flagged here rather than silently left ambiguous: deleting a project
    with active chats/contracts currently just orphans them. Add a
    cascade (or a soft-delete + archive view) before this ships to real
    users if that matters to you."""
    await ADM_assert_project_owner(project_id, current_user_id)
    db = ADM_get_db()
    result = await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": project_id, "owner_user_id": current_user_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Project not found")
    return {"status": "deleted", "project_id": project_id}


# ---------------------------------------------------------------------------
# Collaborators
# ---------------------------------------------------------------------------

@router.get("/{project_id}/collaborators")
async def ADM_list_collaborators(project_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Owner or collaborator — any team member can see who's on the project."""
    project = await ADM_assert_project_access(project_id, current_user_id)
    db = ADM_get_db()
    user_ids = [project["owner_user_id"]] + project.get("collaborator_user_ids", [])
    users = await db[ADM_COLLECTION_USERS].find(
        {"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "username": 1, "email": 1}
    ).to_list(length=200)
    for u in users:
        u["is_owner"] = u["user_id"] == project["owner_user_id"]
    return users


@router.post("/{project_id}/collaborators")
async def ADM_add_collaborator(
    project_id: str, body: ADM_CollaboratorAddRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Owner-only. Looks the teammate up by username — the identifier a
    project owner actually has, not a raw user_id."""
    project = await ADM_assert_project_owner(project_id, current_user_id)
    db = ADM_get_db()
    target = await db[ADM_COLLECTION_USERS].find_one({"username": body.username}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(404, f"No user with username '{body.username}'")
    if target["user_id"] == project["owner_user_id"]:
        raise HTTPException(400, "The project owner is already on the project")

    await db[ADM_COLLECTION_PROJECTS].update_one(
        {"project_id": project_id}, {"$addToSet": {"collaborator_user_ids": target["user_id"]}}
    )
    return {"status": "added", "project_id": project_id, "user_id": target["user_id"], "username": body.username}


@router.delete("/{project_id}/collaborators/{user_id}")
async def ADM_remove_collaborator(
    project_id: str, user_id: str, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Owner-only."""
    await ADM_assert_project_owner(project_id, current_user_id)
    db = ADM_get_db()
    await db[ADM_COLLECTION_PROJECTS].update_one(
        {"project_id": project_id}, {"$pull": {"collaborator_user_ids": user_id}}
    )
    return {"status": "removed", "project_id": project_id, "user_id": user_id}
