"""
Tests for POST /contracts/{id}/hitl/{task_id}/edit — specifically that
ADM_HitlResolveRequest.edited_output accepts a top-level JSON ARRAY, not
just a dict. A task's real output can be a bare array (e.g.
discover_relationships' candidate-relationships list) — editing one via
the structured HITL editor was silently impossible before this fix, since
the Pydantic field only accepted `dict`. Run with: pytest
"""
import asyncio
import uuid

from fastapi.testclient import TestClient

from app.core.auth import ADM_get_current_user_id
from app.db.collections import ADM_COLLECTION_EXECUTION_CONTRACTS, ADM_COLLECTION_PROJECTS, ADM_COLLECTION_RUN_STATE
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


async def _seed(user_id: str, task_id: str, gate_mode: str):
    db = ADM_get_db()
    project_id = f"proj_test_{uuid.uuid4().hex[:10]}"
    contract_id = f"contract_test_{uuid.uuid4().hex[:10]}"
    await db[ADM_COLLECTION_PROJECTS].insert_one({
        "project_id": project_id, "owner_user_id": user_id, "name": "Test", "layer": "silver",
        "domain": "Test Domain", "collaborator_user_ids": [], "has_business_standards": False,
    })
    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].insert_one({
        "contract_id": contract_id, "project_id": project_id, "chat_id": "chat_test",
        "workflow_skill_id": "wf_test", "status": "paused", "stages": {}, "source_refs": [], "comments": [],
    })
    await db[ADM_COLLECTION_RUN_STATE].insert_one({
        "contract_id": contract_id, "checkpoint_id": None, "current_stage": 1,
        "stage_status": {"1": "awaiting_hitl"},
        "hitl_gates": [{"task_id": task_id, "mode": gate_mode, "reason": "test", "status": "pending",
                         "result_snapshot": None, "user_override": False}],
        "task_results": {task_id: {"output": {"placeholder": True}, "confidence": 0.5}},
        "updated_at": "2026-01-01T00:00:00Z",
    })
    return project_id, contract_id


def _cleanup(project_id: str, contract_id: str):
    async def _delete():
        db = ADM_get_db()
        await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": project_id})
        await db[ADM_COLLECTION_EXECUTION_CONTRACTS].delete_one({"contract_id": contract_id})
        await db[ADM_COLLECTION_RUN_STATE].delete_one({"contract_id": contract_id})

    ADM_reset_mongo_client()
    asyncio.run(_delete())


def test_hitl_edit_accepts_a_top_level_array_output():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, contract_id = asyncio.run(_seed(user_id, "task_discover_relationships", "mandatory"))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    try:
        edited_array = [
            {"parent_table": "orders", "parent_column": "order_id", "child_table": "order_lines",
             "child_column": "order_id", "confidence": 0.95, "rationale": "user-corrected"},
        ]
        resp = client.post(
            f"/contracts/{contract_id}/hitl/task_discover_relationships/edit",
            json={"edited_output": edited_array},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "edited"

        async def _fetch():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": contract_id}, {"_id": 0})

        run_state = asyncio.run(_fetch())
        assert run_state["task_results"]["task_discover_relationships"]["output"] == edited_array
        assert run_state["hitl_gates"][0]["status"] == "edited"
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, contract_id)


def test_hitl_edit_still_accepts_a_dict_output():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, contract_id = asyncio.run(_seed(user_id, "task_derive_keys", "mandatory"))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    try:
        edited_dict = {"primary_key": ["id"], "foreign_keys": []}
        resp = client.post(
            f"/contracts/{contract_id}/hitl/task_derive_keys/edit",
            json={"edited_output": edited_dict},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "edited"
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, contract_id)


def test_hitl_edit_without_edited_output_is_rejected():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id, contract_id = asyncio.run(_seed(user_id, "task_x", "mandatory"))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    try:
        resp = client.post(f"/contracts/{contract_id}/hitl/task_x/edit", json={})
        assert resp.status_code == 400
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, contract_id)
