"""
Local Blob Store — replaces S3/MinIO with local filesystem storage.
Uploaded files are stored under /home/yathik/ADM_2.O/silvercraft-ai/uploads/.
Per user request: keep uploaded files in one folder in root.
"""

from __future__ import annotations

import io
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from config import settings

UPLOADS_ROOT = Path("/home/yathik/ADM_2.O/silvercraft-ai/uploads")
UPLOADS_ROOT.mkdir(parents=True, exist_ok=True)


def _safe_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal."""
    name = Path(filename).name
    return name.replace("..", "_").replace("/", "_").replace("\\", "_") or "file"


def upload_file_bytes(
    project_id: str, object_name: str, data: bytes, content_type: str = "application/octet-stream"
) -> str:
    """Upload raw bytes to local filesystem. Returns the absolute file path."""
    project_dir = UPLOADS_ROOT / project_id
    project_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(object_name)
    ext = Path(safe_name).suffix or ""
    base = Path(safe_name).stem or "file"
    local_path = project_dir / f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{base}{ext}"

    with open(local_path, "wb") as f:
        f.write(data)

    return str(local_path)


def download_file_bytes(uri: str) -> bytes:
    """Download local file into memory."""
    if not os.path.isfile(uri):
        raise FileNotFoundError(f"Local file not found: {uri}")
    return Path(uri).read_bytes()


async def upload_file_bytes_async(
    project_id: str, object_name: str, data: bytes, content_type: str = "application/octet-stream"
) -> str:
    """Async wrapper around local upload."""
    return await __import__("asyncio").to_thread(
        upload_file_bytes, project_id, object_name, data, content_type
    )


async def download_file_bytes_async(uri: str) -> bytes:
    """Async wrapper around local download."""
    return await __import__("asyncio").to_thread(download_file_bytes, uri)


def list_project_files(project_id: str) -> list[str]:
    """List all uploaded files for a project."""
    project_dir = UPLOADS_ROOT / project_id
    if not project_dir.exists():
        return []
    return [str(p) for p in project_dir.iterdir() if p.is_file()]


def delete_project_files(project_id: str) -> int:
    """Delete all uploaded files for a project. Returns count of deleted files."""
    project_dir = UPLOADS_ROOT / project_id
    if not project_dir.exists():
        return 0
    count = 0
    for f in project_dir.iterdir():
        if f.is_file():
            f.unlink()
            count += 1
    return count


def get_file_path(uri: str) -> str:
    """Return the local file path from a stored URI. URI IS the path."""
    return uri
