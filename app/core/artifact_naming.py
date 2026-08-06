"""
artifact_naming — human-readable filenames for local_blob_storage, in
place of the previous bare `{contract_id}.sql`. Scoped exactly to what's
actually written to disk today: the DDL script written by
ADM_generate_provenance_and_artifacts (app/celery_app/tasks.py) — KB
documents and raw source files are deliberately never written to disk at
all (a documented privacy boundary — see app/tools/upload_ingestion.py's
module docstring), so there is no other artifact-writing surface this
applies to.
"""
import logging
import re

logger = logging.getLogger(__name__)

ADM_ARTIFACT_NAME_PART_MAX_LEN = 40


def ADM_slugify(value: str, max_len: int = ADM_ARTIFACT_NAME_PART_MAX_LEN) -> str:
    """Lowercase, non-alphanumeric -> underscore, collapsed/stripped,
    truncated — filesystem-safe on both Windows and POSIX, and short
    enough that four of these joined together stays a reasonable filename
    length rather than an unreadable wall of text."""
    slug = re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")
    return slug[:max_len].rstrip("_") or "untitled"


def ADM_build_artifact_filename(
    owner_username: str, project_name: str, chat_title: str, artifact_type: str, extension: str,
    disambiguator: str | None = None,
) -> str:
    """
    `{owner_username}_{project_name}_{chat_title}_{artifact_type}.{extension}`,
    each part independently slugified/truncated. `disambiguator` (e.g. the
    first few hex chars of a contract_id) is appended ONLY when supplied —
    callers pass it in specifically to break a real collision against
    what's already on disk, not as a default, so the common case stays as
    short/readable as the user asked for.
    """
    parts = [
        ADM_slugify(owner_username), ADM_slugify(project_name),
        ADM_slugify(chat_title), ADM_slugify(artifact_type),
    ]
    base = "_".join(parts)
    if disambiguator:
        base = f"{base}_{disambiguator}"
    ext = extension.lstrip(".")
    filename = f"{base}.{ext}"
    logger.info("ADM_build_artifact_filename: owner=%r project=%r chat=%r type=%r -> %s", owner_username, project_name, chat_title, artifact_type, filename)
    return filename
