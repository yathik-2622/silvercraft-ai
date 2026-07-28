---
name: dimensional-modeling
description: Build Kimball-style dimensional models with fact tables, dimension tables, surrogate keys, and SCD support.
skill_kind: modeling_style
style_key: kimball
stage_binding: logical
---

# Kimball Dimensional Modeling Skill

- Identify business processes, declare grain, list dimensions and facts
- Fact table grain must be explicitly stated before designing
- Use surrogate keys for all dimension tables (never business keys as PK)
- Apply Slowly Changing Dimensions Type 2 (SCD2) by default
- Create conformed dimensions shared across multiple fact tables
- Star schema preferred; snowflake only when cardinality demands
- Naming: fact_{business_process}, dim_{entity}
- Always include dim_date and dim_time calendar dimensions
