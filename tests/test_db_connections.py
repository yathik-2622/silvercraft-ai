"""
Tests for Phase 1's DB connection rewrite — real host/port/username/
password/database fields, password encrypted at rest via
ADM_encrypt_secret/ADM_decrypt_secret (the same Fernet helpers already
used for BYOK LLM API keys), never echoed back by any route. Run with: pytest

Real Mongo + a real local sqlite file for the end-to-end profiling round
trip (sqlite needs no extra DBAPI driver, unlike postgres/mysql/mssql,
so it's the only dialect that can run a genuine connection test without
external infrastructure).
"""
import asyncio
import os
import sqlite3
import tempfile
import uuid

from fastapi.testclient import TestClient

from app.core.auth import ADM_get_current_user_id
from app.core.runtime_settings import ADM_decrypt_secret, ADM_encrypt_secret
from app.db.collections import ADM_COLLECTION_DB_CONNECTIONS, ADM_COLLECTION_PROJECTS
from app.db.mongo_client import ADM_get_db, ADM_reset_mongo_client
from app.main import app
from app.tools.sql_db_connector import ADM_build_dsn

_raw_client = TestClient(app)


class _ResettingClient:
    def __getattr__(self, name):
        method = getattr(_raw_client, name)

        def wrapped(*args, **kwargs):
            ADM_reset_mongo_client()
            return method(*args, **kwargs)

        return wrapped


client = _ResettingClient()


def _override_user(user_id: str):
    return lambda: user_id


async def _seed_project(user_id: str) -> str:
    db = ADM_get_db()
    project_id = f"proj_test_{uuid.uuid4().hex[:10]}"
    await db[ADM_COLLECTION_PROJECTS].insert_one({
        "project_id": project_id, "owner_user_id": user_id, "name": "Test", "layer": "silver",
        "domain": "Test Domain", "collaborator_user_ids": [], "has_business_standards": False,
    })
    return project_id


def _cleanup(project_id: str, db_connection_id: str | None = None):
    async def _delete():
        db = ADM_get_db()
        await db[ADM_COLLECTION_PROJECTS].delete_one({"project_id": project_id})
        if db_connection_id:
            await db[ADM_COLLECTION_DB_CONNECTIONS].delete_one({"db_connection_id": db_connection_id})

    ADM_reset_mongo_client()
    asyncio.run(_delete())


def test_password_never_returned_by_create():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id = asyncio.run(_seed_project(user_id))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    db_connection_id = None
    try:
        resp = client.post("/db-connections", json={
            "project_id": project_id, "dialect": "postgresql", "host": "db.example.com",
            "port": 5432, "database": "analytics", "username": "reporter", "password": "hunter2",
        })
        assert resp.status_code == 200
        body = resp.json()
        db_connection_id = body["db_connection_id"]
        assert "password" not in body
        assert "password_encrypted" not in body
        assert body["host"] == "db.example.com"
        assert body["username"] == "reporter"
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, db_connection_id)


def test_password_never_returned_by_list():
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id = asyncio.run(_seed_project(user_id))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    db_connection_id = None
    try:
        created = client.post("/db-connections", json={
            "project_id": project_id, "dialect": "mysql", "host": "localhost",
            "port": 3306, "database": "app_db", "username": "root", "password": "s3cret",
        }).json()
        db_connection_id = created["db_connection_id"]
        resp = client.get(f"/db-connections?project_id={project_id}")
        assert resp.status_code == 200
        docs = resp.json()
        assert len(docs) == 1
        assert "password" not in docs[0]
        assert "password_encrypted" not in docs[0]
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, db_connection_id)


def test_stored_password_round_trips_through_encryption():
    """The literal password sent in the create request must be recoverable
    via ADM_decrypt_secret from whatever landed in Mongo — proves the
    create route actually encrypts (not just omits from the response)."""
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id = asyncio.run(_seed_project(user_id))
    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    db_connection_id = None
    try:
        created = client.post("/db-connections", json={
            "project_id": project_id, "dialect": "postgresql", "host": "localhost",
            "port": 5432, "database": "d", "username": "u", "password": "correct horse battery staple",
        }).json()
        db_connection_id = created["db_connection_id"]

        async def _fetch_raw():
            ADM_reset_mongo_client()
            db = ADM_get_db()
            return await db[ADM_COLLECTION_DB_CONNECTIONS].find_one({"db_connection_id": db_connection_id})

        raw_doc = asyncio.run(_fetch_raw())
        assert raw_doc["password_encrypted"] != "correct horse battery staple"  # never stored plaintext
        assert ADM_decrypt_secret(raw_doc["password_encrypted"]) == "correct horse battery staple"
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, db_connection_id)


def test_build_dsn_postgresql():
    dsn = ADM_build_dsn("postgresql", "db.host", 5432, "mydb", "user", "p@ss/word")
    assert dsn.startswith("postgresql+psycopg2://")
    assert "db.host:5432/mydb" in dsn
    # special characters in the password must be URL-encoded, not break the DSN
    assert "p@ss/word" not in dsn


def test_build_dsn_sqlite_ignores_credentials():
    dsn = ADM_build_dsn("sqlite", "unused-host", 0, "/tmp/my.db", "unused-user", "unused-pw")
    assert dsn == "sqlite:////tmp/my.db"


def test_real_sqlite_connection_profiles_end_to_end():
    """Full round trip: create a DB connection (encrypted password), then
    POST /db-connections/{id}/profile against a REAL local sqlite file —
    sqlite needs no external DBAPI driver, so this genuinely exercises
    ADM_decrypt_secret + ADM_build_dsn + ADM_introspect_schema +
    ADM_profile_db_table end-to-end, not just the encryption plumbing."""
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    ADM_reset_mongo_client()
    project_id = asyncio.run(_seed_project(user_id))

    db_path = os.path.join(tempfile.gettempdir(), f"adm_test_dbconn_{uuid.uuid4().hex[:8]}.sqlite")
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE customers (id INTEGER, name TEXT, email TEXT)")
    conn.executemany("INSERT INTO customers VALUES (?, ?, ?)", [
        (1, "Alice", "a@x.com"), (2, "Bob", "b@x.com"), (3, "Carol", None),
    ])
    conn.commit()
    conn.close()

    app.dependency_overrides[ADM_get_current_user_id] = _override_user(user_id)
    db_connection_id = None
    try:
        created = client.post("/db-connections", json={
            "project_id": project_id, "dialect": "sqlite", "host": "unused",
            "port": 0, "database": db_path, "username": "unused", "password": "unused",
        }).json()
        db_connection_id = created["db_connection_id"]

        resp = client.post(f"/db-connections/{db_connection_id}/profile", json={"table": "customers"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["table_name"] == "customers"
        assert body["row_count"] == 3
        assert body["column_count"] == 3
        col_names = {c["column_name"] for c in body["columns"]}
        assert col_names == {"id", "name", "email"}
    finally:
        app.dependency_overrides.pop(ADM_get_current_user_id, None)
        _cleanup(project_id, db_connection_id)
        try:
            os.remove(db_path)
        except PermissionError:
            pass  # Windows keeps the file locked while SQLAlchemy's connection pool is alive — harmless leftover in $TEMP
