# ADM 2.0 — Technical Design Specification (First Cut)

**Status:** Final for build
**Scope:** Silver/Foundation layer, Canonical (3NF) style, single end-to-end run
**Timeline:** 4 weeks, 5–6 engineers
**Infrastructure:** Azure (Cosmos DB, Azure AI Search, Azure Blob Storage, Azure Cache for Redis)

---

## 1. Problem Statement

Data modeling for a new source system today requires a data architect to
manually profile source data, classify sensitivity, discover relationships,
derive a conceptual model, choose and apply a modeling methodology, define
keys and relationships, and produce physical DDL — a multi-week, expert-only
process with no consistent audit trail of *why* a given modeling decision
was made.

ADM 2.0's first cut proves this process can be executed by a coordinated set
of AI agents against real source data, with the data architect's judgment
preserved through explicit human-in-the-loop gates — for exactly one
methodology (Canonical/3NF) end-to-end, in production, before more
methodologies are added — and does so without ever retaining a copy of the
user's underlying source data, only the structural/aggregate metadata needed
to model it.

**Out of scope for this cut:** Data Vault, Dimensional, Data Mesh styles;
Tier 2 (single-stage) routing; standalone single-skill execution
(`TaskRunner`/a true `/run`) — **if built later, it must route through the
Orchestrator first**, since the Orchestrator alone owns gathering the
inputs any execution needs; a direct endpoint-to-`TaskWorker` shortcut
would silently skip that responsibility; Execution Contract versioning
chains (single-version only); Learning KB; general-purpose Redis caching
(queue + pub/sub only); Event Bus; MCP tool servers; multi-client override
resolution; Existing Models KB (Stage 3 Step 8 stubbed as a no-op).

---

## 2. Solution Architecture

```
┌──────────┐     ┌─────────┐     ┌──────────────┐     ┌──────────────┐
│  React   │────▶│ FastAPI │────▶│ Orchestrator │────▶│ SolutionAgent│
│UI (chat  │◀────│ (API)   │◀────│ (LangGraph)  │     │ (LangGraph)  │
│composer  │     └────┬────┘     └──────┬───────┘     └──────┬───────┘
│"/" picks │          │ enqueue         │ skill-index          │ enqueue
│attaches  │          ▼                 │ match (Tier 0)       ▼
│skill IDs)│    ┌───────────┐           │                ┌─────────────┐
└──────────┘    │  Azure    │◀──────────┘                │   Celery    │
                 │  Cache    │                             │   Workers   │
                 │for Redis  │                             └──────┬──────┘
                 │(queue+pub/│                                    │
                 │  sub)     │                       ┌────────────┴────────────┐
                 └───────────┘                        ▼                         ▼
                                                 ┌──────────────┐         ┌─────────────┐
                                                 │  TaskWorker  │◀────────│  Cosmos DB  │
                                                 │(create_react │         │+ AI Search  │
                                                 │   _agent),   │         └─────────────┘
                                                 │  per task,   │
                                                 │  parallel    │
                                                 └──────────────┘
```

Note: every entry point — chat message, `/` skill selection, skill import —
passes through the Orchestrator first. There is no shortcut that reaches
`TaskWorker` without the Orchestrator having gathered whatever inputs that
request needs.

**Component list:**

| Component | Type | Owns |
|---|---|---|
| Orchestrator | LangGraph graph | Intent, clarification loop, Tier routing, Tier 0 skill-discovery matching — and gathering every input any downstream execution needs. No entry point (chat message, composer skill-selection, skill import) reaches execution without passing through here first. |
| SolutionAgent | LangGraph graph | Planning (`plan()`), execution (`execute()`) — internally: `_schedule_tasks()` (task batching/worker-count/retries, a method not a class), HITL Manager, Checkpoint (native LangGraph checkpointer). `.plan()` merges any composer-selected skills with its own suggested defaults, showing both in the rendered Plan. |
| TaskWorker | `create_react_agent` instance, spawned per task | Loads one pinned Task Skill (tools declared by the skill, never inferred), executes, validates, returns confidence |
| Context Builder | function | Assembles run-invariant + task-specific context per task |
| Skill Normalizer | constrained-extraction adapter, one Celery task | Maps a user-uploaded, free-form skill description into the exact Task/Workflow Skill schema, without paraphrasing or inventing content |
| Skill KB | 1 Cosmos DB collection, 3 logical kinds | Workflow / Task / Utility skills, versioned, scope-resolved (user > org > default) |
| Modelling Reference KB | Azure AI Search (1 index) | Semantic retrieval, read-only during execution and Tier 0 |

