"""
upload_ingestion — the missing HTTP-boundary piece behind TDS §3/§5 row 6d.

Resolves the two-phase timing question the TDS left implicit: the source
file is touched exactly ONCE, at upload time — not later, when Stage 1's
TaskWorker actually runs. This module does that one touch: streams the
file, computes full structural + aggregate stats in a single pass, and
returns a payload with zero literal values. The file is never referenced
again after this function returns; Stage 1's `profile_source` task works
entirely off what gets persisted here.
"""
from typing import BinaryIO

import openpyxl
import polars as pl

from app.core.privacy import ADM_mark_value_derived_flagged, ADM_strip_forbidden_fields
from app.tools.profiling_stats import ADM_compute_distinct_count, ADM_compute_running_null_pct

ADM_SUPPORTED_EXTENSIONS = {".csv", ".tsv", ".xlsx", ".xls"}


def ADM_extract_source_metadata(file_obj: BinaryIO, filename: str) -> dict:
    """
    Dispatches by extension. Returns:
      {table_name, row_count, column_count, columns: [{column_name, dtype,
       null_pct, distinct_count, distinct_count_approximate, min_value?,
       max_value?, _policy_flags?}]}
    Never returns row content, sample values, or anything not in this shape
    — enforced by ADM_strip_forbidden_fields on every column entry.
    """
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ADM_SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type '{ext}'. Supported: {sorted(ADM_SUPPORTED_EXTENSIONS)}")

    if ext in (".csv", ".tsv"):
        return ADM_extract_csv_metadata(file_obj, filename)
    return ADM_extract_excel_metadata(file_obj, filename)


def ADM_extract_csv_metadata(file_obj: BinaryIO, filename: str) -> dict:
    """
    Single Polars streaming pass: schema + null_count + n_unique + min/max
    per column, computed lazily and only materialized as aggregates —
    Polars never holds the full file in memory for this query shape.
    """
    lazy = pl.scan_csv(file_obj)
    schema = lazy.collect_schema()
    col_names = list(schema.keys())

    agg_exprs = []
    for name in col_names:
        agg_exprs += [
            pl.col(name).null_count().alias(f"{name}__null_count"),
            pl.col(name).n_unique().alias(f"{name}__distinct"),
        ]
        if schema[name].is_numeric() or "Date" in str(schema[name]):
            agg_exprs += [
                pl.col(name).min().alias(f"{name}__min"),
                pl.col(name).max().alias(f"{name}__max"),
            ]

    stats_row = lazy.select(pl.len().alias("__row_count"), *agg_exprs).collect(streaming=True).row(0, named=True)
    row_count = stats_row["__row_count"]

    columns = []
    for name in col_names:
        col_stat = {
            "column_name": name,
            "dtype": str(schema[name]),
            "null_pct": ADM_compute_running_null_pct(stats_row[f"{name}__null_count"], row_count),
            "distinct_count": stats_row[f"{name}__distinct"],
            "distinct_count_approximate": False,  # Polars n_unique is exact
        }
        if f"{name}__min" in stats_row:
            col_stat["min_value"] = stats_row[f"{name}__min"]
            col_stat["max_value"] = stats_row[f"{name}__max"]
            col_stat = ADM_mark_value_derived_flagged(col_stat)
        columns.append(ADM_strip_forbidden_fields(col_stat))

    return {
        "table_name": ADM_table_name_from_filename(filename),
        "row_count": row_count,
        "column_count": len(columns),
        "columns": columns,
    }


def ADM_extract_excel_metadata(file_obj: BinaryIO, filename: str) -> dict:
    """
    openpyxl read_only row cursor — the one case that needs a seekable
    buffered stream (XLSX is a zip container), still request-scoped and
    never persisted (TDS §3.3). Distinct count uses the same bounded
    HyperLogLog fallback as profiling_stats.py above the configured
    threshold, so huge spreadsheets don't blow memory either.
    """
    wb = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
    ws = wb.active

    header: list[str] = []
    null_counts: dict[int, int] = {}
    value_iters: dict[int, list] = {}
    numeric_min: dict[int, object] = {}
    numeric_max: dict[int, object] = {}
    row_count = 0

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            header = [str(v) if v is not None else f"col_{j}" for j, v in enumerate(row)]
            for j in range(len(header)):
                null_counts[j] = 0
                value_iters[j] = []
            continue
        row_count += 1
        for j, v in enumerate(row):
            if v is None:
                null_counts[j] += 1
            else:
                value_iters[j].append(v)
                if isinstance(v, (int, float)):
                    numeric_min[j] = v if j not in numeric_min else min(numeric_min[j], v)
                    numeric_max[j] = v if j not in numeric_max else max(numeric_max[j], v)
    wb.close()

    columns = []
    for j, name in enumerate(header):
        distinct_count, approximate = ADM_compute_distinct_count(value_iters.get(j, []))
        col_stat = {
            "column_name": name,
            "dtype": "numeric" if j in numeric_min else "text",
            "null_pct": ADM_compute_running_null_pct(null_counts.get(j, 0), row_count),
            "distinct_count": distinct_count,
            "distinct_count_approximate": approximate,
        }
        if j in numeric_min:
            col_stat["min_value"] = numeric_min[j]
            col_stat["max_value"] = numeric_max[j]
            col_stat = ADM_mark_value_derived_flagged(col_stat)
        columns.append(ADM_strip_forbidden_fields(col_stat))

    return {
        "table_name": ADM_table_name_from_filename(filename),
        "row_count": row_count,
        "column_count": len(columns),
        "columns": columns,
    }


def ADM_table_name_from_filename(filename: str) -> str:
    base = filename.rsplit("/", 1)[-1]
    return base.rsplit(".", 1)[0] if "." in base else base
