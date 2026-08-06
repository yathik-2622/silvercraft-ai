"""
Unit tests for app/tools/kb_metadata.py::ADM_generate_document_metadata —
the Phase 3 one-per-document LLM summary/keywords call. Run with: pytest

The LLM call itself (ADM_chat_completion_json) is monkeypatched — this
tests the function's own contract (empty-input short-circuit, result
shape normalization, best-effort failure handling), not the LLM gateway.
"""
import pytest

import app.tools.kb_metadata as kb_metadata


async def _fake_llm_ok(messages, temperature=0.0):
    return {"summary": "Covers canonical modeling conventions.", "keywords": ["canonical", "3NF", "keys"]}


async def _fake_llm_malformed(messages, temperature=0.0):
    return {"summary": 123, "keywords": "not-a-list"}


async def _fake_llm_raises(messages, temperature=0.0):
    raise RuntimeError("gateway unreachable")


@pytest.mark.asyncio
async def test_empty_text_short_circuits_without_calling_llm(monkeypatch):
    called = {"count": 0}

    async def _should_not_be_called(*a, **kw):
        called["count"] += 1
        return {}

    monkeypatch.setattr(kb_metadata, "ADM_chat_completion_json", _should_not_be_called)
    result = await kb_metadata.ADM_generate_document_metadata("   ")
    assert result == {"summary": "", "keywords": []}
    assert called["count"] == 0


@pytest.mark.asyncio
async def test_real_looking_response_is_passed_through(monkeypatch):
    monkeypatch.setattr(kb_metadata, "ADM_chat_completion_json", _fake_llm_ok)
    result = await kb_metadata.ADM_generate_document_metadata("Some modeling reference text.")
    assert result["summary"] == "Covers canonical modeling conventions."
    assert result["keywords"] == ["canonical", "3NF", "keys"]


@pytest.mark.asyncio
async def test_malformed_response_normalizes_to_safe_shape(monkeypatch):
    monkeypatch.setattr(kb_metadata, "ADM_chat_completion_json", _fake_llm_malformed)
    result = await kb_metadata.ADM_generate_document_metadata("Some text.")
    assert result["summary"] == ""  # non-string summary discarded, not crashed on
    assert result["keywords"] == []  # non-list keywords discarded


@pytest.mark.asyncio
async def test_keywords_capped_at_eight(monkeypatch):
    async def _many_keywords(messages, temperature=0.0):
        return {"summary": "ok", "keywords": [f"kw{i}" for i in range(20)]}

    monkeypatch.setattr(kb_metadata, "ADM_chat_completion_json", _many_keywords)
    result = await kb_metadata.ADM_generate_document_metadata("Some text.")
    assert len(result["keywords"]) == 8


@pytest.mark.asyncio
async def test_llm_exception_degrades_to_empty_not_raised(monkeypatch):
    monkeypatch.setattr(kb_metadata, "ADM_chat_completion_json", _fake_llm_raises)
    result = await kb_metadata.ADM_generate_document_metadata("Some text.")
    assert result == {"summary": "", "keywords": []}


@pytest.mark.asyncio
async def test_sample_is_truncated_to_max_chars(monkeypatch):
    seen = {}

    async def _capture(messages, temperature=0.0):
        seen["user_content"] = messages[1]["content"]
        return {"summary": "ok", "keywords": []}

    monkeypatch.setattr(kb_metadata, "ADM_chat_completion_json", _capture)
    await kb_metadata.ADM_generate_document_metadata("x" * 1000, max_chars=100)
    assert len(seen["user_content"]) == 100
