"""
Push tasks — Celery tasks for metastore (Postgres) and KG (Neo4j) pushes.
Per ADM_2.0_BUILD_SPEC.md §4.1 Exceptions #1 and #2.

These tasks are ONLY triggered by explicit owner action at the final gate.
Credentials come exclusively from .env (POSTGRES_*, NEO4J_*) — never from the DB.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict

from tasks.celery_app import celery_app


def _get_loop():
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def _run(coro):
    return _get_loop().run_until_complete(coro)


@celery_app.task(
    name="tasks.push_tasks.push_metastore_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def push_metastore_task(self, push_log_id: str):
    """
    Execute DDL against PostgreSQL metastore.
    Credentials from POSTGRES_* env vars only — never from the request or DB.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from bson import ObjectId
    from config import settings
    from api.websocket import ws_manager

    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]

        push_log = _run(db["push_logs"].find_one({"_id": ObjectId(push_log_id)}))
        if not push_log:
            return {"error": "Push log not found"}

        ddl_payload = push_log.get("ddl_payload", {})
        session_id = push_log.get("session_id", "")

        # Update status to running
        _run(db["push_logs"].update_one(
            {"_id": ObjectId(push_log_id)},
            {"$set": {"status": "running", "started_at": datetime.utcnow()}},
        ))

        # Execute DDL against Postgres
        tables_executed = 0
        errors = []

        try:
            import asyncpg

            dsn = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"

            async def _execute_ddl():
                conn = await asyncpg.connect(dsn)
                try:
                    physical_tables = ddl_payload.get("physical_tables", [])
                    for table in physical_tables:
                        ddl = table.get("ddl", "")
                        if ddl:
                            await conn.execute(f"SET search_path TO {settings.POSTGRES_SCHEMA}")
                            await conn.execute(ddl)
                            nonlocal tables_executed
                            tables_executed += 1
                finally:
                    await conn.close()

            _run(_execute_ddl())

        except ImportError:
            errors.append("asyncpg not installed — install it to enable Postgres push")
        except Exception as pg_exc:
            errors.append(str(pg_exc))
            raise self.retry(exc=pg_exc)

        status = "completed" if not errors else "failed"
        _run(db["push_logs"].update_one(
            {"_id": ObjectId(push_log_id)},
            {"$set": {"status": status, "tables_executed": tables_executed, "errors": errors, "completed_at": datetime.utcnow()}},
        ))

        _run(ws_manager.send_trace(session_id, "output" if status == "completed" else "error", {
            "push_type": "metastore",
            "status": status,
            "tables_executed": tables_executed,
            "errors": errors,
        }))

        client.close()
        return {"status": status, "tables_executed": tables_executed, "errors": errors}

    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(
    name="tasks.push_tasks.push_kg_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def push_kg_task(self, push_log_id: str):
    """
    Push model artifacts to Neo4j Knowledge Graph (27-level ADM ontology).
    Per BUILD_SPEC §4.1 Exception #2 — adm_silver_kg_v2.py pattern.
    NEO4J_* credentials from .env only.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from bson import ObjectId
    from config import settings
    from api.websocket import ws_manager

    try:
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DB_NAME]

        push_log = _run(db["push_logs"].find_one({"_id": ObjectId(push_log_id)}))
        if not push_log:
            return {"error": "Push log not found"}

        full_payload = push_log.get("full_payload", {})
        session_id = push_log.get("session_id", "")

        _run(db["push_logs"].update_one(
            {"_id": ObjectId(push_log_id)},
            {"$set": {"status": "running", "started_at": datetime.utcnow()}},
        ))

        nodes_created = 0
        rels_created = 0
        errors = []

        try:
            from neo4j import GraphDatabase  # type: ignore

            driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            )

            with driver.session(database=settings.NEO4J_DATABASE) as neo_session:
                # G3 logical model → KG nodes
                g3 = full_payload.get("G3", {})
                entities = g3.get("entities", {})
                for entity_name, entity_data in entities.items():
                    neo_session.run(
                        "MERGE (e:LogicalEntity {name: $name}) "
                        "SET e.role = $role, e.scd_type = $scd_type, e.updated_at = $updated_at",
                        name=entity_name,
                        role=entity_data.get("role", "ENTITY"),
                        scd_type=entity_data.get("scd_type"),
                        updated_at=datetime.utcnow().isoformat(),
                    )
                    nodes_created += 1

                # G3 relationships → KG edges
                for rel in g3.get("relationships", []):
                    neo_session.run(
                        "MATCH (a:LogicalEntity {name: $from}) "
                        "MATCH (b:LogicalEntity {name: $to}) "
                        "MERGE (a)-[r:RELATES_TO {cardinality: $card}]->(b)",
                        **{"from": rel.get("from_entity", ""), "to": rel.get("to_entity", ""), "card": rel.get("cardinality", "")},
                    )
                    rels_created += 1

                # G4 physical model → KG
                g4 = full_payload.get("G4", {})
                for table in g4.get("physical_tables", []):
                    tbl_name = table.get("tableName") or table.get("name", "")
                    neo_session.run(
                        "MERGE (t:PhysicalTable {name: $name}) "
                        "SET t.schema = $schema, t.load_type = $load_type, t.updated_at = $updated_at",
                        name=tbl_name,
                        schema=table.get("schema", ""),
                        load_type=table.get("load_type", ""),
                        updated_at=datetime.utcnow().isoformat(),
                    )
                    nodes_created += 1

            driver.close()

        except ImportError:
            errors.append("neo4j Python driver not installed — run: pip install neo4j")
        except Exception as neo_exc:
            errors.append(str(neo_exc))
            raise self.retry(exc=neo_exc)

        status = "completed" if not errors else "failed"
        _run(db["push_logs"].update_one(
            {"_id": ObjectId(push_log_id)},
            {"$set": {"status": status, "nodes_created": nodes_created, "rels_created": rels_created, "errors": errors, "completed_at": datetime.utcnow()}},
        ))

        _run(ws_manager.send_trace(session_id, "output" if status == "completed" else "error", {
            "push_type": "kg",
            "status": status,
            "nodes_created": nodes_created,
            "rels_created": rels_created,
            "errors": errors,
        }))

        client.close()
        return {"status": status, "nodes_created": nodes_created, "rels_created": rels_created, "errors": errors}

    except Exception as exc:
        raise self.retry(exc=exc)