---

## 3. Data Handling & Privacy Policy

This governs every point in the system that touches a user's uploaded file
or live database connection.

### 3.1 Core rule

**No user source data is ever persisted by ADM — not the file bytes, not a
copy in Blob Storage, not an explicit temp file we manage.** Only the
structural and aggregate metadata required to perform modeling is extracted
and stored. This applies uniformly to file uploads, live DB connections, and
user-uploaded skill description files.

### 3.2 What is and isn't "metadata"

| Category | Examples | Persisted? |
|---|---|---|
| Structural | table/column names, inferred data types, row/column counts | ✅ Yes |
| Aggregate statistics | null %, distinct count | ✅ Yes — the number isn't a data value |
| Aggregate but value-derived | min/max | ⚠️ Flagged policy decision — technically a real value from the source (e.g. an actual salary, an actual date), even though framed as a statistic. Persisted by default in this cut; revisit if compliance posture requires dropping it. |
| Literal values | sample values, raw rows, full column contents | ❌ Never persisted |

### 3.3 Mechanics

- **FastAPI's `UploadFile`** (a `SpooledTemporaryFile`: memory-buffered, spills to OS temp disk only above a threshold, auto-deleted at request end) is the *only* buffering used. No additional explicit temp-file writes on top of it — that would be redundant persistence to avoid.
- **CSV/JSON**: streamed chunk-by-chunk via Polars' streaming engine (`pl.scan_csv(...).collect(streaming=True)`), never fully materialized in memory. Chosen over pandas specifically for its lower memory footprint at scale.
- **Excel**: `openpyxl` in `read_only=True` mode with `iter_rows()` against the buffered stream — XLSX's zip-archive format means it needs a seekable stream, but still bounded memory, still never persisted.
- **Running aggregates**: null count and distinct count computed incrementally per chunk. Distinct count falls back to an approximate algorithm (HyperLogLog) above a configured size threshold, bounding memory regardless of file size.
- **DB sources**: fully pushed down as SQL (`COUNT(*)`, `COUNT(DISTINCT col)`, `information_schema` introspection) — actual row data never leaves the source database; only computed stat values return.
- **Stage 1 is the only touch point.** No later stage re-reads the source file or re-queries the source DB for row-level data — everything downstream works off Stage 1's profiling report + data dictionary. Stage 1's Task Skills must therefore capture everything any later task could need; there is no second pass.
- **Skill-upload files** (§6) follow the identical policy: parsed in-memory, discarded after extraction, only the resulting YAML persisted.
- **Two-phase timing, made explicit**: the file is touched exactly once, ever — at **upload time** (`POST /uploads`), synchronously, before any chat/plan/execution activity begins. Structural + aggregate stats are computed and persisted to `raw_files` in that single pass; the file is then gone. Stage 1's `profile_source` Task Skill, which may run minutes later after Plan approval, never re-touches the source — it reads the already-persisted stats from `raw_files`, same as every other downstream stage reads Stage 1's output. This is what makes "Stage 1 is the only touch point" literally true rather than aspirational.

---

## 4. User Flow — pin to pin

1. User opens a project (layer + domain already set at project creation).
2. User starts a chat and either:
   - (a) types a modeling request (e.g. *"Model this as Canonical"*) with files/DB connection, or
   - (b) asks a how-to question (*"how do I do source analysis?"*), or
   - (c) types `/` in the composer to browse and attach a preferred skill to their upcoming request, or
   - (d) uploads their own skill description to import it, or
   - (e) opens the **Skill Library** page independently of chat.
