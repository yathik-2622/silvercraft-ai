"""
TDS §3 — Data Handling & Privacy Policy, enforced in code.

Core rule: no user source data (file bytes or literal values) is ever
persisted. Only structural + aggregate metadata. This module holds the
shared guardrails every tool in app/tools/ must go through so the rule
lives in one place instead of being re-implemented per tool.
"""
from typing import Any

# Fields that are legal to persist (see TDS §3.2 table).
ADM_STRUCTURAL_FIELDS = {"table_name", "column_name", "dtype", "row_count", "column_count"}
ADM_AGGREGATE_STAT_FIELDS = {"null_pct", "distinct_count"}
ADM_VALUE_DERIVED_FLAGGED_FIELDS = {"min_value", "max_value"}  # persisted by default this cut, flagged
ADM_FORBIDDEN_FIELDS = {"sample_values", "raw_rows", "full_column_contents"}


def ADM_assert_no_literal_values(payload: dict[str, Any]) -> None:
    """
    Defensive check called before anything is written to Mongo from a
    Stage 1 tool. Raises if a forbidden literal-value field slipped in.
    """
    offending = ADM_FORBIDDEN_FIELDS.intersection(payload.keys())
    if offending:
        raise ValueError(
            f"ADM privacy policy violation: attempted to persist literal-value "
            f"field(s) {offending}. Only structural/aggregate metadata may be stored "
            f"(TDS §3.2)."
        )


def ADM_strip_forbidden_fields(payload: dict[str, Any]) -> dict[str, Any]:
    """Belt-and-braces sanitizer — drops any forbidden field rather than raising."""
    return {k: v for k, v in payload.items() if k not in ADM_FORBIDDEN_FIELDS}


def ADM_mark_value_derived_flagged(stat_payload: dict[str, Any]) -> dict[str, Any]:
    """
    Tags min/max as a flagged policy decision per TDS §3.2, so the
    provenance report and data dictionary can surface the caveat rather
    than silently treating them like pure aggregates.
    """
    out = dict(stat_payload)
    for field in ADM_VALUE_DERIVED_FLAGGED_FIELDS:
        if field in out:
            out.setdefault("_policy_flags", []).append(
                f"{field} is value-derived (an actual source value), persisted by default this cut"
            )
    return out