---
name: scd-temporal-best-practices
description: Apply correct Slowly Changing Dimension types, validity windows, and temporal table patterns.
skill_kind: naming_convention
stage_binding: logical
---

# SCD & Temporal Best Practices

- SCD Type 0: Retain original value (no change tracking)
- SCD Type 1: Overwrite — use for corrections and non-historical attributes
- SCD Type 2: Add row — default for most dimension attributes requiring history
- SCD Type 3: Add column — only when limited historical versions are needed
- SCD Type 6: Hybrid 1+2 — preserve original value and track history
- Every SCD2 row requires: effective_start_ts, effective_end_ts, is_current_flag, change_reason
- Use CURRENT_DATE or pipeline load timestamp as the source of truth for validity boundaries
- Do not track history on degenerate or junk dimensions
