"""
Unit tests for the Phase 5 Polars/openpyxl Excel-profiling hybrid
(app/tools/upload_ingestion.py). Run with: pytest

Real in-memory .xlsx fixtures (built with openpyxl, the same library
already used elsewhere in this codebase) — not mocks. The core regression
guard: both engines must produce the SAME contract (keys present, row/
column counts, distinct counts) for the same data, since which engine
runs is an internal size-routing decision the rest of the app must never
be able to observe.
"""
import io
from tempfile import SpooledTemporaryFile

import openpyxl
import pytest

from app.config import ADM_get_settings
from app.tools.upload_ingestion import (
    ADM_extract_excel_metadata,
    ADM_extract_excel_metadata_openpyxl,
    ADM_extract_excel_metadata_polars,
    ADM_extract_source_metadata,
)


def _build_xlsx(rows: list[list]) -> io.BytesIO:
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


_HEADER = ["id", "name", "amount"]
_ROWS = [_HEADER] + [[i, f"name{i}", i * 1.5] for i in range(5)] + [[None, "nameX", None]]


def test_polars_and_openpyxl_produce_the_same_shape_for_identical_data():
    buf = _build_xlsx(_ROWS)
    polars_result = ADM_extract_excel_metadata_polars(buf, "test.xlsx")
    buf.seek(0)
    openpyxl_result = ADM_extract_excel_metadata_openpyxl(buf, "test.xlsx")

    assert polars_result["row_count"] == openpyxl_result["row_count"]
    assert polars_result["column_count"] == openpyxl_result["column_count"]
    assert [c["column_name"] for c in polars_result["columns"]] == [c["column_name"] for c in openpyxl_result["columns"]]

    for pc, oc in zip(polars_result["columns"], openpyxl_result["columns"]):
        assert pc["null_pct"] == oc["null_pct"]
        # The one deliberate exception found and fixed during Phase 5:
        # Polars' n_unique() counts null as its own distinct value by
        # default; openpyxl's ADM_compute_distinct_count never sees nulls
        # at all (only non-null values are collected). drop_nulls() before
        # n_unique() in the Polars path aligns the two — this assertion is
        # the regression guard for that fix.
        assert pc["distinct_count"] == oc["distinct_count"], f"distinct_count mismatch for {pc['column_name']!r}"
        assert ("min_value" in pc) == ("min_value" in oc)


def test_polars_path_never_leaks_forbidden_fields():
    buf = _build_xlsx(_ROWS)
    result = ADM_extract_excel_metadata_polars(buf, "test.xlsx")
    for col in result["columns"]:
        assert "sample_values" not in col
        assert "raw_rows" not in col
        assert "full_column_contents" not in col


def test_openpyxl_path_never_leaks_forbidden_fields():
    buf = _build_xlsx(_ROWS)
    result = ADM_extract_excel_metadata_openpyxl(buf, "test.xlsx")
    for col in result["columns"]:
        assert "sample_values" not in col
        assert "raw_rows" not in col
        assert "full_column_contents" not in col


def test_result_is_natively_json_serializable():
    import json

    buf = _build_xlsx(_ROWS)
    result = ADM_extract_excel_metadata_polars(buf, "test.xlsx")
    json.dumps(result)  # raises if any Polars-native scalar type leaked through


def test_size_threshold_routes_to_polars_for_small_files(monkeypatch):
    calls = {"polars": 0, "openpyxl": 0}

    def _fake_polars(file_obj, filename):
        calls["polars"] += 1
        return {"table_name": "t", "row_count": 0, "column_count": 0, "columns": []}

    def _fake_openpyxl(file_obj, filename):
        calls["openpyxl"] += 1
        return {"table_name": "t", "row_count": 0, "column_count": 0, "columns": []}

    import app.tools.upload_ingestion as ui
    monkeypatch.setattr(ui, "ADM_extract_excel_metadata_polars", _fake_polars)
    monkeypatch.setattr(ui, "ADM_extract_excel_metadata_openpyxl", _fake_openpyxl)

    buf = _build_xlsx(_ROWS)  # tiny — well under the default 25MB threshold
    ADM_extract_excel_metadata(buf, "small.xlsx")
    assert calls == {"polars": 1, "openpyxl": 0}


def test_size_threshold_routes_to_openpyxl_above_threshold(monkeypatch):
    calls = {"polars": 0, "openpyxl": 0}

    def _fake_polars(file_obj, filename):
        calls["polars"] += 1
        return {"table_name": "t", "row_count": 0, "column_count": 0, "columns": []}

    def _fake_openpyxl(file_obj, filename):
        calls["openpyxl"] += 1
        return {"table_name": "t", "row_count": 0, "column_count": 0, "columns": []}

    import app.tools.upload_ingestion as ui
    monkeypatch.setattr(ui, "ADM_extract_excel_metadata_polars", _fake_polars)
    monkeypatch.setattr(ui, "ADM_extract_excel_metadata_openpyxl", _fake_openpyxl)
    # Force the threshold well below this tiny fixture's actual size so the
    # "large file" branch is exercised without needing to build a real 25MB+ fixture.
    ADM_get_settings().EXCEL_POLARS_MAX_MB = 0.0

    try:
        buf = _build_xlsx(_ROWS)
        ADM_extract_excel_metadata(buf, "big.xlsx")
        assert calls == {"polars": 0, "openpyxl": 1}
    finally:
        ADM_get_settings().EXCEL_POLARS_MAX_MB = 25.0


def test_dispatch_from_extract_source_metadata_still_works_end_to_end():
    buf = _build_xlsx(_ROWS)
    result = ADM_extract_source_metadata(buf, "customers.xlsx")
    assert result["table_name"] == "customers"
    assert result["row_count"] == 6
    assert result["column_count"] == 3


def test_polars_path_works_against_a_real_spooled_temp_file():
    """Regression guard for a real bug found live: an isolated io.BytesIO
    fixture passes pl.read_excel's internal source-type check, but
    FastAPI's actual UploadFile.file (a SpooledTemporaryFile) does not —
    it fails deep inside the fastexcel/Rust binding with "source must be a
    string or bytes". This test uses the real type production traffic
    hits, not the BytesIO shortcut every other test in this file uses."""
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in _ROWS:
        ws.append(row)
    raw_buf = io.BytesIO()
    wb.save(raw_buf)

    spooled = SpooledTemporaryFile()
    spooled.write(raw_buf.getvalue())
    spooled.seek(0)

    result = ADM_extract_excel_metadata_polars(spooled, "customers.xlsx")
    assert result["row_count"] == 6
    assert result["column_count"] == 3
