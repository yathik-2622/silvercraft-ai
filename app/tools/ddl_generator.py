"""
ddl_generator — native tool, TDS §8. Stage 4, Canonical/3NF style only
this cut. Turns the resolved physical entity model (post derive_keys /
resolve_relationships) into standard SQL DDL.

target_platform (from the project's own ADM_Project.target_platform field,
threaded in via app.agents.context_builder.ADM_build_run_invariant_context
into every Stage 1-4 task's run-invariant context) selects the dialect.
generate_ddl's skill prompt instructs the LLM to read target_platform out
of that context and pass it through when calling this tool — the LLM
still decides column dtypes/keys, but identifier syntax is decided
deterministically here, not left to the LLM to get a dialect right.
"""

ADM_SUPPORTED_PLATFORMS = {"postgresql", "snowflake", "sqlserver"}


def ADM__normalize_platform(target_platform: str | None) -> str:
    value = (target_platform or "postgresql").strip().lower()
    return value if value in ADM_SUPPORTED_PLATFORMS else "postgresql"


def ADM__quote_identifier(name: str, platform: str) -> str:
    # SQL Server's bracket quoting is the one syntax difference that
    # matters regardless of what dtypes the LLM chose — Postgres and
    # Snowflake both accept plain unquoted identifiers for the
    # lowercase/snake_case names this pipeline already generates.
    if platform == "sqlserver":
        return f"[{name}]"
    return name


def ADM__first_present(d: dict, *keys: str, default=None):
    for key in keys:
        value = d.get(key)
        if value not in (None, ""):
            return value
    return default


def ADM_generate_create_table_ddl(table: dict, target_platform: str = "postgresql") -> str:
    """
    table = {
        "table_name": str,
        "columns": [{"column_name": str, "dtype": str, "nullable": bool}],
        "primary_key": [str],
        "foreign_keys": [{"columns": [str], "ref_table": str, "ref_columns": [str]}],
    }

    Every key is read defensively across the naming variants actually
    observed live from the generate_ddl skill's LLM tool call: this dict
    is LLM-constructed per run, not internally typed, so "column_name" vs
    "name" and "dtype" vs "data_type"/"type" are both real, not
    hypothetical — two different KeyErrors from two different field names
    were hit back-to-back in the same testing pass before this got
    hardened once, for every field, instead of re-patched one at a time.
    Falls back to a placeholder rather than crashing Stage 4 outright if a
    field is genuinely missing from every alias.
    """
    platform = ADM__normalize_platform(target_platform)
    q = lambda name: ADM__quote_identifier(name, platform)
    # Snowflake convention; harmless/idiomatic on the other two dialects
    # too, but only added for snowflake to keep postgresql's output
    # unchanged from before this feature existed.
    exists_clause = "IF NOT EXISTS " if platform == "snowflake" else ""

    table_name = ADM__first_present(table, "table_name", "name", default="unnamed_table")
    lines = [f"CREATE TABLE {exists_clause}{q(table_name)} ("]
    col_lines = []
    for col in table.get("columns", []):
        null_sql = "NULL" if col.get("nullable", True) else "NOT NULL"
        col_name = ADM__first_present(col, "column_name", "name", default="unnamed_column")
        dtype = ADM__first_present(col, "dtype", "data_type", "type", default="TEXT")
        col_lines.append(f"    {q(col_name)} {dtype} {null_sql}")

    pk = table.get("primary_key", [])
    if pk:
        col_lines.append(f"    PRIMARY KEY ({', '.join(q(c) for c in pk)})")

    for fk in table.get("foreign_keys", []):
        col_lines.append(
            f"    FOREIGN KEY ({', '.join(q(c) for c in fk['columns'])}) "
            f"REFERENCES {q(fk['ref_table'])} ({', '.join(q(c) for c in fk['ref_columns'])})"
        )

    lines.append(",\n".join(col_lines))
    lines.append(");")
    return "\n".join(lines)


def ADM_generate_ddl_script(tables: list[dict], target_platform: str = "postgresql") -> str:
    return "\n\n".join(ADM_generate_create_table_ddl(t, target_platform) for t in tables)