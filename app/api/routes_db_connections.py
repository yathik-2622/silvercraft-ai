"""
DB connection profiling — the DB-source equivalent of POST /uploads.

Same two-phase timing policy as file uploads (TDS §3/§5): the source is
touched exactly once, synchronously, right here — never again later by
Stage 1's TaskWorker (see app/agents/task_worker.py's module docstring for
why a live DB connection is never bound as an agent tool: a DSN, even
though it's a plain str, would have to flow through LLM context and
tool-call arguments for the agent to use it directly, quietly leaking a
credential on every run). Schema introspection + aggregate SQL are
deterministic computation, not an LLM call, so — same reasoning that
already lets /uploads run inline — this runs inline in FastAPI, not Celery.

`ADM_introspect_schema`/`ADM_profile_db_table` (app/tools/) are called
here as plain Python functions, exactly like /uploads calls
`ADM_extract_source_metadata` directly — they were removed from
task_worker.py's agent-tool registry, they were never removed as
functions.

Persists into the SAME `raw_files` collection /uploads writes to, under
a freshly generated raw_file_id-style id — not a new collection, and
`ADM__resolve_source_refs` (app/graphs/solution_agent_graph.py) needs no
change at all, because a `raw_files` document with structural/aggregate
stats is the only shape Stage 1 ever looks at, regardless of whether a
file or a DB table produced it. The client attaches the returned id via
`{"raw_file_id": ...}` in source_refs exactly like a file.

`dsn_ref` resolution: `ADM_DbConnection.dsn_ref` is documented as "a
reference/secret name, never the raw credential blob" but nothing in
this codebase yet defines what it's a reference *to*. This resolves it as
an environment variable name (`os.environ[dsn_ref]`) — the simplest
secret-reference convention that keeps an actual DSN (with credentials)
out of Mongo, consistent with this being a local-first cut with no
secrets-manager integration anywhere else. Revisit if a real secrets
store gets wired in later.
"""
import asyncio
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import ADM_get_current_user_id
from app.core.ownership import ADM_assert_project_access
from app.core.privacy import ADM_assert_no_literal_values, ADM_mark_value_derived_flagged, ADM_strip_forbidden_fields
from app.db.collections import ADM_COLLECTION_DB_CONNECTIONS, ADM_COLLECTION_RAW_FILES
from app.db.mongo_client import ADM_get_db
from app.models.schemas import ADM_DbConnection, ADM_DbConnectionCreateRequest, ADM_new_id, ADM_now
from app.tools.db_metadata_introspector import ADM_introspect_schema
from app.tools.sql_db_connector import ADM_profile_db_table, ADM_run_pushdown_min_max

router = APIRouter(prefix="/db-connections", tags=["db-connections"])


@router.post("", response_model=ADM_DbConnection)
async def ADM_create_db_connection(
    body: ADM_DbConnectionCreateRequest, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """
    Registers a DB connection — stores only `dialect` and `dsn_ref` (the
    env-var name the real DSN lives under, see module docstring), never a
    raw credential. This is the piece that was previously missing
    entirely: POST /db-connections/{id}/profile has always required the
    document to already exist; nothing before this created one.
    """
    await ADM_assert_project_access(body.project_id, current_user_id)
    conn = ADM_DbConnection(project_id=body.project_id, dialect=body.dialect, dsn_ref=body.dsn_ref)
    db = ADM_get_db()
    await db[ADM_COLLECTION_DB_CONNECTIONS].insert_one(conn.model_dump())
    return conn


@router.get("", response_model=list[ADM_DbConnection])
async def ADM_list_db_connections(
    project_id: str, current_user_id: str = Depends(ADM_get_current_user_id)
):
    """GET /db-connections?project_id=... — every DB connection registered for a project."""
    await ADM_assert_project_access(project_id, current_user_id)
    db = ADM_get_db()
    docs = await db[ADM_COLLECTION_DB_CONNECTIONS].find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=200)
    return docs

