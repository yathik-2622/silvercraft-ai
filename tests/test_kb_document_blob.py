"""
Tests for the Phase 3 KB-doc blob storage + native-preview routes
(app/api/routes_kb.py::ADM_get_kb_document_file / ADM_get_kb_document_table_preview,
plus app/api/routes_admin.py's blob_path write at upload time). Run with: pytest

Real Mongo + real disk writes via the TestClient, following the same
_ResettingClient pattern as tests/test_admin_upload.py (this file makes
several sequential HTTP calls per test).
"""
import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.auth import ADM_require_admin, ADM_get_current_user_id
from app.db.mongo_client import ADM_reset_mongo_client

_raw_client = TestClient(app)


class _ResettingClient:
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


def _override_admin():
    return "user_test_kb_blob_admin"


def _override_regular():
    return "user_test_kb_blob_regular"


def _unique_content(label: str) -> str:
    return f"{label} {uuid.uuid4().hex}\nSecond line of content."


def _cleanup(doc_id: str | None):
    """Deletion requires ADM_require_admin — set that override for just
    this call regardless of whatever override the caller had active, then
    restore nothing (callers already pop their own override in their own
    finally block, before or after calling this)."""
    if not doc_id:
        return
    app.dependency_overrides[ADM_require_admin] = _override_admin
    try:
        client.delete(f"/admin/kb/documents/{doc_id}")
    finally:
        app.dependency_overrides.pop(ADM_require_admin, None)


def test_csv_upload_gets_a_blob_path_and_correct_extension():
    app.dependency_overrides[ADM_require_admin] = _override_admin
    doc_id = None
    try:
        csv_bytes = ("name,role\n" + _unique_content("Alice,Engineer")).encode("utf-8")
        resp = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown", "title": "Blob Test CSV"},
            files=[("files", ("people.csv", io.BytesIO(csv_bytes), "text/csv"))],
        )
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "processing"
        doc_id = result["doc_id"]
    finally:
        app.dependency_overrides.pop(ADM_require_admin, None)

    app.dependency_overrides[ADM_get_current_user_id] = _override_regular
    try:
        file_resp = client.get(f"/kb/documents/{doc_id}/file")
        assert file_resp.status_code == 200
        assert file_resp.headers["content-type"].startswith("text/csv")

        preview_resp = client.get(f"/kb/documents/{doc_id}/table-preview")
        assert preview_resp.status_code == 200
        body = preview_resp.json()
        assert body["columns"] == ["name", "role"]
        assert any(row["name"] == "Alice" for row in body["rows"])
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(doc_id)


def test_pdf_like_doc_table_preview_rejected_with_400():
    """Uses a .md doc (not actually a PDF, but any non-csv/xlsx extension
    exercises the same rejection path without needing a real PDF fixture
    — the route only branches on original_extension, never parses PDF
    content for this check)."""
    app.dependency_overrides[ADM_require_admin] = _override_admin
    doc_id = None
    try:
        md_bytes = _unique_content("# Some heading\n\nBody text.").encode("utf-8")
        resp = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown", "title": "Blob Test MD"},
            files=[("files", ("doc.md", io.BytesIO(md_bytes), "text/markdown"))],
        )
        doc_id = resp.json()["results"][0]["doc_id"]
    finally:
        app.dependency_overrides.pop(ADM_require_admin, None)

    app.dependency_overrides[ADM_get_current_user_id] = _override_regular
    try:
        preview_resp = client.get(f"/kb/documents/{doc_id}/table-preview")
        assert preview_resp.status_code == 400
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(doc_id)


def test_file_bytes_round_trip_match_the_original_upload():
    app.dependency_overrides[ADM_require_admin] = _override_admin
    doc_id = None
    original_bytes = ("id,value\n" + _unique_content("1,100")).encode("utf-8")
    try:
        resp = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown", "title": "Blob Roundtrip"},
            files=[("files", ("roundtrip.csv", io.BytesIO(original_bytes), "text/csv"))],
        )
        doc_id = resp.json()["results"][0]["doc_id"]
    finally:
        app.dependency_overrides.pop(ADM_require_admin, None)

    app.dependency_overrides[ADM_get_current_user_id] = _override_regular
    try:
        file_resp = client.get(f"/kb/documents/{doc_id}/file")
        assert file_resp.content == original_bytes
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(doc_id)


def test_nonexistent_doc_file_route_returns_404():
    app.dependency_overrides[ADM_get_current_user_id] = _override_regular
    try:
        resp = client.get("/kb/documents/kbdoc_does_not_exist/file")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)


def test_document_detail_route_reports_has_native_preview():
    app.dependency_overrides[ADM_require_admin] = _override_admin
    doc_id = None
    try:
        csv_bytes = ("a,b\n" + _unique_content("1,2")).encode("utf-8")
        resp = client.post(
            "/admin/kb/upload",
            data={"kb_type": "modeling", "chunking_strategy": "markdown", "title": "Blob Detail Flag"},
            files=[("files", ("flag.csv", io.BytesIO(csv_bytes), "text/csv"))],
        )
        doc_id = resp.json()["results"][0]["doc_id"]
    finally:
        app.dependency_overrides.pop(ADM_require_admin, None)

    app.dependency_overrides[ADM_get_current_user_id] = _override_regular
    try:
        detail = client.get(f"/kb/documents/{doc_id}").json()
        assert detail["has_native_preview"] is True
        assert detail["original_extension"] == ".csv"
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(doc_id)