3. **(a) Full modeling request** — if required info is missing (style, or no source at all), the UI asks inline, one question at a time, never assuming. Once complete: Plan artifact renders (stages, tasks, dependencies, default HITL per task, `Preview Skill` shown per task). User edits/swaps skills/adds overrides, then **Approve**. Live stage progress (`Stage 1 ✅ → Stage 2 🔄 → ...`) persists across refresh. HITL review cards surface inline as gates fire. On completion: final artifacts + Skill Provenance Report, then explicit **Download / Push to Git** actions.
4. **(b) How-to question** — Orchestrator answers conversationally *and*, if the question matches a known skill, renders that skill's **Preview card** (purpose, tools, HITL mode, version) plus the `/<skill_id>` composer shortcut to select it — same card component as everywhere else in the product.
5. **(c) `/<skill_id>` in the composer** — this is a **skill-selection aid for planning, not an execution trigger.** Typing `/` opens an autocomplete of catalog skills; selecting one attaches it to the outgoing message as a preferred skill for that task. The message still goes through the Orchestrator exactly like any other message — nothing bypasses it. Once it reaches `SolutionAgent.plan()`, the resolved Plan shows the user's selected skill **alongside** the planner's own suggested default for that same task, with the user's pick pre-selected but the alternative still visible and swappable before approval.
6. **(d) Import a skill** — user uploads a free-form skill description. `Skill Normalizer` maps it into the exact schema without altering its content. Any field it couldn't find becomes a clarifying question from the Orchestrator. Once complete, shown as a Preview card for approval, then persisted at `scope: user` (highest resolution priority) — immediately visible in the Skill Library and selectable via `/<skill_id>` for future plans.
7. **(e) Skill Library page** — browsable/searchable list of every skill (filter by kind: workflow/task/utility; by scope: global/org/user). Each entry expands into the same formatted Preview card and shows its `/<skill_id>` composer shortcut. An **"Import your own skill"** button starts flow (d) directly from this page.

---

## 5. Backend Flow — pin to pin, with HITL gates marked

