"""
Unit tests for ADM_summarize_attached_files — the Phase 1 fix that gives
Tier 0 conversational answers awareness of a chat-attached file's schema
(previously only Tier 3 execution ever read file_refs content; Tier 0
ignored it entirely). Run with: pytest

Real Mongo raw_files documents (via ADM_get_db directly), following the
same ADM_reset_mongo_client()-before-every-asyncio.run() pattern as
tests/test_business_standards_routes.py (Motor's cached client stays bound
to whichever event loop was active when first used; each fresh
asyncio.run() spins and tears down its own loop).
"""
import asyncio

from app.agents.context_builder import ADM_summarize_attached_files
from app.db.collections import ADM_COLLECTION_RAW_FILES
from app.db.mongo_client import ADM_get_db, ADM_reset_mongo_client
from app.models.schemas import ADM_new_id


def _insert_raw_file(**overrides):
    async def _create():
        db = ADM_get_db()
        raw_file_id = ADM_new_id("rawfile")
        doc = {
            "raw_file_id": raw_file_id,
            "table_name": "customers.csv",
            "row_count": 5,
            "column_count": 2,
            "columns": [
                {"column_name": "customer_id", "dtype": "String"},
                {"column_name": "email", "dtype": "String"},
            ],
        }
        doc.update(overrides)
        await db[ADM_COLLECTION_RAW_FILES].insert_one(doc)
        return raw_file_id

    ADM_reset_mongo_client()
    return asyncio.run(_create())


def _delete_raw_file(raw_file_id):
    async def _cleanup():
        db = ADM_get_db()
        await db[ADM_COLLECTION_RAW_FILES].delete_one({"raw_file_id": raw_file_id})

    ADM_reset_mongo_client()
    asyncio.run(_cleanup())


def test_empty_file_refs_returns_empty_string():
    ADM_reset_mongo_client()
    assert asyncio.run(ADM_summarize_attached_files([])) == ""


def test_resolves_and_formats_a_real_raw_file():
    raw_file_id = _insert_raw_file()
    try:
        ADM_reset_mongo_client()
        summary = asyncio.run(ADM_summarize_attached_files([{"raw_file_id": raw_file_id}]))
        assert "customers.csv" in summary
        assert "5 rows" in summary
        assert "customer_id (String)" in summary
        assert "email (String)" in summary
    finally:
        _delete_raw_file(raw_file_id)


def test_multiple_files_produce_one_line_each():
    id_a = _insert_raw_file(table_name="a.csv")
    id_b = _insert_raw_file(table_name="b.csv")
    try:
        ADM_reset_mongo_client()
        summary = asyncio.run(
            ADM_summarize_attached_files([{"raw_file_id": id_a}, {"raw_file_id": id_b}])
        )
        lines = summary.split("\n")
        assert len(lines) == 2
        assert any("a.csv" in line for line in lines)
        assert any("b.csv" in line for line in lines)
    finally:
        _delete_raw_file(id_a)
        _delete_raw_file(id_b)


def test_stale_raw_file_id_is_skipped_not_raised():
    ADM_reset_mongo_client()
    summary = asyncio.run(ADM_summarize_attached_files([{"raw_file_id": "rawfile_does_not_exist"}]))
    assert summary == ""


def test_db_connection_only_ref_is_ignored():
    """file_refs also carries db_connection_id entries (a different source
    kind) — those have no raw_files doc to resolve and must not raise."""
    ADM_reset_mongo_client()
    summary = asyncio.run(ADM_summarize_attached_files([{"db_connection_id": "conn_1"}]))
    assert summary == ""
