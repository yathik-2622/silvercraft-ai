"""
sql_db_connector — native tool, TDS §8 / §3.3.

Fully pushed-down SQL: actual row data never leaves the source database;
only computed stat values return. Uses SQLAlchemy Core (no ORM materialization).
"""
from typing import Any

from sqlalchemy import create_engine, text

from app.core.privacy import ADM_strip_forbidden_fields


def ADM_get_engine(dsn: str):
    return create_engine(dsn, pool_pre_ping=True)


def ADM_run_pushdown_count(dsn: str, table: str) -> int:
    engine = ADM_get_engine(dsn)
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT COUNT(*) AS c FROM {table}"))
        return int(result.scalar_one())


def ADM_run_pushdown_distinct_count(dsn: str, table: str, column: str) -> int:
    engine = ADM_get_engine(dsn)
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT COUNT(DISTINCT {column}) AS c FROM {table}"))
        return int(result.scalar_one())


def ADM_run_pushdown_null_pct(dsn: str, table: str, column: str, row_count: int) -> float:
    if row_count == 0:
        return 0.0
    engine = ADM_get_engine(dsn)
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT COUNT(*) AS c FROM {table} WHERE {column} IS NULL"))
        null_count = int(result.scalar_one())
    return round(100.0 * null_count / row_count, 4)


def ADM_run_pushdown_min_max(dsn: str, table: str, column: str) -> tuple[Any, Any]:
    engine = ADM_get_engine(dsn)
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT MIN({column}) AS mn, MAX({column}) AS mx FROM {table}"))
        row = result.one()
        return row.mn, row.mx


def ADM_profile_db_table(dsn: str, table: str, columns: list[str]) -> dict[str, Any]:
    """Pushes every stat down as SQL. Returns structural + aggregate metadata only."""
    row_count = ADM_run_pushdown_count(dsn, table)
    column_stats = []
    for col in columns:
        column_stats.append({
            "column_name": col,
            "null_pct": ADM_run_pushdown_null_pct(dsn, table, col, row_count),
            "distinct_count": ADM_run_pushdown_distinct_count(dsn, table, col),
        })
    result = {"table": table, "row_count": row_count, "column_stats": column_stats}
    return ADM_strip_forbidden_fields(result)