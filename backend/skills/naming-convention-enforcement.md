---
name: naming-convention-enforcement
description: Enforce consistent physical names across entities, attributes, tables, and columns for the chosen target dialect.
skill_kind: naming_convention
stage_binding: cross_cutting
---

# Naming Convention Enforcement

- Use snake_case by default unless target_dialect has a stronger default
- Respect length limits: Snowflake 255, BigQuery 300, Postgres 63, SQL Server 128
- Avoid reserved words; suffix or rename when collision detected
- Prefixes: dim_, fact_, hub_, lnk_, sat_, pit_, brg_ where applicable
- Suffixes: _sk for surrogate keys, _bk for business keys, _dt for date columns
- Pluralization: prefer singular table names unless enterprise standard requires plural
