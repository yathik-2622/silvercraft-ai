"""Small, deterministic source parsers used before source-analysis delegation."""

import csv
import io
import json
from pathlib import Path
from typing import Any


def parse_source_bytes(raw: bytes, filename: str, content_type: str) -> dict[str, Any]:
    text = raw.decode("utf-8-sig", errors="replace")
    suffix = Path(filename or "").suffix.lower()
    table_name = Path(filename or "source").stem or "source"
    if suffix == ".csv" or content_type == "text/csv":
        rows = list(csv.DictReader(io.StringIO(text)))
        columns = list(rows[0].keys()) if rows else []
        return {"parser": "python:csv", "tables": [{"name": table_name, "columns": [{"name": column} for column in columns], "row_count": len(rows)}], "excerpt": text[:12000]}
    if suffix == ".json" or content_type == "application/json":
        try:
            payload = json.loads(text)
            rows = payload if isinstance(payload, list) else [payload]
            columns = sorted({key for row in rows if isinstance(row, dict) for key in row})
            return {"parser": "python:json", "tables": [{"name": table_name, "columns": [{"name": column} for column in columns], "row_count": len(rows)}], "excerpt": json.dumps(payload, ensure_ascii=False)[:12000]}
        except json.JSONDecodeError:
            return {"parser": "python:text-fallback", "tables": [], "excerpt": text[:12000], "warning": "Invalid JSON; retained as text."}
    return {"parser": "python:text", "tables": [], "excerpt": text[:12000]}
