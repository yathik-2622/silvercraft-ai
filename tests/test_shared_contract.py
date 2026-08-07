"""
Tests for the shared, versioned multi-user project canvas:
  - GET /projects/{project_id}/contract — one shared contract per project,
    resolved by project_id rather than chat_id (routes_projects.py).
  - ADM_orchestrator_task_async's creation guard — a second chat in the
    same project doesn't fork a competing contract while one's active
    (celery_app/tasks.py).
  - ADM_hitl_approve/ADM_hitl_edit now record resolved_by_user_id and
    append a task_results[task_id].history entry (routes_contracts.py).
  - ADM_hitl_edit's optimistic-concurrency check: a stale base_revision_count
    is rejected with 409 and does NOT mutate run_state.
Run with: pytest
"""
import asyncio
import uuid

from fastapi.testclient import TestClient

from app.core.auth import ADM_get_current_user_id
from app.db.collections import (
    ADM_COLLECTION_CHATS, ADM_COLLECTION_EXECUTION_CONTRACTS, ADM_COLLECTION_PROJECTS, ADM_COLLECTION_RUN_STATE,
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


async def _seed_project_with_contract(owner_id: str, gate_mode: str = "mandatory") -> dict:
    db = ADM_get_db()
    project_id = f"proj_test_{uuid.uuid4().hex[:10]}"
    chat_id = f"chat_test_{uuid.uuid4().hex[:10]}"
    contract_id = f"contract_test_{uuid.uuid4().hex[:10]}"
    task_id = "task_derive_keys"
    await db[ADM_COLLECTION_PROJECTS].insert_one({
        "project_id": project_id, "owner_user_id": owner_id, "name": "Test", "layer": "silver",
        "domain": "Test Domain", "collaborator_user_ids": [], "has_business_standards": False,
    })
    await db[ADM_COLLECTION_CHATS].insert_one({
        "chat_id": chat_id, "project_id": project_id, "user_id": owner_id, "title": "Test",
        "title_is_default": True, "orchestrator_model": None, "messages": [], "created_at": "2026-01-01T00:00:00Z",
    })
    await db[ADM_COLLECTION_EXECUTION_CONTRACTS].insert_one({
        "contract_id": contract_id, "project_id": project_id, "chat_id": chat_id,
        "workflow_skill_id": "wf_test", "modeling_style": "canonical", "status": "paused",
        "stages": {}, "source_refs": [], "user_selected_skills": {}, "comments": [],
        "immutable": False, "created_at": "2026-01-01T00:00:00Z", "approved_at": None,
    })
    await db[ADM_COLLECTION_RUN_STATE].insert_one({
        "contract_id": contract_id, "current_stage": 1, "stage_status": {"1": "awaiting_hitl"},
        "hitl_gates": [{"task_id": task_id, "mode": gate_mode, "reason": "test", "status": "pending",
                         "result_snapshot": None, "user_override": False, "resolved_by_user_id": None}],
        "task_results": {task_id: {
            "output": {"primary_key": ["id"]}, "confidence": 0.8,
            "history": [{"output": {"primary_key": ["id"]}, "confidence": 0.8,
                         "edited_by_user_id": None, "created_at": "2026-01-01T00:00:00Z", "action": "generated"}],
        }},
        "checkpoint_id": None, "updated_at": "2026-01-01T00:00:00Z",
    })
    return {"project_id": project_id, "chat_id": chat_id, "contract_id": contract_id, "task_id": task_id}


def _cleanup(project_id: str):
    async def _delete():
        db = ADM_get_db()
        await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": project_id})
        await db[ADM_COLLECTION_CHATS].delete_many({"project_id": project_id})
        contracts = await db[ADM_COLLECTION_EXECUTION_CONTRACTS].find({"project_id": project_id}, {"contract_id": 1}).to_list(length=50)
        contract_ids = [c["contract_id"] for c in contracts]
        await db[ADM_COLLECTION_EXECUTION_CONTRACTS].delete_many({"project_id": project_id})
        if contract_ids:
            await db[ADM_COLLECTION_RUN_STATE].delete_many({"contract_id": {"$in": contract_ids}})

    ADM_reset_mongo_client()
    asyncio.run(_delete())


def test_get_project_contract_returns_the_shared_contract():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    seed = asyncio.run(_seed_project_with_contract(owner_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp = client.get(f"/projects/{seed['project_id']}/contract")
        assert resp.status_code == 200
        assert resp.json()["contract_id"] == seed["contract_id"]
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(seed["project_id"])


def test_get_project_contract_404_when_none_exists():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()

    async def _seed_bare():
        db = ADM_get_db()
        project_id = f"proj_test_{uuid.uuid4().hex[:10]}"
        await db[ADM_COLLECTION_PROJECTS].insert_one({
            "project_id": project_id, "owner_user_id": owner_id, "name": "Bare", "layer": "silver",
            "domain": "Test Domain", "collaborator_user_ids": [], "has_business_standards": False,
        })
        return project_id

    project_id = asyncio.run(_seed_bare())
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp = client.get(f"/projects/{project_id}/contract")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id)


def test_get_project_contract_requires_access():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    stranger_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    seed = asyncio.run(_seed_project_with_contract(owner_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(stranger_id)
        resp = client.get(f"/projects/{seed['project_id']}/contract")
        assert resp.status_code in (403, 404)
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(seed["project_id"])


def test_hitl_approve_records_resolved_by_user_id_and_history():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    seed = asyncio.run(_seed_project_with_contract(owner_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp = client.post(f"/contracts/{seed['contract_id']}/hitl/{seed['task_id']}/approve")
        assert resp.status_code == 200

        async def _fetch():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": seed["contract_id"]}, {"_id": 0})

        run_state = asyncio.run(_fetch())
        gate = run_state["hitl_gates"][0]
        assert gate["resolved_by_user_id"] == owner_id
        history = run_state["task_results"][seed["task_id"]]["history"]
        assert len(history) == 2  # seeded "generated" + new "approved"
        assert history[-1]["action"] == "approved"
        assert history[-1]["edited_by_user_id"] == owner_id
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(seed["project_id"])


def test_hitl_edit_with_matching_base_revision_count_succeeds_and_appends_history():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    seed = asyncio.run(_seed_project_with_contract(owner_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp = client.post(
            f"/contracts/{seed['contract_id']}/hitl/{seed['task_id']}/edit",
            json={"edited_output": {"primary_key": ["customer_id"]}, "base_revision_count": 1},
        )
        assert resp.status_code == 200
        assert resp.json()["revision_count"] == 2

        async def _fetch():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": seed["contract_id"]}, {"_id": 0})

        run_state = asyncio.run(_fetch())
        assert run_state["task_results"][seed["task_id"]]["output"] == {"primary_key": ["customer_id"]}
        assert run_state["hitl_gates"][0]["resolved_by_user_id"] == owner_id
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(seed["project_id"])


def test_hitl_edit_with_stale_base_revision_count_returns_409_and_does_not_mutate():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    collaborator_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    seed = asyncio.run(_seed_project_with_contract(owner_id))
    async def _add_collaborator():
        db = ADM_get_db()
        await db[ADM_COLLECTION_PROJECTS].update_one(
            {"project_id": seed["project_id"]}, {"$push": {"collaborator_user_ids": collaborator_id}},
        )

    ADM_reset_mongo_client()
    asyncio.run(_add_collaborator())
    try:
        # Collaborator edits first — advances history to length 2.
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(collaborator_id)
        resp1 = client.post(
            f"/contracts/{seed['contract_id']}/hitl/{seed['task_id']}/edit",
            json={"edited_output": {"primary_key": ["order_id"]}, "base_revision_count": 1},
        )
        assert resp1.status_code == 200

        # Owner's client still thinks it's at revision count 1 (stale) — reject.
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp2 = client.post(
            f"/contracts/{seed['contract_id']}/hitl/{seed['task_id']}/edit",
            json={"edited_output": {"primary_key": ["customer_id"]}, "base_revision_count": 1},
        )
        assert resp2.status_code == 409
        body = resp2.json()["detail"]
        assert body["conflict"] is True
        assert body["current_output"] == {"primary_key": ["order_id"]}
        assert body["resolved_by_user_id"] == collaborator_id
        assert body["revision_count"] == 2

        async def _fetch():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_RUN_STATE].find_one({"contract_id": seed["contract_id"]}, {"_id": 0})

        # Confirm the rejected request truly didn't mutate anything further.
        run_state = asyncio.run(_fetch())
        assert run_state["task_results"][seed["task_id"]]["output"] == {"primary_key": ["order_id"]}
        assert len(run_state["task_results"][seed["task_id"]]["history"]) == 2
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(seed["project_id"])


def test_hitl_edit_without_base_revision_count_skips_the_check():
    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    collaborator_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    seed = asyncio.run(_seed_project_with_contract(owner_id))
    try:
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(collaborator_id)
        client.post(
            f"/contracts/{seed['contract_id']}/hitl/{seed['task_id']}/edit",
            json={"edited_output": {"primary_key": ["order_id"]}, "base_revision_count": 1},
        )

        # Older-client-style call, no base_revision_count at all — same as
        # today's pre-versioning behavior, must still succeed (regression guard).
        app.dependency_overrides[ADM_get_current_user_id] = _override_user(owner_id)
        resp = client.post(
            f"/contracts/{seed['contract_id']}/hitl/{seed['task_id']}/edit",
            json={"edited_output": {"primary_key": ["customer_id"]}},
        )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(seed["project_id"])


def test_orchestrator_does_not_fork_a_second_contract_when_one_is_active():
    import app.celery_app.tasks as tasks_mod

    owner_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    seed = asyncio.run(_seed_project_with_contract(owner_id))
    other_chat_id = f"chat_test_{uuid.uuid4().hex[:10]}"

    async def _seed_other_chat():
        db = ADM_get_db()
        await db[ADM_COLLECTION_CHATS].insert_one({
            "chat_id": other_chat_id, "project_id": seed["project_id"], "user_id": owner_id, "title": "Second chat",
            "title_is_default": True, "orchestrator_model": None, "messages": [], "created_at": "2026-01-01T00:00:00Z",
        })

    ADM_reset_mongo_client()
    asyncio.run(_seed_other_chat())

    published = []

    async def fake_publish(chat_id, event_type, payload):
        published.append((chat_id, event_type, payload))

    async def fake_run_orchestrator(*args, **kwargs):
        return {"tier": "tier3", "missing_info": [], "response_text": "Sounds good.", "modeling_style": "canonical"}

    import app.graphs.orchestrator_graph as og

    orig_publish = tasks_mod.ADM_publish_chat_event
    orig_run = og.ADM_run_orchestrator
    tasks_mod.ADM_publish_chat_event = fake_publish
    og.ADM_run_orchestrator = fake_run_orchestrator
    # ADM_orchestrator_task_async imported ADM_run_orchestrator by name — patch that binding too.
    tasks_mod.ADM_run_orchestrator = fake_run_orchestrator

    try:
        ADM_reset_mongo_client()
        asyncio.run(tasks_mod.ADM_orchestrator_task_async(
            other_chat_id, seed["project_id"], "model this too", [], [], None, False, owner_id,
        ))

        async def _count_contracts():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_EXECUTION_CONTRACTS].count_documents({"project_id": seed["project_id"]})

        assert asyncio.run(_count_contracts()) == 1  # still just the one seeded contract
        assert any(
            "already has an active model" in (p[2].get("content") or "") for p in published
        )
    finally:
        tasks_mod.ADM_publish_chat_event = orig_publish
        og.ADM_run_orchestrator = orig_run
        tasks_mod.ADM_run_orchestrator = orig_run
        _cleanup(seed["project_id"])
