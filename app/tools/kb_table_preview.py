"""
kb_table_preview — structured {columns, rows} parsing for KB reference
documents that are CSV/XLSX, used only by the citation-preview UI (Phase 3
of the chat-redesign plan). Distinct from
app/tools/upload_ingestion.py's privacy-walled metadata-only extraction:
KB documents are admin-uploaded reference/knowledge content, not customer
source data, so returning real row content here is correct, not a privacy
violation — same distinction app/tools/document_text_extract.py's module
docstring already draws for full_text extraction.

Also distinct from document_text_extract.py's ADM_extract_csv_text/
ADM_extract_xlsx_text, which flatten a file into embeddable prose text for
chunking — this returns real structured {columns, rows} for a UI table,
a different consumer with a different shape need.
"""
import csv
import io
import logging

import openpyxl

logger = logging.getLogger(__name__)

ADM_TABLE_PREVIEW_MAX_ROWS = 500
ADM_TABLE_PREVIEW_EXTENSIONS = {".csv", ".xlsx"}


def ADM_parse_table_preview(file_bytes: bytes, extension: str) -> dict:
    """Returns {"columns": [...], "rows": [{...}, ...]}, capped at
    ADM_TABLE_PREVIEW_MAX_ROWS rows (a preview, not a full export — the
    original file is always downloadable via the /file route for that).
    Raises ValueError for an unsupported extension — callers turn that
    into a 400, same convention as document_text_extract.py."""
    ext = extension.lower()
    logger.info("Parsing table preview: extension=%s bytes=%d", ext, len(file_bytes))
    if ext == ".csv":
        return _parse_csv(file_bytes)
    if ext == ".xlsx":
        return _parse_xlsx(file_bytes)
    raise ValueError(f"Table preview isn't supported for '{ext}' — only {sorted(ADM_TABLE_PREVIEW_EXTENSIONS)}.")


def _parse_csv(file_bytes: bytes) -> dict:
    text = file_bytes.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    columns = list(reader.fieldnames or [])
    rows = []
    for i, row in enumerate(reader):
        if i >= ADM_TABLE_PREVIEW_MAX_ROWS:
            break
        rows.append(dict(row))
    return {"columns": columns, "rows": rows}


def _parse_xlsx(file_bytes: bytes) -> dict:
    workbook = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    sheet = workbook.worksheets[0]
    rows_iter = sheet.iter_rows(values_only=True)
    header = next(rows_iter, None) or ()
    columns = [str(c) if c is not None else f"col_{i}" for i, c in enumerate(header)]
    rows = []
    for i, row in enumerate(rows_iter):
        if i >= ADM_TABLE_PREVIEW_MAX_ROWS:
            break
        rows.append({columns[j]: ("" if v is None else v) for j, v in enumerate(row) if j < len(columns)})
    return {"columns": columns, "rows": rows}
