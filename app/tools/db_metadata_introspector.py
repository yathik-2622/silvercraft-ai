"""
db_metadata_introspector — native tool, TDS §8.

Pulls table/column names + types + declared keys/FKs from
`information_schema` (or dialect equivalent) via SQLAlchemy's inspector.
Structural metadata only — no row content is ever touched.
"""
from sqlalchemy import inspect

from app.tools.sql_db_connector import ADM_get_engine


def ADM_introspect_schema(dsn: str, schema: str | None = None) -> dict:
    engine = ADM_get_engine(dsn)
    inspector = inspect(engine)
    tables = {}
    for table_name in inspector.get_table_names(schema=schema):
        columns = [
            {"column_name": c["name"], "dtype": str(c["type"]), "nullable": c["nullable"]}
            for c in inspector.get_columns(table_name, schema=schema)
        ]
        pk = inspector.get_pk_constraint(table_name, schema=schema)
        fks = inspector.get_foreign_keys(table_name, schema=schema)
        tables[table_name] = {
            "columns": columns,
            "primary_key": pk.get("constrained_columns", []),
            "foreign_keys": [
                {"columns": fk["constrained_columns"], "ref_table": fk["referred_table"],
                 "ref_columns": fk["referred_columns"]}
                for fk in fks
            ],
        }
    return {"tables": tables, "table_count": len(tables)}