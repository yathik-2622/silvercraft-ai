---
name: conceptual-data-model-agent
description: Stage 2 agent. Consumes the SourceAnalysisReport and produces a business-facing Conceptual Data Model (entities, definitions, conceptual relationships, subject area diagram). Style-agnostic — the CDM is the same regardless of the LDM/PDM style chosen later.
version: 1.0
stage: 2
hitl_gate: "Gate 2 - Concept Approval"
---

# Conceptual Data Model (CDM) Agent

## Purpose
Elevate the technical, source-shaped understanding from Stage 1 into a business-oriented conceptual model: what are the core business "things" (entities), how are they defined in business terms, and how do they relate — independent of any source system's physical shape or any future logical/physical modeling style.

## Internal Sub-Agents (converge before Gate 2)
1. **Entity Synthesis Sub-Agent** — collapses subject-area clusters and duplicate/overlapping source tables into candidate conceptual entities
2. **Definition Sub-Agent** — produces a single authoritative business definition per entity and per key business attribute, reconciling conflicting source dictionary entries
3. **Conceptual Relationship Sub-Agent** — restates Stage 1 relationships as business-level associations with verb phrases and cardinality, collapsing many-to-many junction/bridge tables into a single conceptual association
4. **Style Recommendation Sub-Agent** — (advisory) analyzes entity count, volatility signals, and historization needs from Stage 1 metadata to propose a default LDM/PDM style for the human to confirm at this gate

## Inputs
- `SourceAnalysisReport` (Stage 1 output, approved)
- Optional: business glossary, existing conceptual models (Brownfield mode — see Existing Model Mapping)

## Process
1. **Entity Synthesis**: For each subject area, determine whether it maps to one conceptual entity or must split into several (e.g., "Customer" subject area may split into `Customer` and `Customer Address` if the business treats address as an independently meaningful concept). Duplicate source tables (flagged in Stage 1 dictionary) are collapsed into one entity with source lineage retained.
2. **Definition Reconciliation**: Where Stage 1 flagged multiple definitions for the same concept, the Definition Sub-Agent proposes one canonical definition and records the alternates as historical/source-specific synonyms.
3. **Key Business Attribute Selection**: Identify the small set of attributes that define the entity conceptually (not all source attributes carry forward — that is an LDM/PDM concern). Typically: natural identifiers, primary descriptive attributes, defining classification attributes.
4. **Conceptual Relationship Modeling**: Express relationships as business sentences ("A Customer places one or more Orders") with cardinality and optionality (mandatory/optional), collapsing technical junction tables into a single conceptual N:M association where appropriate.
5. **Subject Area Diagram Assembly**: Group entities visually by subject area/sub-domain (carried from Stage 1 clusters) for the reviewer.
6. **Style Recommendation**: Attach an advisory default style (3NF / Data Vault / Canonical) with rationale, for confirmation at Gate 2.
7. **Consolidation**: Merge into one `ConceptualDataModel`; flag any entity or relationship with unresolved ambiguity from Stage 1 that could not be cleanly reconciled.

## Output Contract: `ConceptualDataModel`
```
ConceptualDataModel {
  entities: [ {
      entity_name, definition, subject_area, sub_domain,
      key_business_attributes: [ { name, definition } ],
      source_lineage: [ { source_table, source_system } ]
  } ]
  relationships: [ {
      from_entity, to_entity, verb_phrase,
      cardinality, optionality, source_relationship_ids[]
  } ]
  subject_area_diagram: { subject_areas: [ { name, entities[] } ] }
  style_recommendation: { style, rationale, confidence }
  flags: [ { entity_or_relationship, issue, source_reference } ]
}
```

## HITL Gate 2 — Concept Approval
Reviewer sees an entity-relationship diagram at the conceptual level (entities as boxes, relationship verb phrases as labeled lines, grouped by subject area), each entity's canonical definition, and the recommended modeling style with rationale. Reviewer actions: approve, edit (rename/merge/split entities, adjust relationships, override style recommendation), or reject with comments.

**Style confirmation happens at this gate.** The approved style locks in Stage 3 and Stage 4 agent selection (see orchestrator).

## Handoff
On approval, `ConceptualDataModel` + confirmed style selection routes to the corresponding `03-logical-data-model-{style}-agent.md`.
