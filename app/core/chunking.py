"""
Chunking — the admin KB ingestion pipeline's text-splitting step.

Multiple named strategies, mirroring db-modernization-agent's
`hckb_core_chunking.py` shape (name -> description, so a UI can populate a
dropdown from ADM_CHUNKING_STRATEGIES directly), all built on LangChain's
real splitters rather than the reference's hand-rolled fallback. One real
addition on top of that reference: none of its strategies tracked
character offsets, so "highlight the exact chunk within the full document"
wasn't actually possible from its output. Every strategy here goes through
the same offset-tracking wrapper, so whichever one the admin picks, the
citation-highlighting contract stays the same.
"""
import logging

from langchain_text_splitters import RecursiveCharacterTextSplitter, MarkdownTextSplitter, TokenTextSplitter

from app.config import ADM_get_settings

logger = logging.getLogger(__name__)

ADM_CHUNKING_STRATEGIES = {
    "markdown": "Markdown-aware — splits on headings first, then paragraphs. Best default for modeling reference docs.",
    "recursive": "General-purpose recursive splitter — paragraph, then sentence, then word boundaries. Good for plain text/Word docs.",
    "sliding_window": "Fixed-size token window with overlap — most predictable chunk size, best for very uniform/dense text.",
    "page_aware": "Groups content by page/slide boundary where the source format has one (PDF, PPTX) before falling back to size-based splitting.",
    "parent_child": "Two-tier — large parent chunks carry full context to the LLM, small child chunks are what gets embedded/matched on. Best for long, dense documents where a single chunk size trades off recall against context.",
}

# Child chunks are what gets embedded/matched (small -> precise retrieval);
# parent chunks are what the LLM actually sees once a child matches (large
# -> full context) — the "index small, return big" pattern from 2026 RAG
# best practice (LangChain's ParentDocumentRetriever). Sized in this
# codebase's existing character-based convention (KB_CHUNK_SIZE=1500 is
# roughly mid-way between these two tiers).
ADM_PARENT_CHUNK_SIZE = 2000
ADM_PARENT_CHUNK_OVERLAP = 200
ADM_CHILD_CHUNK_SIZE = 400
ADM_CHILD_CHUNK_OVERLAP = 50


def ADM_chunk_text_with_offsets(
    text: str, strategy: str = "markdown", chunk_size: int | None = None, chunk_overlap: int | None = None,
) -> list[dict]:
    """
    Returns [{chunk_index, content, char_start, char_end}, ...] — offsets
    are positions within the ORIGINAL `text`, computed by searching forward
    from the end of the previous chunk (accounts for overlap correctly,
    since search always starts before the overlap region, never after it).
    Unknown strategy names fall back to "markdown" rather than raising —
    an admin picking from the dropdown can never hit a 500 for this.
    """
    settings = ADM_get_settings()
    size = chunk_size or settings.KB_CHUNK_SIZE
    overlap = chunk_overlap or settings.KB_CHUNK_OVERLAP

    if not text or not text.strip():
        return []

    if strategy == "parent_child":
        chunks = ADM_chunk_parent_child(text)
        logger.info("Chunked text: strategy=parent_child children=%d chars=%d", len(chunks), len(text))
        return chunks

    raw_chunks = ADM_split_by_strategy(text, strategy, size, overlap)
    chunks = ADM_attach_offsets(text, raw_chunks, overlap)
    logger.info("Chunked text: strategy=%s chunks=%d chars=%d", strategy, len(chunks), len(text))
    return chunks


def ADM_chunk_parent_child(text: str) -> list[dict]:
    """
    Two-tier "small-to-big" chunking. Parents are split first (large, for
    LLM context) and offset-tracked the normal way via ADM_attach_offsets;
    each parent is then re-split into children (small, what actually gets
    embedded). Returns one dict PER CHILD — citation highlighting still
    works unchanged (each child's char_start/char_end are real offsets
    into the ORIGINAL text, computed relative to its parent's already-
    known offset), plus two extra fields every other strategy's output
    doesn't have: parent_chunk_index (which parent this child belongs to)
    and parent_content (the parent's full text, for retrieval-time context
    expansion — see app/db/vector_search.py::ADM_upsert_modeling_reference_chunks).
    """
    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=ADM_PARENT_CHUNK_SIZE, chunk_overlap=ADM_PARENT_CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    parents = ADM_attach_offsets(text, parent_splitter.split_text(text), ADM_PARENT_CHUNK_OVERLAP)

    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=ADM_CHILD_CHUNK_SIZE, chunk_overlap=ADM_CHILD_CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    children: list[dict] = []
    for parent in parents:
        child_texts = child_splitter.split_text(parent["content"]) or [parent["content"]]
        search_from = 0
        for child_text in child_texts:
            offset_in_parent = parent["content"].find(child_text, search_from)
            if offset_in_parent == -1:
                offset_in_parent = search_from  # same normalized-whitespace fallback as ADM_attach_offsets
            char_start = parent["char_start"] + offset_in_parent
            char_end = char_start + len(child_text)
            children.append({
                "chunk_index": len(children),
                "content": child_text,
                "char_start": char_start,
                "char_end": char_end,
                "parent_chunk_index": parent["chunk_index"],
                "parent_content": parent["content"],
            })
            search_from = max(0, offset_in_parent + len(child_text) - ADM_CHILD_CHUNK_OVERLAP)
    return children


def ADM_split_by_strategy(text: str, strategy: str, size: int, overlap: int) -> list[str]:
    if strategy == "sliding_window":
        # TokenTextSplitter needs `tiktoken` (a langchain-openai dependency,
        # already installed) — chunk_size here is tokens, not characters.
        splitter = TokenTextSplitter(encoding_name="cl100k_base", chunk_size=max(1, size // 4), chunk_overlap=max(0, overlap // 4))
        return splitter.split_text(text)

    if strategy == "page_aware":
        # Form-feed (\f) is what pypdf/python-pptx page/slide extraction in
        # this codebase joins pages/slides with (see document_text_extract.py)
        if "\f" in text:
            pages = [p.strip() for p in text.split("\f") if p.strip()]
            groups, current = [], ""
            for page in pages:
                if len(current) + len(page) > size and current:
                    groups.append(current)
                    current = page
                else:
                    current = f"{current}\n\n{page}" if current else page
            if current:
                groups.append(current)
            return groups
        # No page markers in this text — fall through to recursive.
        strategy = "recursive"

    if strategy == "recursive":
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=size, chunk_overlap=overlap, separators=["\n\n", "\n", ". ", " ", ""]
        )
        return splitter.split_text(text)

    # Default / "markdown"
    splitter = MarkdownTextSplitter(chunk_size=size, chunk_overlap=overlap)
    return splitter.split_text(text)


def ADM_attach_offsets(text: str, raw_chunks: list[str], overlap: int) -> list[dict]:
    chunks: list[dict] = []
    search_from = 0
    for i, chunk_text in enumerate(raw_chunks):
        start_search = max(0, search_from - overlap)
        idx = text.find(chunk_text, start_search)
        if idx == -1:
            idx = search_from  # splitter normalized whitespace — best-effort fallback, never lose the chunk
        char_start = idx
        char_end = idx + len(chunk_text)
        chunks.append({"chunk_index": i, "content": chunk_text, "char_start": char_start, "char_end": char_end})
        search_from = char_end
    return chunks
