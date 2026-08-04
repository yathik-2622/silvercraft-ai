"""
KB document retrieval for citation rendering — deliberately NOT admin-only.
Any authenticated user who receives a citation in a chat response needs to
be able to fetch the full document text plus every chunk's offsets, so the
UI can render "the whole document, with this exact chunk highlighted"
without a second round of guessing where the boundaries are.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import ADM_get_current_user_id
from app.db.collections import ADM_COLLECTION_KB_DOCUMENTS, ADM_COLLECTION_MODELING_REFERENCE
from app.db.mongo_client import ADM_get_db

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
    }