# Substrings of SQLAlchemy's str(column.type) worth pushing a MIN/MAX query
# for — same "numeric or date-ish" heuristic the CSV path uses
# (schema[name].is_numeric() or "Date" in str(schema[name])), adapted for
# SQL dialect type names instead of Polars dtype names.
ADM__MIN_MAX_DTYPE_HINTS = (
    "INT", "FLOAT", "DOUBLE", "REAL", "NUMERIC", "DECIMAL",
    "DATE", "TIME", "TIMESTAMP",
)


def ADM__is_min_max_eligible(dtype: str) -> bool:
    upper = dtype.upper()
    return any(hint in upper for hint in ADM__MIN_MAX_DTYPE_HINTS)


class ADM_DbProfileRequest(BaseModel):
    table: str
    db_schema: Optional[str] = None  # SQL schema/namespace the table lives in, if any


@router.post("/{db_connection_id}/profile")
async def ADM_profile_db_connection(
    db_connection_id: str,
    body: ADM_DbProfileRequest,
    current_user_id: str = Depends(ADM_get_current_user_id),
):
    db = ADM_get_db()
    conn_doc = await db[ADM_COLLECTION_DB_CONNECTIONS].find_one({"db_connection_id": db_connection_id})
    if not conn_doc:
        raise HTTPException(404, "Database connection not found")
    await ADM_assert_project_access(conn_doc["project_id"], current_user_id)

    dsn = os.environ.get(conn_doc["dsn_ref"])
    if not dsn:
        raise HTTPException(400, f"No DSN configured for reference '{conn_doc['dsn_ref']}'")

    try:
        schema_info = await asyncio.to_thread(ADM_introspect_schema, dsn, body.db_schema)
    except Exception as e:
        raise HTTPException(400, f"Schema introspection failed: {e}")

    table_info = schema_info["tables"].get(body.table)
    if table_info is None:
        raise HTTPException(404, f"Table '{body.table}' not found via introspection")

    column_names = [c["column_name"] for c in table_info["columns"]]
    dtype_by_column = {c["column_name"]: c["dtype"] for c in table_info["columns"]}

    try:
        stats = await asyncio.to_thread(ADM_profile_db_table, dsn, body.table, column_names)
    except Exception as e:
        raise HTTPException(400, f"Profiling failed: {e}")
    stats_by_column = {c["column_name"]: c for c in stats["column_stats"]}

    columns = []
    for name in column_names:
        dtype = dtype_by_column[name]
        col_stat = {
            "column_name": name,
            "dtype": dtype,
            "null_pct": stats_by_column[name]["null_pct"],
            "distinct_count": stats_by_column[name]["distinct_count"],
            "distinct_count_approximate": False,  # SQL COUNT(DISTINCT ...) pushdown is exact
        }
        if ADM__is_min_max_eligible(dtype):
            try:
                min_v, max_v = await asyncio.to_thread(ADM_run_pushdown_min_max, dsn, body.table, name)
            except Exception:
                min_v = max_v = None  # best-effort — a failed min/max shouldn't fail the whole profile
            if min_v is not None or max_v is not None:
                col_stat["min_value"] = min_v
                col_stat["max_value"] = max_v
                col_stat = ADM_mark_value_derived_flagged(col_stat)
        ADM_assert_no_literal_values(col_stat)
        columns.append(ADM_strip_forbidden_fields(col_stat))

    raw_file_id = ADM_new_id("file")
    doc = {
        "raw_file_id": raw_file_id,
        "project_id": conn_doc["project_id"],
        "original_filename": f"{body.db_schema + '.' if body.db_schema else ''}{body.table}",
        "table_name": body.table,
        "row_count": stats["row_count"],
        "column_count": len(columns),
        "columns": columns,
        "uploaded_at": ADM_now(),
        # Additive, harmless w.r.t. ADM__resolve_source_refs (looks up by
        # raw_file_id only) — lets the UI show where this came from.
        "source_type": "db_table",
        "db_connection_id": db_connection_id,
    }
    await db[ADM_COLLECTION_RAW_FILES].insert_one(doc)

    doc.pop("_id", None)
    return doc
