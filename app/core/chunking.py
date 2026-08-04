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
from langchain_text_splitters import RecursiveCharacterTextSplitter, MarkdownTextSplitter, TokenTextSplitter

from app.config import ADM_get_settings

ADM_CHUNKING_STRATEGIES = {
    "markdown": "Markdown-aware — splits on headings first, then paragraphs. Best default for modeling reference docs.",
    "recursive": "General-purpose recursive splitter — paragraph, then sentence, then word boundaries. Good for plain text/Word docs.",
    "sliding_window": "Fixed-size token window with overlap — most predictable chunk size, best for very uniform/dense text.",
    "page_aware": "Groups content by page/slide boundary where the source format has one (PDF, PPTX) before falling back to size-based splitting.",
}


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

    raw_chunks = ADM_split_by_strategy(text, strategy, size, overlap)
    return ADM_attach_offsets(text, raw_chunks, overlap)


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
