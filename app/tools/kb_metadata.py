"""
kb_metadata — one-per-DOCUMENT (not per-chunk) LLM metadata call for the
admin KB ingestion pipeline, mirroring hckb_core_metadata_extractor.py's
"analyze once, not once-per-chunk" design (keeps ingestion cost bounded
regardless of chunk_count). Produces a short summary + keyword list,
stored once on the ADM_KbDocument and surfaced via each chunk's citation
(source_doc_id) — not duplicated onto every chunk row.

Unlike hckb's version, this doesn't also recommend a chunk
strategy/embedding model back to the UI — admin already picks the
strategy explicitly at upload time (app/api/routes_admin.py), so that
half of hckb's prompt has no counterpart here.
"""
import logging

from app.llm.client import ADM_chat_completion_json

logger = logging.getLogger(__name__)

ADM_KB_METADATA_SYSTEM_PROMPT = """You summarize a modeling-reference document for a data modeling platform's knowledge base.
Given a sample of the document's text, return STRICT JSON:
{"summary": "<1-3 sentence summary of what this document covers>", "keywords": ["<up to 8 short topical keywords>"]}
No other text, no markdown fences. If the text is empty or unintelligible, return {"summary": "", "keywords": []}.
"""


async def ADM_generate_document_metadata(text: str, max_chars: int = 6000) -> dict:
    """
    Best-effort — never allowed to fail the whole ingestion run over a
    summary. Returns {"summary": "", "keywords": []} on any error, same
    "degrade, don't crash" convention as hckb_core_metadata_extractor.py's
    suggest_metadata (which returns {} on any exception).
    """
    sample = (text or "").strip()[:max_chars]
    if not sample:
        return {"summary": "", "keywords": []}
    try:
        result = await ADM_chat_completion_json(
            [{"role": "system", "content": ADM_KB_METADATA_SYSTEM_PROMPT}, {"role": "user", "content": sample}],
            temperature=0.0,
        )
        summary = result.get("summary", "") if isinstance(result, dict) else ""
        keywords = result.get("keywords", []) if isinstance(result, dict) else []
        # A malformed non-list (e.g. a raw string) must not silently pass
        # through — iterating a str yields its individual characters,
        # each of which IS itself a str, so the isinstance filter below
        # would wrongly accept it one character at a time without this guard.
        keywords = [k for k in keywords if isinstance(k, str)][:8] if isinstance(keywords, list) else []
        return {"summary": summary if isinstance(summary, str) else "", "keywords": keywords}
    except Exception:
        logger.warning("ADM_generate_document_metadata failed — degrading to empty summary/keywords", exc_info=True)
        return {"summary": "", "keywords": []}