| # | Trigger | Component | What happens | Reads from | Writes to |
|---|---|---|---|---|---|
| 0 | `POST /uploads` | FastAPI | Streams the file once (never persisted), computes structural+aggregate stats in one pass, discards the file, persists only the thin registration record. Runs inline — pure deterministic computation, not agent/LLM logic, so it doesn't need Celery (§8's FastAPI/Celery boundary is about never running LLM calls inline, not about never doing any computation inline). Returns `raw_file_id` for the client to attach via a message's `file_refs`. | uploaded file (streamed, discarded) | `raw_files` |
| 1 | `POST /chats/{id}/messages` | FastAPI | Persist message, enqueue `orchestrator_task`, return 202 | `chats` | `chats` |
| 2 | Celery picks up `orchestrator_task` | Orchestrator | Extract intent against `projects` metadata (layer/domain already known); check for missing info | `projects`, `chats` | — |
| 2a | — | Orchestrator | Missing info → clarifying question, publish via Redis Pub/Sub, task ends, waits for next message | — | `chats` |
| 2b | — | Orchestrator | Tier 0 (conversational) → retrieve from Modelling Reference KB (Azure AI Search) **and** check the full skill index (all skill titles/purposes/HITL modes, held directly in context — no vector search needed at this skill count) for a matching skill → render answer + optional Preview card + command | `modeling_reference` (AI Search), `skills` (Cosmos, exact lookup, small index loaded whole) | `chats` |
| 2c | — | Orchestrator | `/`-selected skill(s) attached to the message → carried forward as `user_selected_skills`, still goes to `plan_task` (Tier 3) as normal — selection alone doesn't trigger execution | — | — |
| 2d | — | Orchestrator | Skill import file detected → enqueue `normalize_skill_task` | — | — |
| 2e | — | Orchestrator | Full modeling request (Tier 3) → enqueue `plan_task`, carrying `user_selected_skills` if any were attached | — | — |
| 3 | Celery picks up `plan_task` | SolutionAgent `.plan()` | Resolve Workflow Skill (scope priority user > org > default). Pull its Task/Utility Skills — each skill's `tools:` field read directly, never inferred. **For any task where the user attached a `/`-selected skill, include it in the Plan alongside the planner's own suggested default for that same task — both shown, user's pick pre-selected, alternative still swappable.** Build draft Execution Contract v1. Render Plan. | `skills`, `db_connections`, `raw_files` (schema only, no content) | `execution_contracts` (draft), `chats` |
| 4 | `PATCH /contracts/{id}` (0..N) | FastAPI | Persist user edits directly — plain write, no Celery | `execution_contracts` | `execution_contracts` |
| 5 | `POST /contracts/{id}/approve` | FastAPI | Denormalize the plan into an **immutable, fully self-contained, pinned** Execution Contract. Enqueue `execute_contract_task`. | `execution_contracts` | `execution_contracts` (status: approved) |
| 6 | Celery picks up `execute_contract_task` | SolutionAgent `.execute()` | Drives the Stage 1→4 loop, **one Celery task for the whole run**, pausable/resumable via LangGraph's native checkpointer | `execution_contracts` | `run_state` |
| 6a | Stage entry | `SolutionAgent._schedule_tasks()` | Decide sequential vs. parallel from actual (streamed, never fully loaded) input size | `run_state` | — |
| 6b | Per task | Context Builder | Run-invariant context (cached) + task-specific context (fresh, per task) | `business_standards`, `modeling_reference` | — |
| 6c | Per task | Parallel fan-out via LangGraph `Send` (in-process, §8) | One `TaskWorker` per task/partition, loading its one pinned skill | `skills` (by `task_id` + version) | — |
| 6d | Per task | TaskWorker | Executes with declared tools only, validates, returns confidence. **For Stage 1 tasks specifically**: reads the already-persisted stats from `raw_files` (computed once, at upload time via row 0 — Stage 1 does not re-touch the source file). **For Stage 2–4 tasks**: reads only Stage 1's profiling report and data dictionary output, per §3.3's "Stage 1 is the only touch point" rule. | native tools (§9); `raw_files` (Stage 1 only) | — |
| 6e | Per task | Utility Skill `merge_results` | Merges partitioned outputs | — | — |
| 6f | Per task | HITL Manager | Routes by the task's declared `hitl` block: auto / confidence_gated / mandatory | — | `run_state`, checkpoint |
| 6g | `POST /contracts/{id}/hitl/{task_id}/approve\|edit` | FastAPI | Approve: final. Edit: **new snapshot**, `user_override: true`, original untouched. Enqueue `resume_contract_task`. | — | `run_state` |
| 6h | Celery picks up `resume_contract_task` | SolutionAgent | Resumes from exact checkpoint | checkpoint store | `run_state` |
| 6i | Repeat 6a–6h | — | Until Stage 4 complete | — | — |
| 7 | All stages done | SolutionAgent | Generate Skill Provenance Report, persist final artifacts | `run_state` | `provenance_reports`, `artifact_registry` |
| 8 | `POST /contracts/{id}/push-to-git` | FastAPI | Enqueue `git_push_task` (stateless — loads persisted artifact, no live SolutionAgent needed) | `artifact_registry` | Git remote |
| 9 | `GET /contracts/{id}/download` | FastAPI | Direct file response, no Celery | Blob Storage (generated artifacts only) | — |
| 10 | `POST /skills/import` (file upload) | FastAPI | Streams/parses in-memory (§3 policy applies here too), enqueues `normalize_skill_task` | — | `skill_drafts` |
| 11 | Celery picks up `normalize_skill_task` | Skill Normalizer | Constrained-extraction LLM call: map content to schema, never invent — missing required fields go to `missing_fields`, not fabricated values | uploaded content (streamed, discarded) | `skill_drafts` |
| 11a | If `missing_fields` non-empty | Orchestrator | Asks the user those specific fields in chat | `skill_drafts` | `chats` |
| 12 | `POST /skill-drafts/{id}/approve` | FastAPI | Moves draft to `skills` at `scope: user` | `skill_drafts` | `skills` |

### HITL gate table (Canonical/3NF, first-cut defaults)

| Task Skill | Stage | Default HITL mode | Why |
|---|---|---|---|
| `discover_relationships` | 1 (shared) | **mandatory** | Identity resolution must never silently auto-merge |
| `classify_sensitivity` | 1 (shared) | confidence_gated | Correctable, not catastrophic |
| `profile_source`, `build_data_dictionary`, `cluster_subject_areas` | 1 (shared) | auto | Mechanical, low-risk |
| `generate_conceptual_entities` | 2 (shared) | auto | Reviewed implicitly at Stage 3 |
| `generate_conceptual_relationships` | 2 (shared) | confidence_gated | Judgment call, correctable downstream |
| `classify_entity_role` | 3 (Canonical) | confidence_gated | Correctable |
| `derive_keys` | 3 (Canonical) | **mandatory** | Irreversible downstream impact |
| `resolve_relationships` | 3 (Canonical) | auto | Mechanical once keys are set |
| `generate_ddl` | 4 (Canonical) | **mandatory** | Final structural output |
| `generate_sttm` | 4 (Canonical) | confidence_gated | Documentation artifact |

