"""
File Parse Celery Task — Phase 7
Handles async parsing of uploaded files, extracting schema and metadata.
Stores results in parsed_documents and updates project_files.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from bson import ObjectId

from tasks.celery_app import celery_app


def _get_loop():
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def _run(coro):
    return _get_loop().run_until_complete(coro)


@celery_app.task(
    name="tasks.file_parse_task.parse_file_task",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    acks_late=True,
)
def parse_file_task(self, file_id: str, project_id: str, uri: str, filename: str, content_type: str):
    """
    Downloads the file from blob store, parses it, and stores the structured output.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from config import settings
    from core.blob_store import download_file_bytes_async
    from core.source_parser import parse_source_bytes

    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]

        # 1. Update status to parsing
        _run(db["project_files"].update_one(
            {"_id": ObjectId(file_id)},
            {"$set": {"parse_status": "parsing"}}
        ))

        # 2. Download from Blob Store
        raw_bytes = _run(download_file_bytes_async(uri))

        # 3. Parse content
        parsed = parse_source_bytes(raw_bytes, filename, content_type)

        # 4. Save to parsed_documents collection
        doc_id = ObjectId()
        parsed_doc = {
            "_id": doc_id,
            "project_id": project_id,
            "file_id": file_id,
            "filename": filename,
            "parser": parsed.get("parser"),
            "tables": parsed.get("tables", []),
            "excerpt": parsed.get("excerpt", ""),
            "created_at": datetime.utcnow(),
        }
        _run(db["parsed_documents"].insert_one(parsed_doc))

        # 5. Update project_files status
        _run(db["project_files"].update_one(
            {"_id": ObjectId(file_id)},
            {"$set": {
                "parse_status": "completed",
                "parsed_document_id": str(doc_id),
                "parsed_at": datetime.utcnow()
            }}
        ))

        client.close()
        return {"status": "completed", "file_id": file_id, "tables_found": len(parsed.get("tables", []))}

    except Exception as exc:
        # On failure, mark as error
        try:
            client = AsyncIOMotorClient(settings.MONGODB_URI)
            db = client[settings.MONGODB_DB_NAME]
            _run(db["project_files"].update_one(
                {"_id": ObjectId(file_id)},
                {"$set": {"parse_status": "error", "error_message": str(exc)}}
            ))
            client.close()
        except Exception:
            pass
        raise self.retry(exc=exc)
