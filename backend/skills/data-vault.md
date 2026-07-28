---
name: data-vault
description: Build Data Vault 2.0 structures with hubs, links, satellites, hash keys, and point-in-time tables.
skill_kind: modeling_style
style_key: datavault
stage_binding: logical
---

# Data Vault 2.0 Skill

- Hubs: business keys + LOAD_DATE + RECORD_SOURCE (no descriptive attributes)
- Links: FK relationships between Hubs + LOAD_DATE + RECORD_SOURCE
- Satellites: descriptive attributes + LOAD_DATE + RECORD_SOURCE + HASH_DIFF
- Hash keys: SHA-256 of UPPER(TRIM(business_key)), pipe-delimited for composites
- Insert-only pattern — never update, never delete
- PIT (Point-in-Time) tables for snapshot query acceleration
- Bridge tables for many-to-many resolution
- Schema prefixes: HUB_, LNK_, SAT_, PIT_, BRG_
