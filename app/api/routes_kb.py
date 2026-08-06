"""
KB document retrieval for citation rendering — deliberately NOT admin-only.
Any authenticated user who receives a citation in a chat response needs to
be able to fetch the full document text plus every chunk's offsets, so the
UI can render "the whole document, with this exact chunk highlighted"
without a second round of guessing where the boundaries are.

Also serves the original file bytes + a structured table preview for docs
ingested after the Phase 3 blob-storage change (see ADM_KbDocument.blob_path
in app/models/schemas.py) — same no-admin-gate reasoning: whoever can see a
citation can see the document it came from.
"""
import logging
import mimetypes
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.core.auth import ADM_get_current_user_id
from app.db.collections import ADM_COLLECTION_KB_DOCUMENTS, ADM_COLLECTION_MODELING_REFERENCE
from app.db.mongo_client import ADM_get_db
from app.tools.kb_table_preview import ADM_TABLE_PREVIEW_EXTENSIONS, ADM_parse_table_preview

logger = logging.getLogger(__name__)

# Explicit, not mimetypes.guess_type() — that reads from the OS's own MIME
# registry, which genuinely disagrees across platforms (confirmed live:
# Windows maps .csv to "application/vnd.ms-excel", not "text/csv"). The
# one type that actually matters functionally is .pdf (the frontend
# <iframe>-embeds it directly, and some browsers refuse to render a PDF
# embed without the right content-type) — the rest are served correctly
# either way since nothing else does in-browser native rendering off this
# route, but pinning them all avoids the same class of surprise later.
ADM_KB_FILE_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
}

router = APIRouter(prefix="/kb", tags=["kb"])


@router.get("/documents/{doc_id}")
async def ADM_get_kb_document(doc_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """
    Returns {doc_id, title, full_text, chunks: [{chunk_id, chunk_index,
    char_start, char_end}]} — full_text is the whole original document;
    chunks carry only offsets (not duplicated content) so the client slices
    full_text[char_start:char_end] to render the highlight, using whichever
    chunk_id came back on the citation.
    """
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_KB_DOCUMENTS].find_one({"doc_id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "KB document not found")

    chunks = await db[ADM_COLLECTION_MODELING_REFERENCE].find(
        {"source_doc_id": doc_id}, {"_id": 0, "embedding": 0, "content": 0}
    ).sort("chunk_index", 1).to_list(length=1000)

    return {
        "doc_id": doc["doc_id"],
        "title": doc["title"],
        "full_text": doc["full_text"],
        "status": doc["status"],
        "chunks": chunks,
        "original_extension": doc.get("original_extension", ""),
        "has_native_preview": bool(doc.get("blob_path")),
    }


async def ADM__get_kb_doc_with_blob(doc_id: str) -> dict:
    """Shared lookup for the two routes below — 404 if the doc doesn't
    exist, or if it exists but has no blob_path (uploaded before Phase 3,
    or the disk write failed at upload time) so the frontend's fallback to
    the existing text view is a clean 404, not a confusing partial response."""
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_KB_DOCUMENTS].find_one({"doc_id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "KB document not found")
    if not doc.get("blob_path") or not os.path.exists(doc["blob_path"]):
        raise HTTPException(404, "No original file stored for this document — falls back to the text preview.")
    return doc


@router.get("/documents/{doc_id}/file")
async def ADM_get_kb_document_file(doc_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Native preview source — a real PDF embeds this directly via
    <iframe src=...>, no client-side PDF rendering needed."""
    doc = await ADM__get_kb_doc_with_blob(doc_id)
    ext = doc.get("original_extension", "").lower()
    media_type = ADM_KB_FILE_MEDIA_TYPES.get(ext) or mimetypes.guess_type(doc["blob_path"])[0] or "application/octet-stream"
    logger.info("Serving KB doc file: doc_id=%s ext=%s media_type=%s", doc_id, ext, media_type)
    return FileResponse(doc["blob_path"], media_type=media_type, filename=doc["filename"])


@router.get("/documents/{doc_id}/table-preview")
async def ADM_get_kb_document_table_preview(doc_id: str, current_user_id: str = Depends(ADM_get_current_user_id)):
    """Structured {columns, rows} for a CSV/XLSX KB doc — lets the frontend
    render a real table via the same RecordArrayTable component task
    outputs already use, instead of a bespoke table-preview renderer."""
    doc = await ADM__get_kb_doc_with_blob(doc_id)
    ext = doc.get("original_extension", "")
    if ext not in ADM_TABLE_PREVIEW_EXTENSIONS:
        raise HTTPException(400, f"Table preview isn't available for '{ext}' documents — only {sorted(ADM_TABLE_PREVIEW_EXTENSIONS)}.")
    with open(doc["blob_path"], "rb") as f:
        file_bytes = f.read()
    try:
        preview = ADM_parse_table_preview(file_bytes, ext)
    except ValueError as e:
        raise HTTPException(400, str(e))
    logger.info("Table preview generated: doc_id=%s columns=%d rows=%d", doc_id, len(preview["columns"]), len(preview["rows"]))
    return preview
