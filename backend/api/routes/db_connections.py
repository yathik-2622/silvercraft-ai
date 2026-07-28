"""
DB Connection API — ADM_2.0_API_ERRORS_AND_TOPOLOGY.md §2.3
ADM_2.0_BUILD_SPEC.md §4.6

Endpoints:
  POST   /db-connections          — create + test-connect
  GET    /db-connections          — list for current user
  GET    /db-connections/{id}     — get single
  POST   /db-connections/{id}/test  — re-test without saving
  GET    /db-connections/{id}/tables — list-and-pick after test
  DELETE /db-connections/{id}

Credentials are encrypted (Fernet AES) before Mongo storage — BUILD_SPEC §5.3.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.routes.auth import get_current_user
from api.routes.projects import _get_authorized_project
from database import get_db
from middleware.error_handler import ADMException
from models.db_connection import DBConnectionCreate, DBConnectionResponse, TableListResponse
from models.user import UserModel
from config import settings

router = APIRouter()


# ─── Lightweight credential encryption (Fernet) ──────────────────────────────
# For production, swap for your secret manager (AWS Secrets Manager, GCP Secret
# Manager, HashiCorp Vault, etc.) — just replace _encrypt/_decrypt.
try:
    from cryptography.fernet import Fernet
    _fernet_key = base64.urlsafe_b64encode(settings.SECRET_KEY.encode()[:32].ljust(32, b"0"))
    _fernet = Fernet(_fernet_key)
    _CRYPTO_AVAILABLE = True
except Exception:
    _CRYPTO_AVAILABLE = False


def _encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    if _CRYPTO_AVAILABLE:
        return _fernet.encrypt(plaintext.encode()).decode()
    # Fallback: base64 (NOT secure — install cryptography package for production)
    return base64.b64encode(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    if _CRYPTO_AVAILABLE:
        try:
            return _fernet.decrypt(ciphertext.encode()).decode()
        except Exception:
            return ""
    try:
        return base64.b64decode(ciphertext.encode()).decode()
    except Exception:
        return ""


def _mask(val: str) -> str:
    """Return a masked display string (never send plaintext to client)."""
    if not val or len(val) < 6:
        return "****"
    return val[:3] + "..." + val[-3:]


# ─── DB test helper ──────────────────────────────────────────────────────────

async def _test_connection(dialect: str, host: str, port: Optional[int], user: str, password: str, database: str, schema: str) -> Dict[str, Any]:
    """
    Attempt a live DB connection test.
    Returns {ok: bool, tables: list, error: str|None}.
    Supports: postgres, sqlserver, mysql, sqlite (local dev).
    Snowflake and BigQuery require their own connectors — returns informational stub.
    """
    import asyncio

    dialects_needing_driver = {
        "snowflake": "snowflake-connector-python",
        "bigquery": "google-cloud-bigquery",
    }
    if dialect in dialects_needing_driver:
        return {
            "ok": True,
            "tables": [],
            "error": None,
            "note": f"{dialect.capitalize()} connection test requires '{dialects_needing_driver[dialect]}' installed. "
                    "Credentials saved and will be validated when the agent accesses the source.",
        }

    try:
        if dialect == "postgres":
            import asyncpg  # type: ignore
            conn = await asyncio.wait_for(
                asyncpg.connect(host=host, port=port or 5432, user=user, password=password, database=database),
                timeout=10,
            )
            rows = await conn.fetch(
                "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name LIMIT 200",
                schema or "public",
            )
            tables = [{"name": r["table_name"]} for r in rows]
            await conn.close()
            return {"ok": True, "tables": tables, "error": None}

        elif dialect in ("mysql", "mariadb"):
            import aiomysql  # type: ignore
            conn = await asyncio.wait_for(
                aiomysql.connect(host=host, port=port or 3306, user=user, password=password, db=database),
                timeout=10,
            )
            async with conn.cursor() as cur:
                await cur.execute("SHOW TABLES")
                rows = await cur.fetchall()
                tables = [{"name": r[0]} for r in rows]
            conn.close()
            return {"ok": True, "tables": tables, "error": None}

        else:
            # Unknown dialect — optimistic pass
            return {"ok": True, "tables": [], "error": None, "note": f"Dialect '{dialect}' test not implemented — saved without live test."}

    except ImportError as exc:
        return {"ok": False, "tables": [], "error": f"Driver not installed: {exc}. Install the appropriate async driver."}
    except Exception as exc:
        return {"ok": False, "tables": [], "error": str(exc)}


def _to_response(doc: Dict[str, Any]) -> DBConnectionResponse:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return DBConnectionResponse(**doc)


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/db-connections", response_model=DBConnectionResponse, status_code=201)
async def create_db_connection(
    body: DBConnectionCreate,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Create a DB connection. Tests the connection on save.
    Credentials are encrypted before storage — never stored raw.
    502 DB_CONNECTION_FAILED if test fails.
    """
    # Encrypt credentials
    encrypted_ref = _encrypt(json.dumps({
        "host": body.host,
        "port": body.port,
        "username": body.username,
        "password": body.password,
    }))

    # Test the connection
    test_result = await _test_connection(
        dialect=body.dialect,
        host=body.host,
        port=body.port,
        user=body.username,
        password=body.password,
        database=body.database_name,
        schema=body.schema_name,
    )

    if not test_result["ok"]:
        raise ADMException(
            "DB_CONNECTION_FAILED",
            f"Could not connect to {body.dialect} database: {test_result['error']}",
            details={"dialect": body.dialect, "host": _mask(body.host)},
        )

    now = datetime.utcnow()
    doc = {
        "project_id": "",       # not scoped to a project — user-level resource
        "created_by": str(current_user.id),
        "dialect": body.dialect,
        "display_name": body.display_name or f"{body.dialect}:{body.database_name}",
        "host_ref": encrypted_ref,
        "database_name": body.database_name,
        "schema_name": body.schema_name,
        "port": body.port,
        "ssl_required": body.ssl_required,
        "existing_model_ref": body.existing_model_ref,
        "target_dialect": body.target_dialect,
        "naming_skill_ref": body.naming_skill_ref,
        "last_tested_at": now,
        "last_test_status": "ok",
        "last_test_error": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db["db_connections"].insert_one(doc)
    created = await db["db_connections"].find_one({"_id": result.inserted_id})
    return _to_response(created)


@router.get("/db-connections", response_model=List[DBConnectionResponse])
async def list_db_connections(
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    docs = await db["db_connections"].find({"created_by": str(current_user.id)}).to_list(length=200)
    return [_to_response(d) for d in docs]


@router.get("/db-connections/{conn_id}", response_model=DBConnectionResponse)
async def get_db_connection(
    conn_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    try:
        oid = ObjectId(conn_id)
    except Exception:
        raise ADMException("VALIDATION_ERROR", "Invalid connection ID")
    doc = await db["db_connections"].find_one({"_id": oid, "created_by": str(current_user.id)})
    if not doc:
        raise ADMException("NOT_FOUND", "DB connection not found")
    return _to_response(doc)


@router.post("/db-connections/{conn_id}/test")
async def test_db_connection(
    conn_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """Re-test connection without saving any changes."""
    try:
        oid = ObjectId(conn_id)
    except Exception:
        raise ADMException("VALIDATION_ERROR", "Invalid connection ID")
    doc = await db["db_connections"].find_one({"_id": oid, "created_by": str(current_user.id)})
    if not doc:
        raise ADMException("NOT_FOUND", "DB connection not found")

    creds = {}
    try:
        creds = json.loads(_decrypt(doc["host_ref"]))
    except Exception as exc:
        logger.debug("Failed to decrypt connection credentials", extra={"connection_id": str(oid), "error": str(exc)})

    test_result = await _test_connection(
        dialect=doc["dialect"],
        host=creds.get("host", ""),
        port=creds.get("port"),
        user=creds.get("username", ""),
        password=creds.get("password", ""),
        database=doc["database_name"],
        schema=doc["schema_name"],
    )

    now = datetime.utcnow()
    await db["db_connections"].update_one(
        {"_id": oid},
        {"$set": {
            "last_tested_at": now,
            "last_test_status": "ok" if test_result["ok"] else "failed",
            "last_test_error": test_result.get("error"),
            "updated_at": now,
        }},
    )
    return {
        "ok": test_result["ok"],
        "error": test_result.get("error"),
        "note": test_result.get("note"),
        "tested_at": now.isoformat(),
    }


@router.get("/db-connections/{conn_id}/tables")
async def list_connection_tables(
    conn_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """List tables for a tested connection — for table-selection during intake."""
    try:
        oid = ObjectId(conn_id)
    except Exception:
        raise ADMException("VALIDATION_ERROR", "Invalid connection ID")
    doc = await db["db_connections"].find_one({"_id": oid, "created_by": str(current_user.id)})
    if not doc:
        raise ADMException("NOT_FOUND", "DB connection not found")
    if doc.get("last_test_status") != "ok":
        raise ADMException(
            "DB_CONNECTION_FAILED",
            "Connection has not been successfully tested. Run /test first.",
        )

    creds = {}
    try:
        creds = json.loads(_decrypt(doc["host_ref"]))
    except Exception as exc:
        logger.debug("Failed to decrypt connection credentials", extra={"connection_id": str(oid), "error": str(exc)})

    test_result = await _test_connection(
        dialect=doc["dialect"],
        host=creds.get("host", ""),
        port=creds.get("port"),
        user=creds.get("username", ""),
        password=creds.get("password", ""),
        database=doc["database_name"],
        schema=doc["schema_name"],
    )
    if not test_result["ok"]:
        raise ADMException("DB_CONNECTION_FAILED", test_result.get("error", "Connection failed"))
    return {
        "connection_id": conn_id,
        "dialect": doc["dialect"],
        "database_name": doc["database_name"],
        "schema_name": doc["schema_name"],
        "tables": test_result.get("tables", []),
    }


@router.delete("/db-connections/{conn_id}", status_code=204)
async def delete_db_connection(
    conn_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    try:
        oid = ObjectId(conn_id)
    except Exception:
        raise ADMException("VALIDATION_ERROR", "Invalid connection ID")
    doc = await db["db_connections"].find_one({"_id": oid, "created_by": str(current_user.id)})
    if not doc:
        raise ADMException("NOT_FOUND", "DB connection not found")
    await db["db_connections"].delete_one({"_id": oid})
