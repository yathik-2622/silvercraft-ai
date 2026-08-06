"""
Tests for the project-owner self-serve Business Standards routes. Run
with: pytest

Real Mongo project/business_standards documents (via ADM_get_db directly,
not through the API), auth isolated via dependency_overrides on
ADM_get_current_user_id — ADM_assert_project_owner/ADM_assert_project_access
themselves are NOT mocked, so this genuinely exercises the real ownership
logic, not a stand-in for it.
"""
import io

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.auth import ADM_get_current_user_id
from app.db.collections import ADM_COLLECTION_BUSINESS_STANDARDS, ADM_COLLECTION_PROJECTS
from app.db.mongo_client import ADM_get_db, ADM_reset_mongo_client
from app.models.schemas import ADM_new_id

_raw_client = TestClient(app)

OWNER_ID = "user_test_bs_owner"
COLLAB_ID = "user_test_bs_collab"
STRANGER_ID = "user_test_bs_stranger"


class _ResettingClient:
    """Each of TestClient's request methods spins its own short-lived
    anyio portal (its own event loop) that fully tears down once that
    single call returns — confirmed empirically here: a SECOND sequential
    call within the same test, even reusing one TestClient instance,
    crashes with "Event loop is closed" the moment it touches the
    lru_cache'd Motor client left bound to the FIRST call's now-dead loop.
    Reset before every call, not just once per test."""

    def __getattr__(self, name):
        method = getattr(_raw_client, name)

        def wrapped(*args, **kwargs):
            ADM_reset_mongo_client()
            return method(*args, **kwargs)

        return wrapped


client = _ResettingClient()


@pytest.fixture()
def project_id():
    """Inserts a real project doc (OWNER_ID as owner, COLLAB_ID as
    collaborator) directly, and cleans up both it and any
    business_standards doc afterward."""
    import asyncio

    async def _create():
        db = ADM_get_db()
        pid = ADM_new_id("proj")
        await db[ADM_COLLECTION_PROJECTS].insert_one({
            "project_id": pid, "owner_user_id": OWNER_ID, "name": "BS Route Test",
            "layer": "silver", "domain": "QA", "target_platform": None,
            "collaborator_user_ids": [COLLAB_ID], "created_at": "2026-01-01T00:00:00+00:00",
            "has_business_standards": False,
        })
        return pid

    async def _cleanup(pid):
        db = ADM_get_db()
        await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": pid})
        await db[ADM_COLLECTION_BUSINESS_STANDARDS].delete_one({"project_id": pid})

    ADM_reset_mongo_client()
    pid = asyncio.run(_create())
    # _create()'s own asyncio.run() closes its loop on return, leaving the
    # cached Mongo client bound to a now-dead loop — same "Event loop is
    # closed" issue the module-level fixture guards against, just
    # reintroduced by this fixture's own setup call. Reset again right
    # before control passes to the test body / TestClient's own request loop.
    ADM_reset_mongo_client()
    yield pid
    ADM_reset_mongo_client()
    asyncio.run(_cleanup(pid))


def _as(user_id):
    app.dependency_overrides[ADM_get_current_user_id] = lambda: user_id


def _clear_override():
    app.dependency_overrides.pop(ADM_get_current_user_id, None)


def test_owner_can_upload_then_read(project_id):
    _as(OWNER_ID)
    try:
        files = {"file": ("standards.md", io.BytesIO(b"# Rules\n\nBe consistent."), "text/markdown")}
        put_resp = client.put(f"/projects/{project_id}/business-standards", files=files)
        assert put_resp.status_code == 200
        assert put_resp.json()["char_length"] > 0

        get_resp = client.get(f"/projects/{project_id}/business-standards")
        assert get_resp.status_code == 200
        assert "Be consistent" in get_resp.json()["full_text"]
    finally:
        _clear_override()


def test_owner_can_edit_via_patch(project_id):
    _as(OWNER_ID)
    try:
        files = {"file": ("standards.md", io.BytesIO(b"# Rules\n\nOriginal text."), "text/markdown")}
        client.put(f"/projects/{project_id}/business-standards", files=files)

        patch_resp = client.patch(f"/projects/{project_id}/business-standards", json={"full_text": "# Rules\n\nEdited text."})
        assert patch_resp.status_code == 200

        get_resp = client.get(f"/projects/{project_id}/business-standards")
        assert "Edited text" in get_resp.json()["full_text"]
        assert "Original text" not in get_resp.json()["full_text"]
    finally:
        _clear_override()


def test_upload_sets_has_business_standards_flag(project_id):
    _as(OWNER_ID)
    try:
        files = {"file": ("standards.md", io.BytesIO(b"# Rules"), "text/markdown")}
        client.put(f"/projects/{project_id}/business-standards", files=files)
        project_resp = client.get(f"/projects/{project_id}")
        assert project_resp.status_code == 200
        assert project_resp.json()["has_business_standards"] is True
    finally:
        _clear_override()


def test_collaborator_can_view_but_not_edit(project_id):
    _as(OWNER_ID)
    files = {"file": ("standards.md", io.BytesIO(b"# Rules"), "text/markdown")}
    client.put(f"/projects/{project_id}/business-standards", files=files)
    _clear_override()

    _as(COLLAB_ID)
    try:
        get_resp = client.get(f"/projects/{project_id}/business-standards")
        assert get_resp.status_code == 200

        put_resp = client.put(
            f"/projects/{project_id}/business-standards",
            files={"file": ("x.md", io.BytesIO(b"# X"), "text/markdown")},
        )
        assert put_resp.status_code == 404  # never 403 — see app.core.ownership's convention

        patch_resp = client.patch(f"/projects/{project_id}/business-standards", json={"full_text": "hacked"})
        assert patch_resp.status_code == 404
    finally:
        _clear_override()


def test_stranger_gets_404_on_read(project_id):
    _as(STRANGER_ID)
    try:
        resp = client.get(f"/projects/{project_id}/business-standards")
        assert resp.status_code == 404
    finally:
        _clear_override()


def test_patch_with_empty_text_rejected(project_id):
    _as(OWNER_ID)
    try:
        resp = client.patch(f"/projects/{project_id}/business-standards", json={"full_text": "   "})
        assert resp.status_code == 400
    finally:
        _clear_override()
