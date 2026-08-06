"""
Unit tests for app/tools/skill_normalizer_extract.py — the Phase 6 policy
change from "never invent, omit if absent" to "draft a complete skill
definition, only skill_id/title may be missing" plus workflow-aware
task_list drafting. Run with: pytest

The LLM call itself (ADM_chat_completion_json) is monkeypatched — these
tests verify the module's own contract (missing_fields capping,
task_list validation, catalog-block formatting), not the LLM gateway.
"""
import pytest

import app.tools.skill_normalizer_extract as sne
from app.tools.skill_normalizer_extract import ADM_build_task_catalog_block, ADM_extract_skill_from_text


def test_catalog_block_empty_for_no_catalog():
    assert ADM_build_task_catalog_block(None) == ""
    assert ADM_build_task_catalog_block([]) == ""


def test_catalog_block_lists_skill_id_title_purpose():
    catalog = [{"skill_id": "profile_source", "title": "Profile Source", "purpose": "Compute stats"}]
    block = ADM_build_task_catalog_block(catalog)
    assert "profile_source" in block
    assert "Profile Source" in block
    assert "Compute stats" in block


@pytest.mark.asyncio
async def test_full_draft_with_only_identity_missing(monkeypatch):
    """The core Phase 6 behavior: a well-described single-step skill
    should come back with everything drafted and nothing missing except
    possibly skill_id/title if the source genuinely didn't name them."""
    async def _fake(messages, temperature=0.0):
        return {
            "extracted": {
                "skill_id": "flag_pii_columns", "kind": "task", "title": "Flag PII Columns",
                "purpose": "Identify columns likely to contain PII.", "prompt": "You are a PII classifier...",
                "tools": [], "expected_output": "A list of flagged columns.", "stage": 2, "modeling_style": "canonical",
            },
            "missing_fields": [],
        }
    monkeypatch.setattr(sne, "ADM_chat_completion_json", _fake)
    result = await ADM_extract_skill_from_text("Flag columns that look like PII.")
    assert result["missing_fields"] == []
    assert result["extracted"]["kind"] == "task"


@pytest.mark.asyncio
async def test_missing_fields_capped_to_identity_only(monkeypatch):
    """Even if the LLM (incorrectly, against instructions) reports other
    fields missing, only skill_id/title are allowed to survive into
    missing_fields — everything else must have been drafted."""
    async def _fake(messages, temperature=0.0):
        return {
            "extracted": {"kind": "task", "purpose": "Something."},
            "missing_fields": ["skill_id", "title", "purpose", "prompt"],
        }
    monkeypatch.setattr(sne, "ADM_chat_completion_json", _fake)
    result = await ADM_extract_skill_from_text("Vague description.")
    assert set(result["missing_fields"]) == {"skill_id", "title"}


@pytest.mark.asyncio
async def test_identity_fields_added_to_missing_when_absent_from_extraction(monkeypatch):
    async def _fake(messages, temperature=0.0):
        return {"extracted": {"kind": "task"}, "missing_fields": []}
    monkeypatch.setattr(sne, "ADM_chat_completion_json", _fake)
    result = await ADM_extract_skill_from_text("Some text with no clear name.")
    assert set(result["missing_fields"]) == {"skill_id", "title"}


@pytest.mark.asyncio
async def test_workflow_source_produces_task_list(monkeypatch):
    async def _fake(messages, temperature=0.0):
        return {
            "extracted": {
                "skill_id": "canonical_pipeline", "kind": "workflow", "title": "Canonical Pipeline",
                "purpose": "Run the full canonical modeling pipeline.", "prompt": "Chain the following tasks...",
                "tools": [], "expected_output": "A completed model.", "stage": None, "modeling_style": "canonical",
                "task_list": [
                    {"task_id": "step1", "skill_id": "profile_source", "name": "Profile Source"},
                    {"task_id": "step2", "skill_id": "classify_sensitivity", "name": "Classify Sensitivity"},
                ],
            },
            "missing_fields": [],
        }
    monkeypatch.setattr(sne, "ADM_chat_completion_json", _fake)
    result = await ADM_extract_skill_from_text(
        "First profile the source, then classify sensitivity.",
        task_catalog=[{"skill_id": "profile_source", "title": "Profile Source", "purpose": "..."}],
    )
    assert result["extracted"]["task_list"] == [
        {"task_id": "step1", "skill_id": "profile_source", "name": "Profile Source"},
        {"task_id": "step2", "skill_id": "classify_sensitivity", "name": "Classify Sensitivity"},
    ]
    # Every task_list entry drafted for a step matching an existing catalog
    # skill_id must carry that skill's real title as `name` — this is what
    # lets the Skill Creator UI show a human-readable label instead of a
    # raw skill_id (adm_skills_locked reference format alignment).
    assert all("name" in entry and entry["name"] for entry in result["extracted"]["task_list"])


@pytest.mark.asyncio
async def test_single_task_source_has_no_task_list(monkeypatch):
    async def _fake(messages, temperature=0.0):
        return {
            "extracted": {
                "skill_id": "simple_task", "kind": "task", "title": "Simple Task",
                "purpose": "Do one thing.", "prompt": "...", "tools": [], "expected_output": "...",
                "stage": 1, "modeling_style": "canonical",
            },
            "missing_fields": [],
        }
    monkeypatch.setattr(sne, "ADM_chat_completion_json", _fake)
    result = await ADM_extract_skill_from_text("A single-step task description.")
    assert "task_list" not in result["extracted"]


@pytest.mark.asyncio
async def test_malformed_task_list_is_dropped_not_raised(monkeypatch):
    async def _fake(messages, temperature=0.0):
        return {
            "extracted": {"skill_id": "x", "title": "X", "kind": "workflow", "task_list": "not-a-list"},
            "missing_fields": [],
        }
    monkeypatch.setattr(sne, "ADM_chat_completion_json", _fake)
    result = await ADM_extract_skill_from_text("Malformed response test.")
    assert "task_list" not in result["extracted"]
