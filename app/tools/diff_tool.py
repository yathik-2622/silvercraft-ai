"""
diff — native tool, TDS §8. Used both at runtime (HITL review diffing an
edit against the original snapshot) and as the CI golden-kit assertion
mechanism (comparing generated output against expected fixtures).
"""
from typing import Any


def ADM_dict_diff(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Shallow-ish structural diff: keys added/removed/changed."""
    added = {k: b[k] for k in b.keys() - a.keys()}
    removed = {k: a[k] for k in a.keys() - b.keys()}
    changed = {
        k: {"before": a[k], "after": b[k]}
        for k in a.keys() & b.keys()
        if a[k] != b[k]
    }
    return {"added": added, "removed": removed, "changed": changed}


def ADM_assert_golden_match(actual: dict[str, Any], expected: dict[str, Any]) -> tuple[bool, dict]:
    diff = ADM_dict_diff(expected, actual)
    passed = not (diff["added"] or diff["removed"] or diff["changed"])
    return passed, diff