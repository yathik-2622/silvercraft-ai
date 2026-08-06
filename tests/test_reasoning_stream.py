"""
Unit tests for the reasoning-stream log summarizer. Run with: pytest

Covers the exact bug that motivated it: a TaskWorker's real output (the
{"output": ..., "confidence": ...} envelope) must never leak into the
reasoning log as raw JSON — only a short, human-readable summary. The
structured value itself travels through ADM_stream_artifact instead, not
through this text-log path.
"""
from app.core.reasoning_stream import ADM_summarize_for_log

PROFILE_SOURCE_OUTPUT = {
    "output": [
        {
            "table_name": "customers.csv", "row_count": 5, "column_count": 6,
            "columns": [{"column_name": "customer_id", "dtype": "String", "null_pct": 0.0,
                         "distinct_count": 5, "anomalies": []}],
        }
    ],
    "confidence": 1.0,
}

CLASSIFY_SENSITIVITY_OUTPUT = {
    "output": [{"column_name": "email", "sensitivity": "PII", "rationale": "..."}],
    "confidence": 0.95,
}

GENERATE_DDL_OUTPUT = {
    "output": {
        "tables": [
            {
                "table_name": "customers",
                "columns": [{"column_name": "customer_id", "dtype": "STRING", "flags": ["Primary key"]}],
                "primary_key": ["customer_id"], "foreign_keys": [],
            }
        ]
    },
    "confidence": 1.0,
}


def test_task_envelope_with_list_output_summarizes_row_count():
    summary = ADM_summarize_for_log(PROFILE_SOURCE_OUTPUT)
    assert summary == "confidence=1.00, 1 row(s)"


def test_task_envelope_with_dict_output_summarizes_field_count():
    summary = ADM_summarize_for_log(GENERATE_DDL_OUTPUT)
    assert summary == "confidence=1.00, 1 field(s)"


def test_task_envelope_never_leaks_raw_json():
    for envelope in (PROFILE_SOURCE_OUTPUT, CLASSIFY_SENSITIVITY_OUTPUT, GENERATE_DDL_OUTPUT):
        summary = ADM_summarize_for_log(envelope)
        assert "column_name" not in summary
        assert "{" not in summary
        assert len(summary) < 60


def test_plain_string_is_capped_at_max_len():
    long_text = "x" * 500
    summary = ADM_summarize_for_log(long_text, max_len=150)
    assert len(summary) == 151  # 150 chars + the ellipsis marker
    assert summary.endswith("…")


def test_short_string_is_returned_unchanged():
    assert ADM_summarize_for_log("short line") == "short line"


def test_non_envelope_dict_falls_back_to_capped_str():
    summary = ADM_summarize_for_log({"input": "some tool arg"}, max_len=150)
    assert len(summary) <= 151
    assert "input" in summary  # falls back to str(), just capped — not the structured-summary path


def test_confidence_as_string_does_not_crash():
    summary = ADM_summarize_for_log({"output": [], "confidence": "n/a"})
    assert summary == "confidence=n/a, 0 row(s)"
