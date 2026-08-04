"""
document_text_extract — turns an uploaded KB reference file into plain
text. Unlike app/tools/upload_ingestion.py (which deliberately extracts
ONLY structural/aggregate metadata and never the content, per TDS §3),
this one is for reference/knowledge documents, where the actual text IS
the thing we need — that's the point of a Modelling Reference KB. This
distinction matters: source data files (customer records etc.) are never
stored; KB reference documents (modeling methodology docs an admin
explicitly uploads to teach the system) are stored in full, deliberately,
because citations need the whole document to render a highlight against.

Supports .md/.markdown/.txt, .pdf, .docx, .pptx — not markdown-only.
PDF/PPTX extraction joins pages/slides with a form-feed (\\f) so the
"page_aware" chunking strategy (app/core/chunking.py) can detect and
respect real page/slide boundaries.
"""
from typing import BinaryIO

import docx
import pptx
import pypdf

ADM_SUPPORTED_KB_EXTENSIONS = {".md", ".markdown", ".txt", ".pdf", ".docx", ".pptx"}


def ADM_extract_document_text(file_obj: BinaryIO, filename: str) -> str:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ADM_SUPPORTED_KB_EXTENSIONS:
        raise ValueError(f"Unsupported KB document type '{ext}'. Supported: {sorted(ADM_SUPPORTED_KB_EXTENSIONS)}")

    if ext == ".pdf":
        return ADM_extract_pdf_text(file_obj)
    if ext == ".docx":
        return ADM_extract_docx_text(file_obj)
    if ext == ".pptx":
        return ADM_extract_pptx_text(file_obj)

    raw = file_obj.read()
    return raw.decode("utf-8", errors="replace")


def ADM_extract_pdf_text(file_obj: BinaryIO) -> str:
    reader = pypdf.PdfReader(file_obj)
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\f".join(pages)


def ADM_extract_docx_text(file_obj: BinaryIO) -> str:
    """
    Paragraphs AND table content — a Word doc's tables often carry the
    actual modeling rules (e.g. a normalization-rules table), so skipping
    them would silently drop real content.
    """
    document = docx.Document(file_obj)
    parts: list[str] = [p.text for p in document.paragraphs if p.text.strip()]
    for table in document.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells)
            if row_text.strip(" |"):
                parts.append(row_text)
    return "\n\n".join(parts)


def ADM_extract_pptx_text(file_obj: BinaryIO) -> str:
    """One slide's shapes joined per slide, slides joined by form-feed so
    page_aware chunking can treat each slide as one page."""
    presentation = pptx.Presentation(file_obj)
    slides_text: list[str] = []
    for slide in presentation.slides:
        shape_texts = [shape.text for shape in slide.shapes if shape.has_text_frame and shape.text.strip()]
        slides_text.append("\n".join(shape_texts))
    return "\f".join(slides_text)
