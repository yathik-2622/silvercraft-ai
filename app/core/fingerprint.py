"""
fingerprint — content-hash dedupe for the admin KB upload pipeline,
mirroring hckb_core_fingerprint.py's content_hash_from_bytes: whitespace-
normalized before hashing, so two uploads of the same document that only
differ in line-endings/trailing-whitespace/re-export formatting still
hash identically and get caught as duplicates.
"""
import hashlib
import logging

logger = logging.getLogger(__name__)


def ADM_content_hash(text: str) -> str:
    """SHA-256 over whitespace-collapsed text, prefixed the same way
    hckb's own hash strings are (`"sha256:" + hexdigest`) for a
    self-describing value in the DB rather than a bare hex string."""
    normalized = " ".join((text or "").split())
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"
