"""
Unit tests for Phase 8's task-scoped plan comments — real execution
instructions, not passive annotations:
1. app/graphs/solution_agent_graph.py::ADM_execute_one_task filters
   contract["comments"] by task_id and injects matches into
   input_payload["user_instructions"].
2. app/api/routes_contracts.py::ADM_add_plan_comment rejects a new
   task-scoped comment (400) once the contract is no longer "draft".
Run with: pytest
"""
import asyncio
import uuid

from fastapi.testclient import TestClient

from app.graphs import solution_agent_graph as sag
from app.main import app
from app.core.auth import ADM_get_current_user_id
from app.db.collections import ADM_COLLECTION_EXECUTION_CONTRACTS, ADM_COLLECTION_PROJECTS
from app.db.mongo_client import ADM_get_db, ADM_reset_mongo_client

_raw_client = TestClient(app)


class _ResettingClient:
    def __getattr__(self, name):
        method = getattr(_raw_client, name)

        def wrapped(*args, **kwargs):
            ADM_reset_mongo_client()
            return method(*args, **kwargs)

        return wrapped


client = _ResettingClient()


def _patch_execution_deps(monkeypatch, captured_input_payload: dict):
    async def fake_load_pinned_skill(skill_id, version):
        return {"skill_id": skill_id, "version": version, "title": "Derive Keys", "purpose": "p", "tools": []}

    async def fake_stream_agent_call(*a, **k):
        return None

    async def fake_build_task_context(**k):
        return {"citations": []}

    async def fake_run_task_worker(skill, task_ctx, run_invariant_ctx, input_payload, chat_id=None, task_id=None):
        captured_input_payload.clear()
        captured_input_payload.update(input_payload)
        return {"output": {"result": "ok"}, "confidence": 0.9}

    async def fake_stream_log(*a, **k):
        return None

    async def fake_stream_artifact(*a, **k):
        return None

    monkeypatch.setattr(sag, "ADM_load_pinned_skill", fake_load_pinned_skill)
    monkeypatch.setattr(sag, "ADM_stream_agent_call", fake_stream_agent_call)
    monkeypatch.setattr(sag, "ADM_build_task_context", fake_build_task_context)
    monkeypatch.setattr(sag, "ADM_run_task_worker", fake_run_task_worker)
    monkeypatch.setattr(sag, "ADM_stream_log", fake_stream_log)
    monkeypatch.setattr(sag, "ADM_stream_artifact", fake_stream_artifact)


def test_task_scoped_comment_injected_into_matching_task_only(monkeypatch):
    captured: dict = {}
    _patch_execution_deps(monkeypatch, captured)

    contract = {
        "chat_id": "chat_1",
        "source_refs": [],
        "comments": [
            {"author_user_id": "u1", "text": "Use surrogate keys, not natural keys.", "task_id": "task_derive_keys"},
            {"author_user_id": "u1", "text": "General plan-wide note.", "task_id": None},
            {"author_user_id": "u1", "text": "This belongs to a different task.", "task_id": "task_profile_source"},
        ],
    }
    planned_task = {"task_id": "task_derive_keys", "skill_id": "derive_keys", "skill_version": 1, "stage": 2}

    asyncio.run(sag.ADM_execute_one_task(contract, {}, planned_task))

    assert captured["user_instructions"] == ["Use surrogate keys, not natural keys."]


def test_no_task_scoped_comments_means_no_user_instructions_key(monkeypatch):
    captured: dict = {}
    _patch_execution_deps(monkeypatch, captured)

    contract = {
        "chat_id": "chat_1",
        "source_refs": [],
        "comments": [{"author_user_id": "u1", "text": "General plan-wide note.", "task_id": None}],
    }
    planned_task = {"task_id": "task_derive_keys", "skill_id": "derive_keys", "skill_version": 1, "stage": 2}

    asyncio.run(sag.ADM_execute_one_task(contract, {}, planned_task))

    assert "user_instructions" not in captured


