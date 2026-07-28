"""
Blob Store Client — ADM_2.0_BUILD_SPEC.md §3.1
Handles async file uploads and downloads.
Local fallback: stores files under BLOB_STORE_LOCAL_PATH (working directory).
S3/MinIO is only used when BLOB_STORE_ENDPOINT is explicitly set.
"""

from __future__ import annotations

import io
import asyncio
import os
from pathlib import Path
from typing import Optional

from config import settings


def _get_local_path() -> Path:
    base = settings.BLOB_STORE_LOCAL_PATH or os.path.join(os.getcwd(), "blob_store")
    Path(base).mkdir(parents=True, exist_ok=True)
    return Path(base)


def _get_boto_client():
    import boto3
    from botocore.config import Config

    if settings.BLOB_STORE_ENDPOINT:
        return boto3.client(
            "s3",
            endpoint_url=settings.BLOB_STORE_ENDPOINT,
            aws_access_key_id=settings.BLOB_STORE_ACCESS_KEY or "minioadmin",
            aws_secret_access_key=settings.BLOB_STORE_SECRET_KEY or "minioadmin",
            config=Config(signature_version="s3v4"),
        )
    raise RuntimeError("Blob store is not configured. Set BLOB_STORE_LOCAL_PATH or BLOB_STORE_ENDPOINT.")


def upload_file_bytes(bucket: str, object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    if settings.BLOB_STORE_LOCAL_PATH and not settings.BLOB_STORE_ENDPOINT:
        local = _get_local_path()
        target = local / bucket / object_name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return str(target)

    client = _get_boto_client()
    try:
        client.head_bucket(Bucket=bucket)
    except Exception:
        client.create_bucket(Bucket=bucket)

    client.upload_fileobj(
        io.BytesIO(data),
        bucket,
        object_name,
        ExtraArgs={"ContentType": content_type}
    )
    return f"s3://{bucket}/{object_name}"


def download_file_bytes(uri: str) -> bytes:
    if uri.startswith(_get_local_path().as_posix()):
        return Path(uri).read_bytes()

    if not uri.startswith("s3://"):
        raise ValueError(f"Invalid blob URI: {uri}")

    parts = uri[5:].split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid blob URI: {uri}")

    bucket, object_name = parts
    client = _get_boto_client()
    buffer = io.BytesIO()
    client.download_fileobj(bucket, object_name, buffer)
    buffer.seek(0)
    return buffer.read()


async def upload_file_bytes_async(bucket: str, object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    return await asyncio.to_thread(upload_file_bytes, bucket, object_name, data, content_type)


async def download_file_bytes_async(uri: str) -> bytes:
    return await asyncio.to_thread(download_file_bytes, uri)
