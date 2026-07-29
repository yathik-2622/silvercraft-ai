"""
Native LangChain document parser.
Uses LangChain document loaders + text splitters for all file types.
Keeps uploaded files stored locally (see local_blob_store.py).
"""

from __future__ import annotations

import logging
import os
from typing import Any

from langchain_community.document_loaders import (
    CSVLoader,
    JSONLoader,
    TextLoader,
    PyPDFLoader,
    UnstructuredWordDocumentLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = getattr(settings, "EMBEDDING_MODEL", "text-embedding-3-small")
CHUNK_SIZE = getattr(settings, "CHUNK_SIZE", 1000)
CHUNK_OVERLAP = getattr(settings, "CHUNK_OVERLAP", 200)

_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def get_text_splitter():
    """Return a reusable text splitter instance."""
    return _text_splitter


def _load_documents(file_path: str, content_type: str) -> list[Any]:
    """Load documents using the appropriate LangChain loader based on file extension and content type."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".csv" or content_type == "text/csv":
        loader = CSVLoader(file_path)
        return loader.load()
    elif ext == ".json" or content_type == "application/json":
        loader = JSONLoader(file_path, jq_schema=".")
        return loader.load()
    elif ext == ".pdf":
        loader = PyPDFLoader(file_path)
        return loader.load()
    elif ext in (".docx", ".doc") or content_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        loader = UnstructuredWordDocumentLoader(file_path)
        return loader.load()
    elif ext == ".txt" or content_type in ("text/plain", "application/octet-stream"):
        loader = TextLoader(file_path, encoding="utf-8")
        return loader.load()
    else:
        loader = TextLoader(file_path, encoding="utf-8")
        return loader.load()


def parse_local_file(file_path: str, content_type: str = "application/octet-stream") -> dict[str, Any]:
    """Parse an uploaded file using LangChain native loaders. Returns structured schema + text chunks."""
    if not os.path.isfile(file_path):
        return {"parser": "langchain:error", "tables": [], "excerpt": "", "chunks": [], "warning": f"File not found: {file_path}"}

    ext = os.path.splitext(file_path)[1].lower()
    logger.info("[source_parser] Parsing file=%s content_type=%s ext=%s", file_path, content_type, ext)

    try:
        docs = _load_documents(file_path, content_type)
    except Exception as exc:
        logger.error("[source_parser] Failed to load file=%s: %s", file_path, exc, exc_info=True)
        return {"parser": "langchain:error", "tables": [], "excerpt": "", "chunks": [], "warning": str(exc)}

    if not docs:
        logger.warning("[source_parser] No documents loaded from file=%s", file_path)
        return {"parser": "langchain:text", "tables": [], "excerpt": "", "chunks": [], "warning": "No documents loaded"}

    # Extract text from all documents
    full_text = "\n".join(doc.page_content for doc in docs if doc.page_content)
    logger.info("[source_parser] Loaded %d pages from file=%s total_chars=%d", len(docs), file_path, len(full_text))

    # Split into chunks
    chunks = _text_splitter.split_text(full_text)
    logger.info("[source_parser] Split file=%s into %d chunks", file_path, len(chunks))

    # Infer tabular structure from CSV/JSON content
    tables = []
    if ext == ".csv" or content_type == "text/csv":
        try:
            import csv as _csv
            with open(file_path, "r", encoding="utf-8") as f:
                reader = _csv.DictReader(f)
                rows = list(reader)
                columns = list(rows[0].keys()) if rows else []
                tables.append({
                    "name": os.path.splitext(os.path.basename(file_path))[0],
                    "columns": [{"name": c} for c in columns],
                    "row_count": len(rows),
                })
                logger.info("[source_parser] CSV file=%s has %d rows and %d columns", file_path, len(rows), len(columns))
        except Exception as exc:
            logger.warning("[source_parser] Failed to parse CSV file=%s: %s", file_path, exc)
    elif ext == ".json" or content_type == "application/json":
        try:
            import json as _json
            with open(file_path, "r", encoding="utf-8") as f:
                data = _json.load(f)
            rows = data if isinstance(data, list) else [data]
            columns = sorted({key for row in rows if isinstance(row, dict) for key in row})
            tables.append({
                "name": os.path.splitext(os.path.basename(file_path))[0],
                "columns": [{"name": c} for c in columns],
                "row_count": len(rows),
            })
            logger.info("[source_parser] JSON file=%s has %d rows and %d columns", file_path, len(rows), len(columns))
        except Exception as exc:
            logger.warning("[source_parser] Failed to parse JSON file=%s: %s", file_path, exc)

    result = {
        "parser": "langchain",
        "tables": tables,
        "excerpt": full_text[:12000],
        "chunks": chunks,
        "chunk_count": len(chunks),
    }
    logger.info("[source_parser] Completed parsing file=%s tables=%d chunks=%d", file_path, len(tables), len(chunks))
    return result


def parse_source_bytes(raw: bytes, filename: str, content_type: str) -> dict[str, Any]:
    """
    Legacy entry point — write bytes to temp file, then use LangChain parser.
    Kept for backward compatibility with existing callers.
    """
    import tempfile
    ext = os.path.splitext(filename)[1].lower() or ".txt"
    suffix_map = {".csv": ".csv", ".json": ".json", ".pdf": ".pdf", ".txt": ".txt", ".docx": ".docx", ".doc": ".doc"}
    suffix = suffix_map.get(ext, ext)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        result = parse_local_file(tmp_path, content_type)
        return result
    finally:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass
