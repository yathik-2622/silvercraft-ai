"""
File Parse Celery Task — Phase 7 (Updated)
Uses native LangChain document loaders/parsers.
Stores parsed results in MongoDB.
Uploaded files are kept locally (see local_blob_store.py).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from bson import ObjectId

from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


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
def parse_file_task(self, file_id: str, project_id: str, file_path: str, filename: str, content_type: str):
    """
    Parses an uploaded file using LangChain native document loaders.
    file_path is the local filesystem path to the uploaded file.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from config import settings
    from core.source_parser import parse_local_file
    from core.local_blob_store import delete_project_files

    logger.info("[parse_file_task] Starting parse for file_id=%s project_id=%s filename=%s content_type=%s", file_id, project_id, filename, content_type)

    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]

        # 1. Update status to parsing
        logger.info("[parse_file_task] Updating status to 'parsing' for file_id=%s", file_id)
        _run(db["project_files"].update_one(
            {"_id": ObjectId(file_id)},
            {"$set": {"parse_status": "parsing"}}
        ))

        # 2. Parse using LangChain native parsers
        logger.info("[parse_file_task] Parsing file_id=%s filename=%s", file_id, filename)
        parsed = parse_local_file(file_path, content_type)
        logger.info("[parse_file_task] Parsed file_id=%s: parser=%s tables=%d chunks=%d", file_id, parsed.get("parser"), len(parsed.get("tables", [])), parsed.get("chunk_count", 0))

        # 3. Clean up the local file after parsing
        try:
            import os
            if os.path.exists(file_path):
                os.unlink(file_path)
                logger.info("[parse_file_task] Deleted local file_id=%s path=%s", file_id, file_path)
        except Exception:
            pass

        # 4. Save structured result to parsed_documents collection
        doc_id = ObjectId()
        parsed_doc = {
            "_id": doc_id,
            "project_id": project_id,
            "file_id": file_id,
            "filename": filename,
            "parser": parsed.get("parser"),
            "tables": parsed.get("tables", []),
            "excerpt": parsed.get("excerpt", ""),
            "chunks": parsed.get("chunks", []),
            "chunk_count": parsed.get("chunk_count", 0),
            "embedding_model": getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small"),
            "created_at": datetime.utcnow(),
        }
        _run(db["parsed_documents"].insert_one(parsed_doc))
        logger.info("[parse_file_task] Saved parsed_doc_id=%s for file_id=%s", str(doc_id), file_id)

        # 5. Update project_files status
        _run(db["project_files"].update_one(
            {"_id": ObjectId(file_id)},
            {"$set": {
                "parse_status": "completed",
                "parsed_document_id": str(doc_id),
                "parsed_at": datetime.utcnow(),
                "chunk_count": parsed.get("chunk_count", 0),
            }}
        ))
        logger.info("[parse_file_task] Updated file_id=%s status to 'completed'", file_id)

        # 6. Clean up any orphaned project files
        delete_project_files(project_id)

        client.close()
        logger.info("[parse_file_task] Completed successfully for file_id=%s", file_id)
        return {"status": "completed", "file_id": file_id, "tables_found": len(parsed.get("tables", [])), "chunk_count": parsed.get("chunk_count", 0)}

    except Exception as exc:
        logger.error("[parse_file_task] Error parsing file_id=%s filename=%s: %s", file_id, filename, exc, exc_info=True)
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
