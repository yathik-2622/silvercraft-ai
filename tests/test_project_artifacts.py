"""
Tests for GET /projects/{project_id}/artifacts — the project-wide
superset of GET /chats/{chat_id}/artifacts, aggregating every persisted
artifact across every chat in a project and tagging each one with which
chat produced it and which user owns that chat. Run with: pytest
"""
import asyncio
import uuid

from fastapi.testclient import TestClient

from app.core.auth import ADM_get_current_user_id
from app.db.collections import (
    ADM_COLLECTION_CHAT_ARTIFACTS, ADM_COLLECTION_CHATS, ADM_COLLECTION_PROJECTS, ADM_COLLECTION_USERS,
)
from app.db.mongo_client import ADM_get_db, ADM_reset_mongo_client
from app.main import app

_raw_client = TestClient(app)


class _ResettingClient:
    def __getattr__(self, name):
        method = getattr(_raw_client, name)

        def wrapped(*args, **kwargs):
            ADM_reset_mongo_client()
            return method(*args, **kwargs)

        return wrapped


client = _ResettingClient()


def _override_user(user_id: str):
    return lambda: user_id


async def _seed(owner_id: str, other_user_id: str):
    db = ADM_get_db()
    project_id = f"proj_test_{uuid.uuid4().hex[:10]}"
    chat_a = f"chat_test_{uuid.uuid4().hex[:10]}"
    chat_b = f"chat_test_{uuid.uuid4().hex[:10]}"
    await db[ADM_COLLECTION_PROJECTS].insert_one({
        "project_id": project_id, "owner_user_id": owner_id, "name": "Test", "layer": "silver",
        "domain": "Test Domain", "collaborator_user_ids": [other_user_id], "has_business_standards": False,
    })
    await db[ADM_COLLECTION_USERS].insert_many([
        {"user_id": owner_id, "username": f"owner_{owner_id[-6:]}", "hashed_password": "x", "email": None, "created_at": "2026-01-01T00:00:00Z"},
        {"user_id": other_user_id, "username": f"collab_{other_user_id[-6:]}", "hashed_password": "x", "email": None, "created_at": "2026-01-01T00:00:00Z"},
    ])
    await db[ADM_COLLECTION_CHATS].insert_many([
        {"chat_id": chat_a, "project_id": project_id, "user_id": owner_id, "title": "Owner's chat",
         "title_is_default": True, "orchestrator_model": None, "messages": [], "created_at": "2026-01-01T00:00:00Z"},
        {"chat_id": chat_b, "project_id": project_id, "user_id": other_user_id, "title": "Collaborator's chat",
         "title_is_default": True, "orchestrator_model": None, "messages": [], "created_at": "2026-01-01T00:01:00Z"},
    ])
    await db[ADM_COLLECTION_CHAT_ARTIFACTS].insert_many([
        {"artifact_id": "task_a1", "chat_id": chat_a, "skill_id": "profile_source", "stage": 1,
         "label": "Profile Source", "output": {"x": 1}, "confidence": 0.9, "citations": [],
         "created_at": "2026-01-01T00:00:10Z"},
        {"artifact_id": "task_b1", "chat_id": chat_b, "skill_id": "derive_keys", "stage": 1,
         "label": "Derive Keys", "output": {"y": 2}, "confidence": 0.8, "citations": [],
         "created_at": "2026-01-01T00:01:10Z"},
    ])
    return project_id, chat_a, chat_b


def _cleanup(project_id: str, chat_a: str, chat_b: str, owner_id: str, other_user_id: str):
    async def _delete():
        db = ADM_get_db()
        await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": project_id})
        await db[ADM_COLLECTION_CHATS].delete_many({"chat_id": {"$in": [chat_a, chat_b]}})
        await db[ADM_COLLECTION_CHAT_ARTIFACTS].delete_many({"chat_id": {"$in": [chat_a, chat_b]}})
        await db[ADM_COLLECTION_USERS].delete_many({"user_id": {"$in": [owner_id, other_user_id]}})

    ADM_reset_mongo_client()
    asyncio.run(_delete())


def test_lists_artifacts_from_every_chat_in_the_project_not_just_one():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    other_user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, chat_a, chat_b = asyncio.run(_seed(owner_id, other_user_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp = client.get(f"/projects/{project_id}/artifacts")
        assert resp.status_code == 200
        docs = resp.json()
        assert {d["artifact_id"] for d in docs} == {"task_a1", "task_b1"}
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, chat_a, chat_b, owner_id, other_user_id)


def test_each_artifact_is_tagged_with_its_chat_and_producing_user():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    other_user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, chat_a, chat_b = asyncio.run(_seed(owner_id, other_user_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp = client.get(f"/projects/{project_id}/artifacts")
        docs = {d["artifact_id"]: d for d in resp.json()}

        assert docs["task_a1"]["chat_title"] == "Owner's chat"
        assert docs["task_a1"]["created_by_user_id"] == owner_id
        assert docs["task_a1"]["created_by_username"] == f"owner_{owner_id[-6:]}"

        assert docs["task_b1"]["chat_title"] == "Collaborator's chat"
        assert docs["task_b1"]["created_by_user_id"] == other_user_id
        assert docs["task_b1"]["created_by_username"] == f"collab_{other_user_id[-6:]}"
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, chat_a, chat_b, owner_id, other_user_id)


def test_a_collaborator_can_also_see_the_full_project_artifact_list():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    other_user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, chat_a, chat_b = asyncio.run(_seed(owner_id, other_user_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(other_user_id)
        resp = client.get(f"/projects/{project_id}/artifacts")
        assert resp.status_code == 200
        assert {d["artifact_id"] for d in resp.json()} == {"task_a1", "task_b1"}
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, chat_a, chat_b, owner_id, other_user_id)


def test_requires_project_access():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    other_user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    stranger_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, chat_a, chat_b = asyncio.run(_seed(owner_id, other_user_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(stranger_id)
        resp = client.get(f"/projects/{project_id}/artifacts")
        assert resp.status_code in (403, 404)
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, chat_a, chat_b, owner_id, other_user_id)


def test_returns_empty_list_for_a_project_with_no_chats_yet():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()

    async def _seed_bare_project():
        db = ADM_get_db()
        project_id = f"proj_test_{uuid.uuid4().hex[:10]}"
        await db[ADM_COLLECTION_PROJECTS].insert_one({
            "project_id": project_id, "owner_user_id": owner_id, "name": "Bare", "layer": "silver",
            "domain": "Test Domain", "collaborator_user_ids": [], "has_business_standards": False,
        })
        return project_id

    project_id = asyncio.run(_seed_bare_project())
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp = client.get(f"/projects/{project_id}/artifacts")
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)

        async def _cleanup_bare():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": project_id})

        ADM_reset_mongo_client()
        asyncio.run(_cleanup_bare())
