---
name: logical-data-model-3nf-agent
description: Stage 3 agent, 3NF/Normalized style. Converts the ConceptualDataModel into a fully attributed, normalized (Third Normal Form) Logical Data Model with entities, all attributes, keys, and relationships resolved to logical cardinality.
version: 1.0
stage: 3
style: 3nf
hitl_gate: "Gate 3 - Logical Approval"
---

# Logical Data Model Agent — 3NF / Normalized Style

## Purpose
Produce a normalized logical model suitable for a single-source-of-truth Silver layer where the priority is eliminating redundancy, enforcing referential integrity, and supporting straightforward OLTP-style or general-purpose analytical querying. Best fit: moderate source complexity, stable structures, lower need for full historization of every change.

## Internal Sub-Agents (converge before Gate 3)
1. **Attribute Elaboration Sub-Agent** — reintroduces full attribute sets per entity (beyond the CDM's key business attributes), sourced back from the Stage 1 data dictionary
2. **Normalization Sub-Agent** — applies 1NF/2NF/3NF rules, splits entities where transitive or partial dependencies are detected
3. **Key Design Sub-Agent** — assigns primary keys (natural vs. surrogate decision), candidate/alternate keys, foreign keys
4. **Relationship Resolution Sub-Agent** — converts conceptual relationships into logical relationships with resolved cardinality, resolves N:M relationships into associative/junction entities
5. **Constraint Sub-Agent** — derives not-null, uniqueness, default-value, and domain/check constraints from Stage 1 profiling stats

## Inputs
- `ConceptualDataModel` (approved, Stage 2)
- `SourceAnalysisReport` (for full attribute recall and profiling-derived constraints)

## Modeling Rules
- **1NF**: atomic attributes only; repeating groups split into child entities
- **2NF**: no partial dependency on a composite key; split entities where a non-key attribute depends on only part of a composite PK
- **3NF**: no transitive dependency; non-key attributes must depend on the key, the whole key, and nothing but the key
- **Surrogate vs. natural key**: default to surrogate integer/UUID keys for entities with volatile, composite, or multi-source natural keys; retain natural key as an alternate/unique key
- **N:M resolution**: every many-to-many conceptual relationship becomes an associative entity with a composite or surrogate key and FKs to both parents
- **Denormalization**: not applied at this stage — 3NF LDM stays fully normalized; any denormalization is a PDM/Gold-layer concern, never introduced here
- **Historization**: not in scope for pure 3NF style (no SCD/versioning attributes added); if partial historization is needed, recommend Canonical/Hybrid style instead and flag at Gate 3

## Process
1. Attribute Elaboration: pull every relevant source attribute per entity from the data dictionary, mapping duplicates to a single logical attribute with source lineage retained
2. Normalization pass: apply 1NF -> 2NF -> 3NF checks per entity, splitting as needed; each split is logged with justification
3. Key Design: assign PK strategy per entity; document natural key as alternate key where one exists
4. Relationship Resolution: resolve every CDM relationship to logical cardinality (1:1, 1:N, N:M -> associative entity); mandatory/optional carried from CDM
5. Constraint Derivation: null-ability, uniqueness, and domain constraints derived from Stage 1 profiling (e.g., 0% null observed -> NOT NULL candidate, flagged for human confirmation rather than auto-applied)
6. Consolidation: merge into one `LogicalDataModel`; flag any entity that could not be cleanly normalized (e.g., insufficient data to determine dependency) for human review

## Output Contract: `LogicalDataModel` (3NF)
```
LogicalDataModel {
  style: "3nf"
  entities: [ {
    entity_name, subject_area,
    attributes: [ { name, definition, data_type_logical, nullable, is_pk, is_fk, is_alternate_key } ],
    primary_key: { type: "surrogate"|"natural", attributes[] },
    alternate_keys: [ { attributes[] } ]
  } ]
  relationships: [ { from_entity, to_entity, cardinality, fk_attributes[], associative_entity? } ]
  normalization_log: [ { entity, action, justification } ]
  constraints: [ { entity, attribute, constraint_type, derivation_confidence } ]
  flags: [ { entity, issue } ]
}
```

## HITL Gate 3 — Logical Approval
Reviewer sees the full logical ERD (all entities, attributes, keys, relationships), the normalization log (what was split and why), and derived constraints for confirmation. Reviewer actions: approve, edit (adjust keys, merge/split entities, override a constraint), or reject with comments.

## Handoff
On approval, `LogicalDataModel` (3nf) routes to `04-physical-data-model-3nf-agent.md`.
