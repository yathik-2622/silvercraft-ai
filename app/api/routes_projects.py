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
import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.auth import ADM_get_current_user_id
from app.core.ownership import ADM_assert_project_access, ADM_assert_project_owner
from app.db.collections import (
    ADM_COLLECTION_BUSINESS_STANDARDS, ADM_COLLECTION_CHAT_ARTIFACTS, ADM_COLLECTION_CHATS,
    ADM_COLLECTION_EXECUTION_CONTRACTS, ADM_COLLECTION_PROJECTS, ADM_COLLECTION_USERS,
)
from app.db.mongo_client import ADM_get_db
from app.models.schemas import (
    ADM_BusinessStandardsDocument,
    ADM_BusinessStandardsUpdateRequest,
    ADM_CollaboratorAddRequest,
    ADM_Project,
    ADM_ProjectCreateRequest,
    ADM_ProjectPatchRequest,
)
from app.tools.document_text_extract import ADM_extract_document_text

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


# ---------------------------------------------------------------------------
# Business Standards — project-owner self-serve (moved off the admin-only
# upload page; see app/api/routes_admin.py's module docstring for why).
# Read is owner-or-collaborator (ADM_assert_project_access — anyone on the
# project should be able to see the standards their modeling runs are
# governed by); write (PUT/PATCH) is owner-only
# (ADM_assert_project_owner) — a deliberate permission asymmetry.
# ---------------------------------------------------------------------------

@router.put("/{project_id}/business-standards")
async def ADM_upload_business_standards(
    project_id: str, file: UploadFile = File(...),
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    """First-upload path (and 'replace with a new file' path). Same
    deterministic text extraction as every other document upload in this
    app (ADM_extract_document_text) — no LLM/embedding call, so this runs
    inline in FastAPI, same reasoning as /uploads."""
    await ADM_assert_project_owner(project_id, current_user_id)
    try:
        text = await asyncio.to_thread(ADM_extract_document_text, file.file, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        await file.close()

    if not text.strip():
        raise HTTPException(400, "No extractable text found in this file.")

    doc = ADM_BusinessStandardsDocument(
        project_id=project_id, source_filename=file.filename, full_text=text, uploaded_by=current_user_id,
    )
    db = ADM_get_db()
    # Upsert on project_id ALONE — one business-standards document per
    # project, by design; re-uploading replaces it rather than
    # accumulating a history.
    await db[ADM_COLLECTION_BUSINESS_STANDARDS].update_one(
        {"project_id": project_id}, {"$set": doc.model_dump()}, upsert=True,
    )
    await db[ADM_COLLECTION_PROJECTS].update_one({"project_id": project_id}, {"$set": {"has_business_standards": True}})
    return {"status": "uploaded", "project_id": project_id, "char_length": len(text)}


@router.patch("/{project_id}/business-standards")
async def ADM_edit_business_standards(
    project_id: str, body: ADM_BusinessStandardsUpdateRequest,
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    """Direct-text-edit path — the primary way to fix a typo or tweak a
    rule once a standards document already exists, without re-exporting
    and re-uploading the whole document."""
    await ADM_assert_project_owner(project_id, current_user_id)
    if body.full_text is None or not body.full_text.strip():
        raise HTTPException(400, "full_text is required")

    db = ADM_get_db()
    existing = await db[ADM_COLLECTION_BUSINESS_STANDARDS].find_one({"project_id": project_id})
    doc = ADM_BusinessStandardsDocument(
        project_id=project_id,
        source_filename=(existing or {}).get("source_filename", "edited.md"),
        full_text=body.full_text, uploaded_by=current_user_id,
    )
    await db[ADM_COLLECTION_BUSINESS_STANDARDS].update_one(
        {"project_id": project_id}, {"$set": doc.model_dump()}, upsert=True,
    )
    await db[ADM_COLLECTION_PROJECTS].update_one({"project_id": project_id}, {"$set": {"has_business_standards": True}})
    return {"status": "updated", "project_id": project_id, "char_length": len(body.full_text)}


@router.get("/{project_id}/business-standards")
async def ADM_get_business_standards(project_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Owner OR collaborator can view — see the module note above."""
    await ADM_assert_project_access(project_id, current_user_id)
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_BUSINESS_STANDARDS].find_one({"project_id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "No business standards document for this project")
    return doc


# ---------------------------------------------------------------------------
# Project-wide artifacts
# ---------------------------------------------------------------------------

@router.get("/{project_id}/artifacts")
async def ADM_list_project_artifacts(project_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Every persisted Stage 1-4 task output across EVERY chat in this
    project — not just whichever one chat a viewer currently has open.
    ADM_list_chat_artifacts (routes_chats.py) is scoped to one chat_id; this
    is the project-wide superset a dedicated "Artifacts" view needs, each
    one tagged with which chat produced it and which user owns that chat
    (a chat has exactly one owning user_id today — see ADM_Chat — so that's
    used as the attribution rather than tracking a user_id per artifact,
    which nothing upstream currently records)."""
    await ADM_assert_project_access(project_id, current_user_id)
    db = ADM_get_db()
    chats = await db[ADM_COLLECTION_CHATS].find(
        {"project_id": project_id}, {"_id": 0, "chat_id": 1, "title": 1, "user_id": 1}
    ).to_list(length=500)
    if not chats:
        return []
    chat_by_id = {c["chat_id"]: c for c in chats}
    user_ids = list({c["user_id"] for c in chats if c.get("user_id")})
    users = await db[ADM_COLLECTION_USERS].find(
        {"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "username": 1}
    ).to_list(length=200)
    username_by_id = {u["user_id"]: u["username"] for u in users}
    artifacts = await db[ADM_COLLECTION_CHAT_ARTIFACTS].find(
        {"chat_id": {"$in": list(chat_by_id.keys())}}, {"_id": 0}
    ).sort("created_at", 1).to_list(length=2000)
    for a in artifacts:
        chat = chat_by_id.get(a["chat_id"], {})
        a["chat_title"] = chat.get("title", "")
        a["created_by_user_id"] = chat.get("user_id")
        a["created_by_username"] = username_by_id.get(chat.get("user_id"), "unknown")
    return artifacts


# ---------------------------------------------------------------------------
# Shared project-level contract
# ---------------------------------------------------------------------------

@router.get("/{project_id}/contract")
async def ADM_get_project_contract(project_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """The ONE shared model for this project (see ADM_ExecutionContract's
    module-level note) — every collaborator's chat resolves its canvas
    through this route instead of matching contracts by chat_id, so two
    different chats in the same project always land on the same contract.
    Old contracts from before this route existed may still have several
    chat-scoped ones for a single project; the most recent one wins and
    becomes "the" shared model going forward — no migration of the rest,
    they just stop being resolved to."""
    await ADM_assert_project_access(project_id, current_user_id)
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_EXECUTION_CONTRACTS].find_one(
        {"project_id": project_id}, {"_id": 0}, sort=[("created_at", -1)],
    )
    if not doc:
        raise HTTPException(404, "No model started for this project yet")
    return doc
