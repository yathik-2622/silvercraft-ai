---
name: 3nf-normalization
description: Normalize entities to Third Normal Form with surrogate keys, ISO-standard data types, and audit columns.
skill_kind: modeling_style
style_key: 3nf
stage_binding: logical
---

# 3NF Normalization Skill

- Eliminate partial dependencies: 1NF → 2NF → 3NF
- Enforce atomic values; no repeating groups
- Separate all non-key attributes into own entities
- Use surrogate PKs: {entity}_id (BIGINT or UUID)
- Naming convention: snake_case, ISO timestamps (TIMESTAMP_NTZ)
- PII fields: apply SHA-256 hashing or tokenization
- Add audit columns: created_at, updated_at, is_deleted (soft-delete)