*(3NF has no historization/SCD step — confirmed against the golden test kit.)*
*There is no standalone execution path this cut, so there's no HITL-bypass surface to worry about — every task's output is reviewed exactly where this table says it is, always inside a full Tier 3 run.*

---

## 6. UI Requirements — Skill Library page

A page independent of any chat, reachable from the main navigation.

- **List/grid of every skill**, filterable by kind (Workflow / Task /
  Utility) and by scope (Global / Org / User), searchable by title/purpose.
- **Each entry expands into a formatted Preview card**:
  - Purpose (plain-language summary)
  - Prompt (full text, or a collapsible summary for long prompts)
  - Tools Allowed (as declared on the skill — not inferred)
  - Expected Output / Validation
  - HITL Mode + the reason it's set that way
  - Version, Scope, last-modified
- **Exact composer shortcut shown on every skill entry**: `/<skill_id>`.
  Typing this (or picking it from the `/` autocomplete) in the chat composer
  attaches that skill as a **preferred selection for the user's next
  planning request** — it does not execute anything by itself, and it does
  not skip the Orchestrator. Workflow Skills use the same mechanism at the
  workflow level.
- **"Import your own skill" button** — uploads a file, triggers the Skill
  Normalizer flow (§5, rows 11–13), lands the user back on this page once
  approved, now showing their new `scope: user` skill with its shortcut.

### Chat command convention

- Natural language remains the primary interface for everything — Tier 0
  Q&A, full Tier 3 modeling requests, skill import.
- `/<skill_id>` in the composer is a **skill-selection aid, not an
  execution command.** It attaches a preferred skill to the user's next
  request. That request still goes to the Orchestrator exactly like any
  other message; `SolutionAgent.plan()` then shows the user's selection
  **alongside** its own suggested default for that task in the rendered
  Plan — visible, pre-selected, never silently substituted.
- **Standalone single-skill execution is explicitly out of scope for first
  cut** (§1). If it's added later, it must be routed through the
  Orchestrator first, exactly like every other entry point — the
  Orchestrator is the one component responsible for gathering whatever
  inputs a task actually needs (source reference, connection details,
  etc.). A direct endpoint-to-`TaskWorker` shortcut would silently skip
  that responsibility, which is why it isn't built that way even later.

---

## 7. Data sourcing map — "what reads from where"

| Consumer | Reads | Store type |
|---|---|---|
| Orchestrator | Project metadata, chat history | Cosmos DB (exact lookup) |
| Orchestrator (Tier 0) | Modelling Reference KB | Azure AI Search |
| Orchestrator (Tier 0 skill match) | Full skill index (small, held in-context) | Cosmos DB (exact lookup) |
| SolutionAgent `.plan()` | Skill KB, `db_connections`, `raw_files` schema only | Cosmos DB (exact lookup) |
| Context Builder (run-invariant) | `business_standards`, resolved skill content | Cosmos DB (exact lookup) |
| Context Builder (task-specific) | Modelling Reference KB | Azure AI Search |
| TaskWorker | Its own pinned Task Skill only | Cosmos DB (exact lookup) |
| TaskWorker (Stage 1) | Already-persisted stats in `raw_files` (computed once at upload time, row 0) — or live DB query (pushed-down aggregates) for DB sources | Cosmos DB (exact lookup) / live DB, never re-touches the file |
| Skill Normalizer | Uploaded skill description (streamed, discarded) | In-memory stream, never persisted |
| `push_to_git` | Final persisted artifact | `artifact_registry` → Git remote |

---

## 8. Tech stack summary

### Datastores

| Store | Purpose | Count |
|---|---|---|
| Azure Cosmos DB (NoSQL API) | Operational + exact-lookup collections | **1 account, 15 collections** (below) |
| Azure AI Search | Semantic retrieval | **1 index** (`modeling_reference`) — Existing Models KB explicitly not built this cut |
| Azure Cache for Redis | Celery broker/backend **and** WebSocket Pub/Sub | **1 instance, 2 logical uses, 0 general caching** |
| Azure Blob Storage | **Generated artifacts only** (DDL/STTM/JSON) — never user source data | 1 container, no lifecycle rules yet |

