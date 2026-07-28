---
name: sttm
description: Generate source-to-target mappings, transformation rules, data quality checks, and physical DDL for the target dialect.
skill_kind: subtask
stage_binding: physical
---

# STTM (Source-to-Target Mapping) Skill

- Map every source column to its target column with transformation rule
- Rules: TRIM, UPPER, LOWER, COALESCE, CAST, DATE_TRUNC, SHA2, TOKENIZE
- Default values for nullable targets: NULL, 'UNKNOWN', 0, CURRENT_TIMESTAMP
- DQ rules per column: NOT NULL, REGEX_MATCH, FOREIGN_KEY, RANGE_CHECK
- Load strategy: Full Load | Incremental (watermark) | CDC (log-based)
- Generate DDL: CREATE TABLE with constraints, comments, and partitioning hints
- Include STTM matrix columns: src_table, src_col, tgt_table, tgt_col, rule, dq_check, load_type
