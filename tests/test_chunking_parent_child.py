"""
Unit tests for the Phase 3 "parent_child" chunking strategy
(app/core/chunking.py::ADM_chunk_parent_child) — two-tier "small-to-big"
chunking, children get embedded/matched, parents give the LLM full
context. Run with: pytest

Real multi-paragraph text, not mocks — this is a pure function over a
string, no LLM/DB call needed.
"""
from app.core.chunking import ADM_chunk_text_with_offsets, ADM_CHUNKING_STRATEGIES

# ~6 paragraphs of real prose, long enough to force multiple parents (each
# ~2000 chars) and multiple children per parent (each ~400 chars).
_PARAGRAPH = (
    "A canonical data model represents business entities in third normal "
    "form, minimizing redundancy and ensuring each fact is stored exactly "
    "once. This differs from a dimensional model, which deliberately "
    "denormalizes for query performance in analytical workloads. "
)
LONG_TEXT = "\n\n".join(f"Section {i}. {_PARAGRAPH * 3}" for i in range(12))


def test_parent_child_is_a_registered_strategy():
    assert "parent_child" in ADM_CHUNKING_STRATEGIES


def test_produces_multiple_children_across_multiple_parents():
    chunks = ADM_chunk_text_with_offsets(LONG_TEXT, strategy="parent_child")
    assert len(chunks) > 1
    parent_indices = {c["parent_chunk_index"] for c in chunks}
    assert len(parent_indices) > 1, "expected the long fixture to span multiple parents"


def test_every_child_carries_parent_metadata():
    chunks = ADM_chunk_text_with_offsets(LONG_TEXT, strategy="parent_child")
    for c in chunks:
        assert "parent_chunk_index" in c
        assert "parent_content" in c
        assert c["content"] in c["parent_content"], "a child's text must be a substring of its own parent's text"


def test_child_offsets_resolve_correctly_against_original_text():
    chunks = ADM_chunk_text_with_offsets(LONG_TEXT, strategy="parent_child")
    for c in chunks:
        assert LONG_TEXT[c["char_start"]:c["char_end"]] == c["content"]


def test_children_are_sequentially_indexed():
    chunks = ADM_chunk_text_with_offsets(LONG_TEXT, strategy="parent_child")
    assert [c["chunk_index"] for c in chunks] == list(range(len(chunks)))


def test_children_smaller_than_parents_on_average():
    chunks = ADM_chunk_text_with_offsets(LONG_TEXT, strategy="parent_child")
    parents_by_index = {c["parent_chunk_index"]: c["parent_content"] for c in chunks}
    avg_child_len = sum(len(c["content"]) for c in chunks) / len(chunks)
    avg_parent_len = sum(len(p) for p in parents_by_index.values()) / len(parents_by_index)
    assert avg_child_len < avg_parent_len


def test_empty_text_returns_empty_list():
    assert ADM_chunk_text_with_offsets("", strategy="parent_child") == []
    assert ADM_chunk_text_with_offsets("   ", strategy="parent_child") == []


def test_short_text_produces_one_parent_and_at_least_one_child():
    chunks = ADM_chunk_text_with_offsets("A single short sentence about data modeling.", strategy="parent_child")
    assert len(chunks) >= 1
    assert {c["parent_chunk_index"] for c in chunks} == {0}
