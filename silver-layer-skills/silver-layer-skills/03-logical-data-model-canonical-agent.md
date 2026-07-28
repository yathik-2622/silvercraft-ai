---
name: logical-data-model-canonical-agent
description: Stage 3 agent, Canonical/Hybrid style. Converts the ConceptualDataModel into a normalized canonical model with selective, entity-by-entity historization — combining 3NF simplicity for stable entities with Data-Vault-style versioning only where change history genuinely matters.
version: 1.0
stage: 3
style: canonical
hitl_gate: "Gate 3 - Logical Approval"
---

# Logical Data Model Agent — Canonical / Hybrid Style

## Purpose
Produce a logical model for landscapes with **mixed needs**: most entities are stable and best served by straightforward normalized modeling, but a subset genuinely require change-history tracking (regulatory, audit, or analytical need) without adopting full Data Vault overhead landscape-wide. This style is a deliberate middle ground — not a default — and is only selected when Stage 2's style recommendation or the human reviewer identifies mixed requirements.

## Internal Sub-Agents (converge before Gate 3)
1. **Entity Classification Sub-Agent** — classifies each CDM entity as `stable` (3NF treatment) or `historized` (versioned treatment), using Stage 1 change-frequency/freshness signals and any explicit audit/regulatory classification tags
2. **Normalization Sub-Agent** — applies 3NF rules to `stable` entities (same rules as the pure-3NF agent)
3. **Versioning Design Sub-Agent** — applies Slowly Changing Dimension (Type 2-style) versioning to `historized` entities: effective-dated attributes, current-record flag, surrogate version key
4. **Key Design Sub-Agent** — assigns keys per entity type (surrogate business key for stable entities; surrogate version key + durable business key for historized entities)
5. **Relationship Resolution Sub-Agent** — resolves CDM relationships, handling the stable-to-historized relationship case explicitly (a relationship to a historized entity must specify whether it binds to the durable business key or to a specific version)

## Inputs
- `ConceptualDataModel` (approved, Stage 2)
- `SourceAnalysisReport` (change-frequency signals, classification tags, especially regulatory/audit flags)

## Modeling Rules
- **Classification default**: an entity is classified `historized` if Stage 1 classification flagged regulatory relevance (GDPR/HIPAA/etc. requiring audit trail) OR if profiling shows meaningful update frequency on descriptive attributes OR if the human explicitly marks it at Gate 2/3; otherwise `stable`
- **Stable entities**: follow the same 1NF/2NF/3NF rules as the pure-3NF agent, no versioning attributes added
- **Historized entities**: durable business key (surrogate or natural) separate from a per-version surrogate key; every version row carries `effective_start_date`, `effective_end_date` (nullable/open for current), `is_current_flag`; attribute-level change detection determines when a new version row is created (not every source load creates a new version — only actual attribute changes)
- **Relationships into a historized entity**: must be explicitly typed as either (a) "as-of" — resolves to whichever version was current at the related record's effective date, or (b) "current-only" — always resolves to the current version; default is "as-of" for transactional relationships and "current-only" for simple lookup/reference relationships, human-confirmable per relationship
- **No mixing within a single entity**: an entity is either fully stable or fully historized — partial/attribute-level historization within one entity is out of scope for this style (that granularity is a Data Vault Satellite concern; if needed, recommend switching that entity's design to Data Vault treatment and flag it)
- **N:M resolution**: same associative-entity approach as 3NF; an associative entity between two historized entities is itself classified independently (usually `historized` if it represents a transactional fact)

## Process
1. Entity Classification: run classification heuristic per entity, produce stable/historized split with rationale
2. Stable-path Normalization: apply 3NF rules identical to the 3NF agent for all `stable` entities
3. Historized-path Versioning Design: define durable key + version key + effective-dating attributes for all `historized` entities; derive change-detection attribute set (which attributes trigger a new version vs. which are corrected in place)
4. Key Design: assign key strategy per entity per its classification
5. Relationship Resolution: resolve every CDM relationship, explicitly typing any relationship touching a historized entity as as-of or current-only
6. Consolidation: merge into one `LogicalDataModel`; flag entities where classification was ambiguous (borderline change frequency) and any relationship where as-of vs. current-only could not be confidently defaulted

## Output Contract: `LogicalDataModel` (Canonical)
```
LogicalDataModel {
  style: "canonical"
  entities: [ {
    entity_name, subject_area, classification: "stable"|"historized",
    attributes: [ { name, definition, data_type_logical, nullable, is_pk, is_fk, triggers_new_version? } ],
    keys: {
      stable: { primary_key{} , alternate_keys[] } |
      historized: { durable_business_key{}, version_surrogate_key, effective_dating_columns[] }
    }
  } ]
  relationships: [ { from_entity, to_entity, cardinality, resolution_type: "as-of"|"current-only"|null, fk_attributes[] } ]
  classification_log: [ { entity, classification, rationale } ]
  flags: [ { entity_or_relationship, issue } ]
}
```

## HITL Gate 3 — Logical Approval
Reviewer sees the logical ERD with stable vs. historized entities visually distinguished, the classification rationale per entity, versioning attribute design for historized entities, and relationship resolution types. Reviewer actions: approve, edit (reclassify an entity, override a relationship's resolution type, adjust keys), or reject with comments.

## Handoff
On approval, `LogicalDataModel` (canonical) routes to `04-physical-data-model-canonical-agent.md`.
