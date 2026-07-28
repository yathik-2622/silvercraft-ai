---
name: silver-layer-pipeline-orchestrator
description: Top-level orchestrator for the Raw-to-Silver Assisted Data Modeling pipeline. Routes work across four stages (Source Analysis -> Conceptual Data Model -> Logical Data Model -> Physical Data Model), manages style selection, and enforces the four HITL gates.
version: 1.0
---

# Silver Layer Pipeline Orchestrator

## Purpose
Coordinates the end-to-end Raw-to-Silver modeling pipeline. Does not perform modeling work itself — invokes the four stage agents in sequence, passes consolidated artifacts between them, and halts at each HITL gate until human approval is received.

## Pipeline Topology

```
[Raw Sources] 
     |
     v
STAGE 1: SOURCE ANALYSIS  ---------------->  HITL GATE 1 (Foundation Approval)
     |  (profiling, data dictionary,               |
     |   classification, clustering,                | approve / edit / reject
     |   relationship discovery)                    v
     v
STAGE 2: CONCEPTUAL DATA MODEL (CDM) ----->  HITL GATE 2 (Concept Approval)
     |  (entities, subject areas,                    |
     |   conceptual relationships)                   v
     v
STAGE 3: LOGICAL DATA MODEL (LDM)   ------>  HITL GATE 3 (Logical Approval)
     |  (style: 3NF | Data Vault | Canonical)         |
     v                                                v
STAGE 4: PHYSICAL DATA MODEL (PDM)  ------>  HITL GATE 4 (Physical/DDL Approval)
     (style: 3NF | Data Vault | Canonical;
      DDL, keys, indexes, target-platform SQL)
```

## Stage Agent Registry
| Stage | Agent Skill File | Style-Dependent? |
|---|---|---|
| 1 | `01-source-analysis-agent.md` | No |
| 2 | `02-conceptual-data-model-agent.md` | No |
| 3 | `03-logical-data-model-{style}-agent.md` | Yes: `3nf`, `datavault`, `canonical` |
| 4 | `04-physical-data-model-{style}-agent.md` | Yes: `3nf`, `datavault`, `canonical` |

## Style Selection
Modeling style is selected **once**, before Stage 3 begins, and applies to both Stage 3 and Stage 4 (PDM implements the LDM's style — style cannot change between LDM and PDM within a single run).

Style is chosen by:
1. Explicit user selection at project setup, OR
2. A style-recommendation sub-step (see below) that inspects Stage 1/2 outputs and proposes a default, which the human confirms at Gate 2.

### Style Recommendation Heuristic (advisory only, human always decides)
- High source volatility, many source systems, historization/audit priority -> recommend **Data Vault**
- Small-to-medium scope, single dominant source system, straightforward OLTP-style entities -> recommend **3NF**
- Mixed needs (some Data Vault-style historization + simpler normalized areas) -> recommend **Canonical/Hybrid**

## HITL Gate Contract (applies to all 4 gates)
Every gate presents the human reviewer with:
1. The consolidated stage output (never raw sub-agent drafts — see convergence rule below)
2. A confidence/quality summary (coverage %, unresolved ambiguities, assumptions made)
3. Three actions: **Approve** (proceed to next stage), **Edit** (inline correction, re-validated by the stage agent, does not restart the whole stage), **Reject** (stage re-runs with reviewer feedback as additional input)

No stage agent may pass output to the next stage without an Approve action logged against its gate.

## Convergence Rule
Within a stage, sub-agents run in parallel or sequence internally but must **converge into a single consolidated output** before reaching the HITL gate. The human never reviews raw, un-reconciled sub-agent drafts. Conflicts between sub-agents (e.g., classification disagreement, ambiguous relationship cardinality) are resolved by the stage agent's internal reconciliation logic and, if unresolved, surfaced as a flagged "needs human input" item within the single consolidated artifact — not as competing outputs.

## Handoff Artifact Contracts
- Stage 1 -> Stage 2: `SourceAnalysisReport` (see `01-source-analysis-agent.md` Output Contract)
- Stage 2 -> Stage 3: `ConceptualDataModel` (see `02-conceptual-data-model-agent.md` Output Contract)
- Stage 3 -> Stage 4: `LogicalDataModel` (style-specific, see respective LDM agent Output Contract)
- Stage 4 -> downstream (Gold Layer intake): `PhysicalDataModel` + DDL/dbt artifacts

## Failure / Rejection Handling
On Reject at any gate, the orchestrator re-invokes the same stage agent with:
- The original inputs
- The prior consolidated output
- The reviewer's structured feedback (field-level comments where possible)
The stage agent treats prior output as a starting draft, not a blank slate, to avoid redundant rework.
