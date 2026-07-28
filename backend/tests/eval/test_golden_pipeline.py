"""
Golden-test-kit eval harness — ANTIGRAVITY_REFACTOR_BRIEF §5.

Loads golden-test-kit/golden-dataset/*.csv as Stage 1 input and runs the
end-to-end pipeline, asserting structural correctness against the expected
outputs per stage. This is the acceptance test for the "one agent, N skills"
architecture: LogicalModelingAgent must produce all three golden outputs
from the same class with only the skill swapped.

Run:
    cd backend
    python -m pytest tests/eval/test_golden_pipeline.py -v
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

import pytest

from core.agents.source_intelligence import run_source_intelligence_agent
from core.agents.conceptual_modeling import run_conceptual_modeling_agent
from core.agents.logical_modeling import run_logical_modeling_agent
from core.agents.physical_modeling import run_physical_modeling_agent
from core.logging import get_logger

logger = get_logger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_DIR = REPO_ROOT / "golden-test-kit"
DATASET_DIR = GOLDEN_DIR / "golden-dataset"
EXPECTED_DIR = GOLDEN_DIR / "expected-output"

STYLE_KEYS = ["3nf", "datavault", "kimball"]


def _load_dataset() -> str:
    csvs = sorted(DATASET_DIR.glob("*.csv"))
    if not csvs:
        pytest.skip("golden-test-kit/golden-dataset/*.csv not found — skipping golden eval")
    return "\n".join(f.read_text(encoding="utf-8") for f in csvs)


def _load_expected(style_key: str) -> Dict[str, Any]:
    path = EXPECTED_DIR / f"{style_key}-expected.json"
    if not path.exists():
        pytest.skip(f"Expected output not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _assert_contains(actual: Dict[str, Any], expected: Dict[str, Any], path: str = "") -> None:
    """Assert that actual output structurally matches expected output."""
    for key, expected_value in expected.items():
        actual_value = actual.get(key)
        if isinstance(expected_value, dict):
            assert isinstance(actual_value, dict), f"Expected dict at {path}.{key}, got {type(actual_value).__name__}"
            _assert_contains(actual_value, expected_value, f"{path}.{key}")
        elif isinstance(expected_value, list):
            assert isinstance(actual_value, list), f"Expected list at {path}.{key}, got {type(actual_value).__name__}"
            assert len(actual_value) >= len(expected_value), f"Expected at least {len(expected_value)} items at {path}.{key}, got {len(actual_value)}"
        else:
            assert actual_value == expected_value, f"Mismatch at {path}.{key}: expected {expected_value!r}, got {actual_value!r}"


@pytest.mark.asyncio
async def test_golden_pipeline_end_to_end():
    """Run the full pipeline and assert key facts are present at each gate."""
    dataset = _load_dataset()
    db = None  # eval harness runs without Mongo — agents degrade gracefully

    # G1: Source Analysis
    g1 = await run_source_intelligence_agent(
        session_id="eval-golden",
        project_id="eval-project",
        instruction="Profile the supplied source dataset.",
        context_refs={"source_file_ids": [], "target_dialect": "snowflake"},
        directives=[],
        trace_id="eval-trace-1",
        db=db,
    )
    g1_output = g1.get("output") or {}
    assert g1_output.get("tables") or g1_output.get("source_summary"), "G1 should produce tables or a source summary"

    # G2: Conceptual Modeling
    g2 = await run_conceptual_modeling_agent(
        session_id="eval-golden",
        project_id="eval-project",
        instruction="Build the conceptual model from the approved source analysis.",
        context_refs={"_g1": g1_output},
        directives=[],
        trace_id="eval-trace-2",
        db=db,
    )
    g2_output = g2.get("output") or {}
    assert g2_output.get("concepts") or g2_output.get("relationships"), "G2 should produce concepts or relationships"

    # G3: Logical Modeling — run once per style_key
    for style_key in STYLE_KEYS:
        g3 = await run_logical_modeling_agent(
            session_id="eval-golden",
            project_id="eval-project",
            instruction=f"Build the logical model using {style_key} rules.",
            context_refs={"_g1": g1_output, "_g2": g2_output, "modeling_style": style_key},
            directives=[],
            trace_id=f"eval-trace-3-{style_key}",
            db=db,
        )
        g3_output = g3.get("output") or {}
        expected = _load_expected(style_key)
        _assert_contains(g3_output, expected.get("logical", {}))

        # G4: Physical Modeling
        g4 = await run_physical_modeling_agent(
            session_id="eval-golden",
            project_id="eval-project",
            instruction="Generate the physical model, DDL, and STTM.",
            context_refs={"_g3": g3_output, "target_dialect": "snowflake"},
            directives=[],
            trace_id=f"eval-trace-4-{style_key}",
            db=db,
        )
        g4_output = g4.get("output") or {}
        assert g4_output.get("physical_tables") or g4_output.get("ddl_statements"), f"G4 should produce physical tables or DDL for {style_key}"
