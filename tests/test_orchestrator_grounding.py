"""
Unit tests for ADM_has_confident_kb_grounding — decides whether retrieved
KB material is trustworthy enough to present as cited context (NOT the
Tier 0 refuse/answer gate — that's is_platform_relevant, a topic check
produced by the intent-classification LLM call, not a pure function, so
it's exercised live/via browser instead). Run with: pytest

Pure function, no LLM/DB call needed — same style as
tests/test_orchestrator_followups.py.
"""
from app.graphs.orchestrator_graph import ADM_has_confident_kb_grounding


def test_empty_hits_and_no_files_is_not_confident():
    assert ADM_has_confident_kb_grounding([], []) is False
    assert ADM_has_confident_kb_grounding([], None) is False


def test_hit_below_threshold_is_not_confident():
    hits = [{"_score": 0.3}, {"_score": 0.45}]
    assert ADM_has_confident_kb_grounding(hits, []) is False


def test_hit_above_threshold_is_confident():
    hits = [{"_score": 0.3}, {"_score": 0.75}]
    assert ADM_has_confident_kb_grounding(hits, []) is True


def test_hit_exactly_at_threshold_is_confident():
    hits = [{"_score": 0.6}]
    assert ADM_has_confident_kb_grounding(hits, [], min_score=0.6) is True


def test_attached_file_is_confident_even_with_zero_kb_hits():
    assert ADM_has_confident_kb_grounding([], [{"raw_file_id": "rawfile_1"}]) is True


def test_attached_file_is_confident_even_when_kb_hits_are_all_below_threshold():
    hits = [{"_score": 0.1}]
    assert ADM_has_confident_kb_grounding(hits, [{"raw_file_id": "rawfile_1"}]) is True


def test_custom_threshold_is_respected():
    hits = [{"_score": 0.5}]
    assert ADM_has_confident_kb_grounding(hits, [], min_score=0.4) is True
    assert ADM_has_confident_kb_grounding(hits, [], min_score=0.55) is False


def test_missing_score_key_treated_as_zero_not_raised():
    hits = [{"title": "no score field at all"}]
    assert ADM_has_confident_kb_grounding(hits, []) is False