**The 15 Cosmos DB collections:**
`users`, `projects`, `chats`, `raw_files` (thin registration: name/type/
schema — no content), `parsed_chunks`, `db_connections`, `skills` (`kind:
workflow\|task\|utility` × `scope: global\|project\|user` as indexed
fields), `skill_drafts` (pending Skill Normalizer output), `business_
standards`, `execution_contracts`, `run_state`, `artifact_registry`,
`modeling_reference` (AI Search-backed), `provenance_reports`,
`agent_checkpoints` (LangGraph's native checkpointer schema).

### Agent framework

| Element | First-cut usage |
|---|---|
| **LangGraph graphs** | **2**: Orchestrator Graph; SolutionAgent Graph (plan → approval interrupt → stage loop with `Send` fan-out → HITL interrupts → complete). |
| **`create_react_agent`** | Used for **every `TaskWorker`** — one instance per task, system prompt = that task's pinned skill prompt, tools = that skill's declared native tools |
| **Deep Agents** | **Not used.** The Workflow Skill already declares the task list deterministically; SolutionAgent's explicit LangGraph state machine already gives checkpointed, resumable execution. Introducing open-ended planning would reduce the determinism the reproducibility guarantees depend on. |
| **Native Python tools** | `csv_excel_parser` (Polars streaming / openpyxl read-only), `sql_db_connector`, `db_metadata_introspector`, `profiling_stats` (streaming aggregates, HyperLogLog above threshold), `ddl_generator`, `diff` (also the CI golden-kit assertion mechanism), `merge_results`, `git_publish`, `skill_normalizer_extract` |
| **MCP-based tools** | **Zero.** `type: native \| mcp` exists on the Tool Registry schema for future connectors; unused this month. |
| **Vector search as a tool** | Not exposed to the react agent directly — Context Builder retrieves deterministically before the TaskWorker runs. |

### API / Compute boundary

| Layer | Responsibility | Never does |
|---|---|---|
| **FastAPI** | Validates requests, persists straightforward writes, enqueues Celery tasks, serves downloads, streams progress via Redis Pub/Sub | Never runs an LLM call or agent logic inline |
| **Celery** | Runs every agent/LLM-touching unit of work | Never invoked directly from the UI |

**Celery task types (6):** `orchestrator_task`, `plan_task`,
`execute_contract_task`, `resume_contract_task`, `git_push_task`,
`normalize_skill_task` (Skill Normalizer).

---

## 9. Where the multiple "spins" actually happen

One parallelism mechanism, not two stacked:

- `execute_contract_task` is **one Celery task, one process**, for the
  whole run, pausing (not blocking) across HITL interrupts via LangGraph's
  checkpointer.
- Within that process, `SolutionAgent._schedule_tasks()` uses **LangGraph's
  native `Send` API** to fan out N `TaskWorker` instances as **concurrent
  async branches in that same process** — not N separate Celery tasks, not
  N separate containers.
- `run_task_task` (TaskRunner) — removed from first-cut scope, per §1; not
  a parallelism concern this month.
- Graduating stage-level fan-out to real Celery `group()`/multi-process
  parallelism is the correct next step once data volumes justify it
  (hundreds of source tables) — additive later, not required now.

---

## 10. Final summary counts

| Metric | Count |
|---|---|
| Cosmos DB collections | 15 |
| Azure AI Search indexes | 1 |
| Redis instances | 1 (queue + pubsub only) |
| LangGraph graphs | 2 (Orchestrator, SolutionAgent) |
| `create_react_agent` instances | 1 per task, spawned dynamically |
| Deep Agents used | 0 |
| Celery task types | 6 |
| Native Python tools | 9 |
| MCP tools | 0 (schema-ready, unused) |
| Modeling styles shipped | 1 (Canonical/3NF) |
| Standalone execution entry points that bypass the Orchestrator | **0** |
| Generic agent classes in code | 2 (`Orchestrator`, `SolutionAgent`) + 1 execution primitive (`TaskWorker`) + 1 constrained-extraction adapter (`Skill Normalizer`) — **zero per-style agent classes** |
| User source data persisted at rest | **0 bytes** — structural/aggregate metadata only, min/max flagged as an open policy call |
