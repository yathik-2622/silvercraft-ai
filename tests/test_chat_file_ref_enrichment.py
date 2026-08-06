"""
Unit tests for app/api/routes_chats.py::ADM__enrich_file_refs_for_display
— the Phase 4 backend piece that lets a sent chat message's file
attachment survive a page reload as a real "file attached" card (previously
only the bare {raw_file_id} pointer was ever persisted, with no
filename/row_count to render). Run with: pytest

Real Mongo raw_files documents (via ADM_get_db directly), following the
same ADM_reset_mongo_client()-per-call pattern established in
tests/test_tier0_file_context.py / test_business_standards_routes.py.
"""
import asyncio

from app.api.routes_chats import ADM__enrich_file_refs_for_display
from app.db.collections import ADM_COLLECTION_RAW_FILES
from app.db.mongo_client import ADM_get_db, ADM_reset_mongo_client
from app.models.schemas import ADM_new_id


def _insert_raw_file(**overrides):
    async def _create():
        db = ADM_get_db()
        raw_file_id = ADM_new_id("rawfile")
        doc = {"raw_file_id": raw_file_id, "original_filename": "orders.csv", "table_name": "orders", "row_count": 12}
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


def test_empty_file_refs_returns_empty_list():
    ADM_reset_mongo_client()
    db = ADM_get_db()
    result = asyncio.run(ADM__enrich_file_refs_for_display(db, []))
    assert result == []


def test_real_ref_gets_filename_and_row_count():
    raw_file_id = _insert_raw_file(original_filename="customers.csv", row_count=5)
    try:
        ADM_reset_mongo_client()
        db = ADM_get_db()
        result = asyncio.run(ADM__enrich_file_refs_for_display(db, [{"raw_file_id": raw_file_id}]))
        assert result[0]["raw_file_id"] == raw_file_id
        assert result[0]["original_filename"] == "customers.csv"
        assert result[0]["row_count"] == 5
    finally:
        _delete_raw_file(raw_file_id)


def test_stale_raw_file_id_degrades_to_bare_ref_not_raised():
    ADM_reset_mongo_client()
    db = ADM_get_db()
    result = asyncio.run(ADM__enrich_file_refs_for_display(db, [{"raw_file_id": "rawfile_does_not_exist"}]))
    assert result == [{"raw_file_id": "rawfile_does_not_exist"}]


def test_db_connection_only_ref_passed_through_unchanged():
    ADM_reset_mongo_client()
    db = ADM_get_db()
    result = asyncio.run(ADM__enrich_file_refs_for_display(db, [{"db_connection_id": "conn_1"}]))
    assert result == [{"db_connection_id": "conn_1"}]


def test_multiple_refs_each_enriched_independently():
    id_a = _insert_raw_file(original_filename="a.csv", row_count=1)
    id_b = _insert_raw_file(original_filename="b.csv", row_count=2)
    try:
        ADM_reset_mongo_client()
        db = ADM_get_db()
        result = asyncio.run(ADM__enrich_file_refs_for_display(db, [{"raw_file_id": id_a}, {"raw_file_id": id_b}]))
        assert result[0]["original_filename"] == "a.csv"
        assert result[1]["original_filename"] == "b.csv"
    finally:
        _delete_raw_file(id_a)
        _delete_raw_file(id_b)
