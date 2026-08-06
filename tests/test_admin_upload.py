"""
Tests for the multi-file admin upload endpoint. Run with: pytest

Uses FastAPI's dependency_overrides (the standard pattern for isolating
auth from the endpoint under test — see fastapi.testclient docs) rather
than registering a real user, so this stays fast and independent of any
particular seeded account. The actual upload logic still runs for real
against the live Mongo cluster (same as tests/test_health.py's
TestClient-based test), since that's the behavior actually being verified.

Every test's document content includes a fresh uuid — the Phase 4
content-hash dedupe feature (app/core/fingerprint.py) means two runs of
this suite uploading the exact same fixed text would otherwise see the
SECOND run's "fresh" upload flagged as a duplicate of the first run's
leftover document (this file doesn't drop the kb_documents collection
between runs), which isn't a real bug — it's this test file not being
idempotent across repeated runs once dedupe exists. Cleanup below deletes
what each test created so the DB doesn't grow unbounded either way.
"""
import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.auth import ADM_get_current_user_id
from app.core.auth import ADM_require_admin
from app.db.mongo_client import ADM_reset_mongo_client

_raw_client = TestClient(app)


class _ResettingClient:
    """Starlette's TestClient spins its own short-lived anyio portal (its
    own event loop) for EVERY individual request call, even reusing one
    TestClient instance — Motor's cached AsyncIOMotorClient stays bound to
    whichever loop was running when first used, so a SECOND sequential
    call within the same test crashes with "Event loop is closed" unless
    reset before every single call, not just once per test. Same pattern
    as tests/test_business_standards_routes.py — first hit here by the
    Phase 4 dedupe tests, which are this file's first tests to make 2+
    sequential calls in one test body."""

    def __getattr__(self, name):
        method = getattr(_raw_client, name)

        def wrapped(*args, **kwargs):
            ADM_reset_mongo_client()
            return method(*args, **kwargs)

        return wrapped


client = _ResettingClient()


@pytest.fixture(autouse=True)
def _reset_mongo_client_per_test():
    ADM_reset_mongo_client()
    yield


def _unique_markdown(label: str) -> bytes:
    return f"# {label} {uuid.uuid4().hex}\n\nUnique content for this test run.".encode("utf-8")


def _cleanup(doc_id: str | None):
    if doc_id:
        client.delete(f"/admin/kb/documents/{doc_id}")


def _override_admin():
    return "user_test_admin_fixture"


def _override_non_admin():
    return "user_test_nonadmin_fixture"


def test_multi_file_modeling_upload_returns_one_result_per_file():
    app.dependency_overrides[ADM_require_admin] = _override_admin
    doc_ids: list[str] = []
    try:
        files = [
            ("files", ("doc1.md", io.BytesIO(_unique_markdown("Doc One")), "text/markdown")),
            ("files", ("doc2.md", io.BytesIO(_unique_markdown("Doc Two")), "text/markdown")),
        ]
        resp = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown"},
            files=files,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["results"]) == 2
        filenames = {r["filename"] for r in body["results"]}
        assert filenames == {"doc1.md", "doc2.md"}
        for r in body["results"]:
            assert r["status"] == "processing"
            doc_ids.append(r["doc_id"])
    finally:
        for doc_id in doc_ids:
            _cleanup(doc_id)
        app.dependency_overrides.pop(ADM_require_admin, None)


def test_upload_without_admin_dependency_override_is_rejected():
    # No override — ADM_get_current_user_id has no valid token, so this
    # should fail auth before ever reaching ADM_require_admin's check.
    files = [("files", ("doc.md", io.BytesIO(b"# Doc"), "text/markdown"))]
    resp = client.post("/admin/kb/upload", data={"kb_type": "modeling"}, files=files)
    assert resp.status_code == 401


def test_non_admin_user_gets_403():
    # A real, valid user_id — just not one ADMIN_USERNAMES would trust —
    # overriding ADM_get_current_user_id directly to bypass needing a real
    # JWT, then letting ADM_require_admin's own real logic (unmocked) reject it.
    app.dependency_overrides[ADM_get_current_user_id] = _override_non_admin
    try:
        files = [("files", ("doc.md", io.BytesIO(b"# Doc"), "text/markdown"))]
        resp = client.post("/admin/kb/upload", data={"kb_type": "modeling"}, files=files)
        assert resp.status_code in (403, 404)  # 404 if the fixture user_id truly doesn't exist in `users`
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)


def test_reuploading_identical_content_is_flagged_as_duplicate_not_reingested():
    app.dependency_overrides[ADM_require_admin] = _override_admin
    first_doc_id = None
    try:
        content = _unique_markdown("Dedup Test Doc")
        first = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown"},
            files=[("files", ("first_name.md", io.BytesIO(content), "text/markdown"))],
        )
        assert first.status_code == 200
        first_result = first.json()["results"][0]
        assert first_result["status"] == "processing"
        first_doc_id = first_result["doc_id"]

        second = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown"},
            files=[("files", ("second_name.md", io.BytesIO(content), "text/markdown"))],
        )
        assert second.status_code == 200
        second_result = second.json()["results"][0]
        assert second_result["status"] == "duplicate"
        assert second_result["existing_doc_id"] == first_doc_id
    finally:
        _cleanup(first_doc_id)
        app.dependency_overrides.pop(ADM_require_admin, None)


def test_different_content_is_not_flagged_as_duplicate():
    app.dependency_overrides[ADM_require_admin] = _override_admin
    doc_ids: list[str] = []
    try:
        first = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown"},
            files=[("files", ("unique_a.md", io.BytesIO(_unique_markdown("Doc A")), "text/markdown"))],
        )
        second = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown"},
            files=[("files", ("unique_b.md", io.BytesIO(_unique_markdown("Doc B")), "text/markdown"))],
        )
        assert first.json()["results"][0]["status"] == "processing"
        assert second.json()["results"][0]["status"] == "processing"
        doc_ids = [first.json()["results"][0]["doc_id"], second.json()["results"][0]["doc_id"]]
    finally:
        for doc_id in doc_ids:
            _cleanup(doc_id)
        app.dependency_overrides.pop(ADM_require_admin, None)


def test_invalid_kb_type_rejected():
    app.dependency_overrides[ADM_require_admin] = _override_admin
    try:
        files = [("files", ("doc.md", io.BytesIO(b"# Doc"), "text/markdown"))]
        resp = client.post("/admin/kb/upload", data={"kb_type": "business_standards"}, files=files)
        assert resp.status_code == 400
        assert "business_standards" not in resp.json()["detail"] or "kb_type must be one of" in resp.json()["detail"]
    finally:
        app.dependency_overrides.pop(ADM_require_admin, None)
