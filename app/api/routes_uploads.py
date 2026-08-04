"""
Upload endpoint — the real HTTP boundary missing from the previous cut.
TDS §3/§5: file bytes are streamed, structural+aggregate stats computed
in one pass, then the file is discarded. Nothing here touches an LLM or
agent, so this runs inline in FastAPI (not a Celery task) — it's pure
deterministic computation, not the "agent/LLM logic" FastAPI is barred
from running directly per TDS §8's API/Compute boundary.

Returns a `raw_file_id` the client attaches via ADM_FileRef.raw_file_id
in a chat message's file_refs — this is what makes routes_chats.py's
file_refs parameter meaningful instead of theoretical.

Polars/openpyxl profiling (app.tools.upload_ingestion) is synchronous,
CPU/IO-bound work — run via asyncio.to_thread so a large source file
can't block the event loop for other concurrent requests.
"""
import asyncio

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.auth import ADM_get_current_user_id
from app.core.ownership import ADM_assert_project_access
from app.core.privacy import ADM_assert_no_literal_values
from app.db.collections import ADM_COLLECTION_RAW_FILES
from app.db.mongo_client import ADM_get_db
from app.models.schemas import ADM_new_id, ADM_now
from app.tools.upload_ingestion import ADM_extract_source_metadata

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("")
async def ADM_upload_source_file(
    project_id: str | None = Form(None),
    file: UploadFile = File(...),
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    """
    Streams `file` directly off its SpooledTemporaryFile — no explicit
    tempfile write, no copy to disk, no Blob upload. Computes stats once,
    persists only the thin registration record, then the file object goes
    out of scope and FastAPI/Starlette discards it at request end.

    project_id is optional — a dashboard chat (no project yet) can still
    attach a file. When given, the existing project-access check applies
    unchanged. When absent, there's no project to check access against
    yet, so the raw_files document is stamped with uploaded_by_user_id
    instead — that's what gates a project-less file to just the user who
    uploaded it (see ADM_get_raw_file_metadata below). Once the chat is
    migrated via POST /chats/{chat_id}/create-project, every raw_files
    document it referenced gets re-parented to the new project_id.
    """
    if project_id:
        await ADM_assert_project_access(project_id, current_user_id)
    try:
        metadata = await asyncio.to_thread(ADM_extract_source_metadata, file.file, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        await file.close()

    for col in metadata["columns"]:
        ADM_assert_no_literal_values(col)

    raw_file_id = ADM_new_id("file")
    doc = {
        "raw_file_id": raw_file_id,
        "project_id": project_id,
        "uploaded_by_user_id": current_user_id if project_id is None else None,
        "original_filename": file.filename,
        "table_name": metadata["table_name"],
        "row_count": metadata["row_count"],
        "column_count": metadata["column_count"],
        "columns": metadata["columns"],
        "uploaded_at": ADM_now(),
        # Deliberately absent: any field holding file bytes, a storage
        # path, or a Blob/disk reference — there is nothing to reference,
        # because nothing beyond this document was ever written anywhere.
    }
    db = ADM_get_db()
    await db[ADM_COLLECTION_RAW_FILES].insert_one(doc)

    doc.pop("_id", None)
    return doc


@router.get("/{raw_file_id}")
async def ADM_get_raw_file_metadata(
    raw_file_id: str, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """Lets the UI show 'profile_source already ran on upload' before Stage 1 executes."""
    db = ADM_get_db()
    doc = await db[ADM_COLLECTION_RAW_FILES].find_one({"raw_file_id": raw_file_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "File reference not found")
    if doc.get("project_id"):
        await ADM_assert_project_access(doc["project_id"], current_user_id)
    elif doc.get("uploaded_by_user_id") != current_user_id:
        raise HTTPException(404, "File reference not found")
    return doc
