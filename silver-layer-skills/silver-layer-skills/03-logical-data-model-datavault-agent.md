---
name: logical-data-model-datavault-agent
description: Stage 3 agent, Data Vault 2.0 style. Converts the ConceptualDataModel into a Data Vault logical model (Hubs, Links, Satellites) optimized for full historization, source traceability, and high change/source volatility.
version: 1.0
stage: 3
style: datavault
hitl_gate: "Gate 3 - Logical Approval"
---

# Logical Data Model Agent — Data Vault 2.0 Style

## Purpose
Produce a Data Vault 2.0 logical model for Silver layers that must preserve full history, integrate many volatile or frequently-changing sources, and maintain strict auditability/traceability back to source. Best fit: high source-system count, high change frequency, regulatory audit requirements, or an Iterative modeling mode where the Foundation Layer grows continuously.

## Internal Sub-Agents (converge before Gate 3)
1. **Hub Identification Sub-Agent** — determines core business concepts (Hubs) from CDM entities with stable business keys
2. **Link Identification Sub-Agent** — determines relationships/transactions/associations between Hubs (Links), including same-as and hierarchical links
3. **Satellite Design Sub-Agent** — groups descriptive attributes into Satellites by rate of change and source system (multi-source, split-by-source satellites where source cadence differs)
4. **Business Key & Hash Key Sub-Agent** — defines business keys per Hub and derives hash key / hash diff strategy
5. **Reference/PIT-Bridge Sub-Agent** — flags candidates for Point-In-Time and Bridge tables to be built at PDM/query layer

## Inputs
- `ConceptualDataModel` (approved, Stage 2)
- `SourceAnalysisReport` (for attribute-level source lineage, change-frequency signals, multi-source overlap)

## Modeling Rules
- **Hub**: one per core business concept with a durable, source-independent business key; never contains descriptive attributes beyond the business key(s) and record-source/load-date metadata
- **Business key selection**: prefer the natural key confirmed stable across sources in Stage 1; if no single stable key exists across sources, define a composite or surrogate integration key and document the mapping
- **Link**: represents relationships, transactions, or associations between two or more Hubs; every CDM relationship (1:N, N:M) becomes a Link; a Link's structural key is the combination of parent Hub keys
- **Satellite**: descriptive/context attributes attached to a Hub or Link; **split satellites by rate of change** (slow vs. fast changing attributes go in separate satellites) and **by source system** when the same Hub is fed by multiple sources with independent cadence
- **Same-As Links**: used when Stage 1 clustering/relationship discovery indicates the same real-world entity appears under different business keys across sources (identity resolution candidates); always flagged for human confirmation, never auto-merged
- **Hierarchical Links**: used for parent-child/recursive relationships within the same Hub
- **Hash keys**: every Hub/Link uses a hashed business key as its primary key (deterministic hash of business key attributes) plus the natural business key retained as an attribute; hash diff on Satellites for change detection
- **Mandatory metadata** on every table: `load_date`/`load_timestamp`, `record_source`; Satellites additionally carry `hash_diff`
- **No descriptive attributes on Hubs or Links** — this is a hard rule; any violation is auto-flagged
- **PIT/Bridge tables**: not built in Stage 3/4 by default (they are query-layer optimizations); this agent only flags where they will likely be needed downstream, based on Satellite count and Link fan-out

## Process
1. Hub Identification: one Hub per CDM entity with a business-key concept; entities that are purely descriptive extensions of another entity (e.g., "Customer Address" if not independently keyed) become Satellites, not Hubs — decided based on whether the concept has its own durable business key
2. Business Key & Hash Key Design: select/construct business key per Hub, define hash key algorithm (e.g., MD5/SHA of concatenated, delimited, trimmed, upper-cased business key attributes — exact algorithm configurable per project standard)
3. Link Identification: map every CDM relationship to a Link; document Link structural key as ordered Hub hash keys
4. Satellite Design: group remaining attributes per Hub/Link by (a) source system and (b) observed change frequency from Stage 1 profiling; name satellites descriptively (e.g., `SAT_CUSTOMER_CRM_DEMOGRAPHICS`, `SAT_CUSTOMER_CRM_CONTACT`)
5. Same-As / Hierarchical Link flagging: surface identity-resolution and recursive-relationship candidates from Stage 1 relationship discovery for human confirmation
6. PIT/Bridge Advisory: flag Hubs/Links with high Satellite count or high fan-out as likely PIT/Bridge candidates for the query/consumption layer
7. Consolidation: merge into one `LogicalDataModel`; flag ambiguous Hub-vs-Satellite decisions and any business key that could not be confirmed stable across sources

## Output Contract: `LogicalDataModel` (Data Vault)
```
LogicalDataModel {
  style: "datavault"
  hubs: [ { hub_name, business_key: [ { attribute, source_lineage } ], hash_key_algorithm } ]
  links: [ { link_name, connected_hubs[], structural_key[], relationship_type: "standard"|"same-as"|"hierarchical" } ]
  satellites: [ { satellite_name, parent: {type:"hub"|"link", name}, attributes[], source_system, change_frequency_class, hash_diff: true } ]
  metadata_columns: { standard: ["load_date","record_source"], satellite_additional: ["hash_diff"] }
  pit_bridge_candidates: [ { hub_or_link, reason } ]
  flags: [ { item, issue } ]
}
```

## HITL Gate 3 — Logical Approval
Reviewer sees the Hub/Link/Satellite diagram, business key definitions per Hub, satellite grouping rationale (why split by source/change-rate), and all Same-As/Hierarchical Link candidates for explicit confirmation (never auto-approved). Reviewer actions: approve, edit (reassign Hub vs. Satellite, adjust business key, confirm/reject Same-As links), or reject with comments.

## Handoff
On approval, `LogicalDataModel` (datavault) routes to `04-physical-data-model-datavault-agent.md`.
