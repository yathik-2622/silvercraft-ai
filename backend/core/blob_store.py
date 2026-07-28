"""
Blob Store Client — ADM_2.0_BUILD_SPEC.md §3.1
Handles async file uploads and downloads using S3 API (boto3).
Defaults to local MinIO if MINIO_URL is set in .env.
"""

from __future__ import annotations

import io
import asyncio
from typing import Optional

from config import settings


def _get_boto_client():
    import boto3
    from botocore.config import Config

    if settings.MINIO_URL:
        # Local MinIO or compatible S3
        return boto3.client(
            "s3",
            endpoint_url=settings.MINIO_URL,
            aws_access_key_id=settings.MINIO_ACCESS_KEY or "minioadmin",
            aws_secret_access_key=settings.MINIO_SECRET_KEY or "minioadmin",
            config=Config(signature_version="s3v4"),
        )
    else:
        # Default AWS S3 using environment credentials
        return boto3.client("s3")


def upload_file_bytes(bucket: str, object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Uploads raw bytes to S3/MinIO and returns the URI."""
    client = _get_boto_client()
    try:
        client.head_bucket(Bucket=bucket)
    except Exception:
        # Attempt to create bucket if it doesn't exist
        client.create_bucket(Bucket=bucket)

    client.upload_fileobj(
        io.BytesIO(data),
        bucket,
        object_name,
        ExtraArgs={"ContentType": content_type}
    )
    return f"s3://{bucket}/{object_name}"


def download_file_bytes(uri: str) -> bytes:
    """Downloads an S3 object into memory."""
    if not uri.startswith("s3://"):
        raise ValueError(f"Invalid S3 URI: {uri}")
    
    parts = uri[5:].split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid S3 URI: {uri}")
    
    bucket, object_name = parts
    client = _get_boto_client()
    buffer = io.BytesIO()
    client.download_fileobj(bucket, object_name, buffer)
    buffer.seek(0)
    return buffer.read()


async def upload_file_bytes_async(bucket: str, object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Async wrapper around boto3 upload."""
    return await asyncio.to_thread(upload_file_bytes, bucket, object_name, data, content_type)


async def download_file_bytes_async(uri: str) -> bytes:
    """Async wrapper around boto3 download."""
    return await asyncio.to_thread(download_file_bytes, uri)
