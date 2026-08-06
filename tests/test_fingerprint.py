"""
Unit tests for app/core/fingerprint.py::ADM_content_hash — the Phase 4
dedupe key for admin KB uploads. Run with: pytest

Pure function, no DB/LLM call needed.
"""
from app.core.fingerprint import ADM_content_hash


def test_identical_text_hashes_identically():
    a = ADM_content_hash("Some modeling reference text.")
    b = ADM_content_hash("Some modeling reference text.")
    assert a == b


def test_different_text_hashes_differently():
    a = ADM_content_hash("Some modeling reference text.")
    b = ADM_content_hash("A completely different document.")
    assert a != b


def test_whitespace_only_differences_hash_identically():
    """Two re-exports of the same doc that differ only in line-endings/
    extra blank lines/leading-trailing whitespace must dedupe as the
    same document — same normalization rationale as hckb_core_fingerprint.py."""
    a = ADM_content_hash("Line one.\nLine two.\n\nLine three.")
    b = ADM_content_hash("Line one.\r\n\r\nLine two.\n\n\nLine three.   ")
    assert a == b


def test_result_is_a_self_describing_string():
    h = ADM_content_hash("Some text.")
    assert h.startswith("sha256:")
    assert len(h) == len("sha256:") + 64  # SHA-256 hex digest is 64 chars


def test_empty_and_none_like_input_does_not_raise():
    assert ADM_content_hash("").startswith("sha256:")
    assert ADM_content_hash("   ").startswith("sha256:")
