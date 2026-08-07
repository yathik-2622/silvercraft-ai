"""
Tests for Phase 2's persisted chat artifacts — app/core/reasoning_stream.py
::ADM_stream_artifact now writes a real Mongo document (not just a live WS
publish) so a reloaded chat can still resolve its artifact chips via
GET /chats/{id}/artifacts, and app/graphs/solution_agent_graph.py
::ADM__announce_new_artifacts pushes one assistant message with
artifact_ids per completed stage batch. Run with: pytest
"""
import asyncio
import uuid

from fastapi.testclient import TestClient

from app.core.auth import ADM_get_current_user_id
from app.db.collections import ADM_COLLECTION_CHAT_ARTIFACTS, ADM_COLLECTION_CHATS, ADM_COLLECTION_PROJECTS
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


async def _seed_project_and_chat(user_id: str) -> tuple[str, str]:
    db = ADM_get_db()
    project_id = f"proj_test_{uuid.uuid4().hex[:10]}"
    chat_id = f"chat_test_{uuid.uuid4().hex[:10]}"
    await db[ADM_COLLECTION_PROJECTS].insert_one({
        "project_id": project_id, "owner_user_id": user_id, "name": "Test", "layer": "silver",
        "domain": "Test Domain", "collaborator_user_ids": [], "has_business_standards": False,
    })
    await db[ADM_COLLECTION_CHATS].insert_one({
        "chat_id": chat_id, "project_id": project_id, "user_id": user_id, "title": "Test",
        "title_is_default": True, "orchestrator_model": None, "messages": [], "created_at": "2026-01-01T00:00:00Z",
    })
    return project_id, chat_id


def _cleanup(project_id: str, chat_id: str):
    async def _delete():
        db = ADM_get_db()
        await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": project_id})
        await db[ADM_COLLECTION_CHATS].delete_one({"chat_id": chat_id})
        await db[ADM_COLLECTION_CHAT_ARTIFACTS].delete_many({"chat_id": chat_id})

    ADM_reset_mongo_client()
    asyncio.run(_delete())


def test_stream_artifact_persists_a_real_document(monkeypatch):
    import app.core.reasoning_stream as rs

    published = []

    async def fake_publish(chat_id, event_type, payload):
        published.append((chat_id, event_type, payload))

    monkeypatch.setattr(rs, "ADM_publish_chat_event", fake_publish)

    chat_id = f"chat_test_{uuid.uuid4().hex[:10]}"
    ADM_reset_mongo_client()
    try:
        asyncio.run(rs.ADM_stream_artifact(
            chat_id, "solution_agent", "task_profile_x", "profile_source", 1, "Profile Source",
            {"row_count": 10}, confidence=0.9, citations=[{"title": "doc"}],
        ))
        assert published[0][1] == "artifact"

        async def _fetch():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_CHAT_ARTIFACTS].find_one({"artifact_id": "task_profile_x"}, {"_id": 0})

        doc = asyncio.run(_fetch())
        assert doc is not None
        assert doc["chat_id"] == chat_id
        assert doc["skill_id"] == "profile_source"
        assert doc["output"] == {"row_count": 10}
        assert doc["confidence"] == 0.9
        assert doc["citations"] == [{"title": "doc"}]
    finally:
        async def _cleanup_artifact():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            await db[ADM_COLLECTION_CHAT_ARTIFACTS].delete_many({"chat_id": chat_id})

        asyncio.run(_cleanup_artifact())


def test_get_chat_artifacts_returns_persisted_docs():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, chat_id = asyncio.run(_seed_project_and_chat(user_id))

    async def _seed_artifacts():
        db = ADM_get_db()
        await db[ADM_COLLECTION_CHAT_ARTIFACTS].insert_many([
            {"artifact_id": "task_a", "chat_id": chat_id, "skill_id": "profile_source", "stage": 1,
             "label": "Profile Source", "output": {"x": 1}, "confidence": 0.8, "citations": [],
             "created_at": "2026-01-01T00:00:00Z"},
            {"artifact_id": "task_b", "chat_id": chat_id, "skill_id": "classify_sensitivity", "stage": 1,
             "label": "Classify Sensitivity", "output": {"y": 2}, "confidence": 0.7, "citations": [],
             "created_at": "2026-01-01T00:01:00Z"},
        ])

    ADM_reset_mongo_client()
    asyncio.run(_seed_artifacts())

    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    try:
        resp = client.get(f"/chats/{chat_id}/artifacts")
        assert resp.status_code == 200
        docs = resp.json()
        assert len(docs) == 2
        assert [d["artifact_id"] for d in docs] == ["task_a", "task_b"]
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, chat_id)


def test_get_chat_artifacts_requires_chat_access():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    stranger_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, chat_id = asyncio.run(_seed_project_and_chat(owner_id))

    app.dependency_overrides[ADM_get_current_user_id] = _override_user(stranger_id)
    try:
        resp = client.get(f"/chats/{chat_id}/artifacts")
        assert resp.status_code in (403, 404)
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, chat_id)


def test_announce_new_artifacts_pushes_one_message_with_artifact_ids(monkeypatch):
    import app.graphs.solution_agent_graph as sag

    published = []

    async def fake_publish(chat_id, event_type, payload):
        published.append((chat_id, event_type, payload))

    monkeypatch.setattr(sag, "ADM_publish_chat_event", fake_publish)

    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, chat_id = asyncio.run(_seed_project_and_chat(user_id))
    try:
        before = {"task_a": {"output": {}}}
        after = {"task_a": {"output": {}}, "task_b": {"output": {}}, "task_c": {"output": {}}}
        ADM_reset_mongo_client()
        asyncio.run(sag.ADM__announce_new_artifacts(chat_id, 2, before, after))

        assert len(published) == 1
        assert published[0][1] == "orchestrator_response"
        assert set(published[0][2]["artifact_ids"]) == {"task_b", "task_c"}
        assert "Stage 2" in published[0][2]["content"]

        async def _fetch_chat():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_CHATS].find_one({"chat_id": chat_id}, {"_id": 0})

        chat_doc = asyncio.run(_fetch_chat())
        assert len(chat_doc["messages"]) == 1
        assert set(chat_doc["messages"][0]["artifact_ids"]) == {"task_b", "task_c"}
    finally:
        _cleanup(project_id, chat_id)


def test_announce_new_artifacts_no_op_when_nothing_new(monkeypatch):
    import app.graphs.solution_agent_graph as sag

    published = []
    monkeypatch.setattr(sag, "ADM_publish_chat_event", lambda *a, **k: published.append(a))

    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, chat_id = asyncio.run(_seed_project_and_chat(user_id))
    try:
        same = {"task_a": {"output": {}}}
        asyncio.run(sag.ADM__announce_new_artifacts(chat_id, 1, same, same))
        assert published == []

        async def _fetch_chat():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_CHATS].find_one({"chat_id": chat_id}, {"_id": 0})

        chat_doc = asyncio.run(_fetch_chat())
        assert chat_doc["messages"] == []
    finally:
        _cleanup(project_id, chat_id)