def test_multiple_comments_on_same_task_all_included(monkeypatch):
    captured: dict = {}
    _patch_execution_deps(monkeypatch, captured)

    contract = {
        "chat_id": "chat_1",
        "source_refs": [],
        "comments": [
            {"author_user_id": "u1", "text": "First instruction.", "task_id": "task_x"},
            {"author_user_id": "u1", "text": "Second instruction.", "task_id": "task_x"},
        ],
    }
    planned_task = {"task_id": "task_x", "skill_id": "s", "skill_version": 1, "stage": 1}

    asyncio.run(sag.ADM_execute_one_task(contract, {}, planned_task))

    assert captured["user_instructions"] == ["First instruction.", "Second instruction."]


def test_contract_with_no_comments_key_degrades_gracefully(monkeypatch):
    captured: dict = {}
    _patch_execution_deps(monkeypatch, captured)

    contract = {"chat_id": "chat_1", "source_refs": []}
    planned_task = {"task_id": "task_x", "skill_id": "s", "skill_version": 1, "stage": 1}

    asyncio.run(sag.ADM_execute_one_task(contract, {}, planned_task))

    assert "user_instructions" not in captured


# ---------------------------------------------------------------------------
# ADM_add_plan_comment — real HTTP layer, real Mongo, TestClient.
# ---------------------------------------------------------------------------


def _override_user(user_id: str):
    return lambda: user_id


async def _seed_project_and_contract(user_id: str, contract_status: str) -> tuple[str, str]:
    db = ADM_get_db()
    project_id = f"proj_test_{uuid.uuid4().hex[:10]}"
    contract_id = f"contract_test_{uuid.uuid4().hex[:10]}"
    await db[ADM_COLLECTION_PROJECTS].insert_one({
        "project_id": project_id, "owner_user_id": user_id, "name": "Test", "layer": "silver",
        "domain": "Test Domain", "collaborator_user_ids": [], "has_business_standards": False,
    })
    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].insert_one({
        "contract_id": contract_id, "project_id": project_id, "chat_id": "chat_test",
        "workflow_skill_id": "wf_test", "status": contract_status, "stages": {}, "source_refs": [], "comments": [],
    })
    return project_id, contract_id


def _cleanup_project_and_contract(project_id: str, contract_id: str):
    async def _delete():
        db = ADM_get_db()
        await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": project_id})
        await db[ADM_COLLECTION_EXECUTION_CONTRACTS].delete_one({"contract_id": contract_id})

    ADM_reset_mongo_client()
    asyncio.run(_delete())


def test_task_scoped_comment_rejected_once_contract_is_approved():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, contract_id = asyncio.run(_seed_project_and_contract(user_id, "approved"))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    try:
        resp = client.post(f"/contracts/{contract_id}/comments", json={"text": "Too late.", "task_id": "task_x"})
        assert resp.status_code == 400
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup_project_and_contract(project_id, contract_id)


def test_task_scoped_comment_accepted_while_draft():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, contract_id = asyncio.run(_seed_project_and_contract(user_id, "draft"))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    try:
        resp = client.post(f"/contracts/{contract_id}/comments", json={"text": "Use surrogate keys.", "task_id": "task_x"})
        assert resp.status_code == 200
        assert resp.json()["task_id"] == "task_x"
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup_project_and_contract(project_id, contract_id)


def test_plan_wide_comment_still_accepted_after_approval():
    """The pre-existing behavior (task_id=None) must still work post-approval — only
    task-scoped comments are gated."""
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, contract_id = asyncio.run(_seed_project_and_contract(user_id, "approved"))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    try:
        resp = client.post(f"/contracts/{contract_id}/comments", json={"text": "General note."})
        assert resp.status_code == 200
        assert resp.json()["task_id"] is None
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup_project_and_contract(project_id, contract_id)
