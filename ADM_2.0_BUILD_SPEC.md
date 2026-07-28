# ADM Agent Studio 2.0 — Full Build Specification

**Status:** Design-approved, ready for implementation
**Audience:** AI coding agents (Claude Code, Codex, Antigravity, Cursor) + engineering team
**Companion docs:** `__ADM_DOCUMENTATION__.docx` (25-step Foundation + 18-step Product step reference), `adm_silver_kg_v2.py` (KG ontology, 27 node levels), 7 builtin skill markdown files, nine-layer RAG architecture (pending separate approval before implementation)

---

## 0. Non-negotiable design principles

1. **UI-visible stages ≠ execution steps.** The person sees 4 HITL gates per layer (8 total). Underneath, all 43 documented steps (25 Foundation + 18 Product) execute exactly as specified in `__ADM_DOCUMENTATION__.docx`, and every KG node/edge write in `adm_silver_kg_v2.py` fires per-step, unaffected by gate count.
2. **Cloud-agnostic core.** No cloud-provider SDK in the pipeline. Celery + Redis + S3-compatible object storage, deployable on any cloud or bare metal. Cloud decision deferred to deployment phase only.
3. **API never executes agents inline.** API enqueues Celery tasks; workers execute; WebSocket/Redis pub-sub streams progress back.
4. **LangGraph is the execution backbone.** A2A is the extensibility boundary for other frameworks (CrewAI, Agno, OpenAI Agents SDK) — they're invoked as remote agents by URI, never natively embedded. MCP is the tool/context-access layer for all agents regardless of framework.
5. **Design-first governs this doc too.** Nothing here is final code — it's the contract an AI coding agent should implement against. Where an implementation detail is genuinely open, it's flagged `[OPEN]` rather than guessed.

---

## 1. UI Specification

### 1.1 Page: Login
- Standard auth (email/password + SSO stub for enterprise later). Session issues JWT; refresh token pattern.
- On success → Dashboard.

### 1.2 Page: Dashboard
- **Header:** user avatar/name, **Settings** icon.
- **Settings modal:**
  - LLM Provider (BYO-key): provider dropdown (OpenAI, Anthropic, Azure OpenAI, Bedrock, self-hosted/OpenAI-compatible endpoint), API key field (encrypted at rest — see §5.6), model name, default temperature. Multiple provider profiles storable; one marked default.
  - Profile settings (name, password).
- **Body:** two tabs — **My Projects** / **Shared Projects** — each a card grid (name, domain/subdomain, layer badge, last-modified, member avatars, role badge).
- **Create Project** button → modal:
  - Project name (required)
  - Domain (dropdown, extensible list — Insurance, Finance, Retail, Healthcare, etc.)
  - Subdomain (free text or dependent dropdown on Domain)
  - Layer: **Foundation Layer** | **Product Layer** (radio/dropdown — determines which 4-stage pipeline this project runs)
  - Description (free text, optional)
  - Team members: multi-select user picker + role per member (Owner is implicit creator; assignable roles: `editor`, `viewer` — see §5.2 RBAC)
  - Submit → creates project record (§5.1), redirects to Project Workspace (§1.3)
- Project card → **Edit** (owner/editor only): rename, change description, **add/remove members** (this is the CRUD path referenced — owner can edit membership post-creation, not just at creation time).

### 1.3 Page: Project Workspace (Chat + Canvas)
Two-pane layout, resizable split.

**Left pane — Chat**
- Threaded conversation with the **Master Orchestrator** agent.
- Message composer supports:
  - Plain text
  - File attach (multi-file) → triggers upload flow (§4.5)
  - `/` command palette (see §3.4) — skill selection, skill creation, artifact download, DB connect
- Orchestrator's first-turn behavior on a new task: if the person states a goal without specifying source type, Orchestrator **must ask** (via structured quick-reply, not just prose) whether the source is file upload or DB connection, before proceeding. This is a formal `IntakeAgent` subgraph, not ad-hoc prompting — see §3.1.
- Inline HITL gate cards appear in the chat stream when a stage completes (see §1.4) — clicking one opens/focuses the canvas on that stage's output.
- Chat history fully persisted (Mongo) and scrollable; supports resuming a session after logout.

**Right pane — Canvas (SQLDBM-style, artifact-type-aware)**
Not a generic JSON viewer. Renders per artifact type, bound to the same LogicalModel/PhysicalModel JSON structure that feeds the KG:
- **ERD / relationship view** — entity boxes, PK/FK lines, cardinality labels (Stage 1 relationships, Stage 3 logical relationships)
- **Attribute grid** — per-entity column list with data type, PK/FK flags, classification tags, SCD markers (Stage 3)
- **STTM grid** — source→target mapping table, sortable/filterable (Stage 4 / Product Stage 4)
- **DDL/DML viewer** — syntax-highlighted, per-table tabs, copy/download
- **KG lineage view** — read-only graph view of a table's journey through the 27 KG levels (post-push-to-KG only)
- Canvas is editable: person can directly edit an entity name, add/remove a relationship, override an SCD type, etc. Edits write to the **same session-state document** that agent output writes to — canvas edit and agent output are the same code path (§3.6), so downstream HITL/regeneration logic doesn't need to distinguish "who changed this."
- **Save** persists edits to session state (does not auto-advance the stage).
- **On-the-fly skill override**: canvas (or chat) allows selecting a different skill for one specific upcoming step without altering the rest of the pipeline config — e.g., swap the concept-generation skill for one stage's re-run only.

### 1.4 HITL Gate UX
- One gate per stage (8 total across both layers — see §2 for the full mapping table already agreed).
- On stage completion, chat shows a **gate card**: stage name, summary stats (e.g., "8 entities, 34 attributes, 6 relationships identified"), **Approve**, **Edit in Canvas**, **Regenerate** buttons.
- **Approve** → advances pipeline, triggers next stage's Celery task chain.
- **Edit in Canvas** → focuses canvas, person edits, **Save**, then **Approve** becomes available.
- **Regenerate** → two modes:
  - *Regenerate whole stage* (full re-run of all steps in the stage)
  - *Regenerate from step N* (partial — re-runs only the sub-step downstream of a flagged issue; see §3.6 for dependency rules per stage)
- Because a stage gate can represent up to 10 underlying steps (Foundation Stage 3), canvas must section the review into collapsible per-concern blocks (entities / keys / SCD / relationships) rather than one flat dump.
- Final gate (Foundation G4 / Product G4) includes a **Push to KG** action (owner-only) — triggers `adm_silver_kg_v2.py`-equivalent ingestion Celery task.

### 1.5 Slash command grammar (`/`)
| Command | Effect |
|---|---|
| `/skill list` | Shows builtin + project_shared + own project_private skills, searchable |
| `/skill use <name>` | Applies skill to current/next step |
| `/skill create` | Opens skill-creation modal (§3.3) |
| `/skill enhance <name>` | Opens enhance flow on an existing skill |
| `/skill download <name>` | Downloads skill markdown as artifact |
| `/connect db` | Opens DB connection modal (§4.6) |
| `/upload` | Opens file upload modal |
| `/download <artifact-name>` | Downloads a generated artifact (DDL, STTM xlsx, JSON model, etc.) by name/fuzzy match |
| `/workflow custom` | Switch to Custom Workflow mode (§3.7) — build own agent DAG or describe a goal for auto-assembly |

---

## 2. Stage → Gate → Step Mapping (locked)

**One HITL gate per stage. 4 gates for Foundation Layer, 4 for Product Layer = 8 total.** All steps within a stage auto-chain with zero intermediate pauses.

### Foundation Layer

| Gate | Stage | Steps auto-chained (per `__ADM_DOCUMENTATION__.docx`) | KG levels touched (per `adm_silver_kg_v2.py`) |
|---|---|---|---|
| **G1** | Source Analysis | 1.1 Import → 1.2 Profile → 1.3 Dictionary → 1.4 Classification → 1.5 Domain → 1.6 PKs → 1.7 Relationships | L5–L11 (SourceTable → SourceRelationship) |
| **G2** | Conceptual Modeling | 2.1 Generate Concepts → 2.2 Generate Relationships | L12–L13 |
| **G3** | Logical Modeling | 3.1 Type Selection → 3.2 Standardize Names → 3.3 Entity Role → 3.4 Map Attributes → 3.5 Classify → 3.6 Identify Keys → 3.7 Review SCD → 3.8 Map to Enterprise Model → 3.9 Generate Relationships → 3.10 Resolve M:N | L14–L21 |
| **G4** | Physical Modeling | 4.1 Surrogate Keys → 4.2 Standardize Names → 4.3 Transformations → 4.4 Generate STTM → 4.5 DDL/DML → 4.6 Download Artifacts | L22–L27 + push-to-KG |

### Product Layer

| Gate | Stage | Steps auto-chained |
|---|---|---|
| **G1** | Silver Insights | Source connection (Bronze/Silver/Metastore) → normalize → preview |
| **G2** | KPI Discovery | Discover KPIs → Finalise KPI → Functional Area → Business Process → Use Case → Grain |
| **G3** | KPI Finalization | Base/Calc KPI split → Map Source Entities → Generate Calculations → Review Entities & Attributes → Identify PKs → Generate Relationships |
| **G4** | Physical Modeling | Standardize Names → Generate STTM → DDL/DML → Finalise KPI Logic → Download Artifacts |

**Total: 8 gates, 43 steps, 27 KG node levels — all fire exactly as documented.**

---

## 3. Agent Architecture

### 3.1 IntakeAgent (formal subgraph, runs before any pipeline stage)
Not ad-hoc chat logic. A named LangGraph node/subgraph that always executes first per new task and outputs a structured, validated `ProjectContext` object.

```
ProjectContext = {
  source_type: "file" | "db",
  source_ref: { blob_uris: [...] } | { connection_id: str },
  existing_model_ref: str | null,       // enterprise model to map against (Step 3.8)
  target_dialect: "snowflake" | "postgres" | "sqlserver" | "bigquery" | ...,
  naming_convention_skill_ref: str,     // skill id, defaults to builtin naming-convention-enforcement
  modeling_style_skill_ref: str,        // kimball-dimensional | data-vault-2 | canonical-3nf | data-mesh-domain-product
  layer: "foundation" | "product",
  workflow_mode: "default" | "custom",
  custom_dag: object | null             // only if workflow_mode = custom
}
```
IntakeAgent's job: ask the person (via chat quick-reply UI, not free-form prose parsing) for any field it can't infer, validate the result, and hand `ProjectContext` to the Orchestrator. This is what "orchestrator should ask what exactly it needs" formalizes into — a deterministic slot-filling subgraph, not implicit reasoning per turn.

### 3.2 Master Orchestrator
- Receives `ProjectContext`, assembles the Celery task chain for the pipeline (Default Workflow = fixed 4-stage sequence per layer; Custom Workflow = person-built DAG or goal description the Orchestrator auto-assembles into a DAG — §3.7).
- Delegates each stage's steps to the 24 specialized sub-agents (per `ADM_AGENTS_OUTPUTS__Silver_1.csv` contract — agent name + `session_json` schema is the authoritative output contract per agent type; the KG ontology is driven by these actual shapes, not hardcoded logic).
- After each stage's steps complete, emits the gate card to chat and pauses via LangGraph `interrupt()`.
- On resume (approve/edit/regenerate), continues the chain or re-invokes the flagged sub-step range.

### 3.3 Skill system
**Scope model (3 tiers):**
| Scope | Visibility | Example |
|---|---|---|
| `builtin` | All projects, all users | 7 seed skills (kimball-dimensional, data-vault-2, canonical-3nf, data-mesh-domain-product, pii-classification-heuristics, naming-convention-enforcement, scd-temporal-best-practices) |
| `project_shared` | All members of the project | A skill the creator explicitly shares |
| `project_private` | Creator only, within that project | Default state on creation; promotable to `project_shared` |

**Creation flow:**
1. Person uploads a skill file (or types raw instructions) via `/skill create`.
2. A dedicated **SkillGeneratorAgent** (sub-agent, not the Orchestrator) parses the input and fills the placeholder template (same structural contract as the 7 builtin skill `.md` files — frontmatter + sections).
3. **Enhance** option — SkillGeneratorAgent proposes edits/expansions (e.g., missing edge cases, clearer heuristics); person accepts/rejects inline, diff-style.
4. Save → creates `skills` doc (Mongo, §5.1) scoped `project_private` by default, tagged with owner name + skill title, visible in that project's `/skill list` for the owner immediately, for other members only after promotion to `project_shared`.
5. Skill content is versioned (`version` int increments on edit) — agent-output determinism caching (Tier 1/2, already-designed three-tier lookup) keys partly off skill content hash, so a skill edit correctly invalidates cached outputs that depended on the old version.

### 3.4 Framework boundary (A2A / MCP)
- **LangGraph**: native execution for all 24+ ADM sub-agents.
- **MCP**: tool/context access for any agent (DB connectors, file readers, vector search, web search if enabled) — open protocol, same as documented in the original requirements.
- **A2A**: the only path for CrewAI / Agno / OpenAI Agents SDK / other-framework agents. They're registered as remote agents by URI in the agent registry; the Orchestrator delegates via A2A call, receives a structured result, and treats it identically to a native LangGraph sub-agent's output for KG ingestion purposes. This keeps the execution core to one framework while satisfying "if possible" support for the others without owning five SDKs' failure modes.

### 3.5 HITL gate mechanics (LangGraph)
- Each gate = one `interrupt()` call at the end of the stage's step chain.
- Interrupt payload = the full stage output object (all steps' combined `session_json`-equivalent output).
- Resume payload = `{decision: "approve" | "edit" | "regenerate", edited_state?: object, regenerate_from_step?: str}`.
- Checkpointer: Mongo-backed LangGraph checkpointer (not the default in-memory) so gate state survives process restarts — this is required given Celery workers are stateless/ephemeral. See `langgraph_checkpoints` collection, §4.2.

### 3.6 Regeneration dependency rules (per stage — needed because a stage gate can hide up to 10 steps)
When a person edits or flags an issue at one step within a stage (e.g., Step 3.4 Map Attributes, inside the Logical Modeling gate), the system must know which downstream steps within that same stage need to re-run:

| Stage | Step edited | Must re-run downstream (same stage) |
|---|---|---|
| Source Analysis | 1.2 Profile | 1.3, 1.4, 1.5, 1.6, 1.7 (all depend on profile output) |
| Source Analysis | 1.4 Classification | none downstream depend on it directly (safe patch-in-place) |
| Logical Modeling | 3.4 Map Attributes | 3.6 (keys), 3.9 (relationships) — 3.5, 3.7, 3.8 unaffected |
| Logical Modeling | 3.6 Identify Keys | 3.7 (SCD may reference key stability), 3.9, 3.10 |
| Physical Modeling | 4.1 Surrogate Keys | 4.2 (naming includes SK), 4.4 (STTM includes SK), 4.5 (DDL includes SK) |
| Physical Modeling | 4.3 Transformations | 4.4, 4.5 |

`[OPEN]` — this table should be encoded as an explicit dependency graph per stage (small DAG of step-IDs) rather than hardcoded if-else, so a new step insertion doesn't require code changes. Recommend a `stage_step_dependencies.yaml` per layer, loaded by the Orchestrator's regenerate handler.

### 3.7 Custom Workflow mode
- Person can either draw/describe a custom agent DAG directly (canvas DAG builder — node palette of the 24+ sub-agents, drag connections) or describe a goal in chat ("I just need PK/FK detection and DDL, skip conceptual modeling") for the Orchestrator to auto-assemble into a DAG.
- Auto-assembly: Orchestrator maps the goal description against the known agent catalog + their declared input/output contracts (from `ADM_AGENTS_OUTPUTS__Silver_1.csv` schema), proposes a DAG, shows it to the person for confirmation before executing — this itself is effectively a zero-th HITL gate for custom workflows only.
- Gate mechanics for custom workflows: `[OPEN]` — recommend one gate per *user-defined* logical grouping in the DAG (mirroring the "one gate per stage" principle), with the person able to mark DAG-node groupings at design time.

---

## 4. Data & Storage Architecture

### 4.1 Datastore roles (final — Postgres removed from app layer entirely)

**MongoDB is system of record for everything except the two exceptions below.** No Postgres anywhere in the CRUD/app layer — users, teams, projects, membership/RBAC, chats, messages, skills, agent execution logs, file/parse records, DB-connection metadata, LangGraph checkpointer state: all Mongo.

| Store | Role |
|---|---|
| **MongoDB** | System of record for everything app-layer: `users`, `teams`, `projects` (incl. `members[]` RBAC), `chats`, `messages`, `skills`, `agent_executions`, `files`, `parsed_documents`, `db_connections`, LangGraph checkpointer collection |
| **MongoDB Atlas Vector Search** | All vector/embedding use cases (§4.4) — same cluster, separate index |
| **PostgreSQL (metastore only)** | **Exception #1** — final push-to-metastore destination. When the person pushes an approved physical model, the actual relational tables (per the generated DDL) are created/loaded here, in genuine table form, mirroring how the existing `dfl_agent_input`/`dfl_adm_session` metastore pattern works today. Nothing about projects, chat, or skills ever lives here — only the modeled data product itself, on explicit push. |
| **Neo4j** | **Exception #2** — knowledge graph, 27-level ontology per `adm_silver_kg_v2.py`, unchanged. Also an explicit-push target, same trigger as the metastore push (owner-only, final gate action). |
| **S3-compatible blob store (MinIO locally)** | Raw uploaded files, generated artifacts (DDL/DML/xlsx/JSON) |
| **Redis** | Celery broker + result backend + WebSocket fan-out |

This means "push to KG" at the final gate (§1.4, §6 Phase K) is really **two optional push targets**: push to metastore (Postgres, relational tables from the DDL) and/or push to KG (Neo4j, ontology graph). Both read from the same approved Mongo session-state document; neither is required to use the app day-to-day — a project can run its entire pipeline and live purely in Mongo until the person chooses to materialize output.

**LangGraph checkpointer** — use a Mongo-backed checkpoint saver (LangGraph supports pluggable checkpointers; Mongo collection `langgraph_checkpoints`) instead of a Postgres-backed one. Functionally equivalent here — durable, survives Celery worker restarts — and keeps the whole app-layer stack on one database engine.

### 4.2 MongoDB collections
```
projects {
  _id, name, domain, subdomain, layer: "foundation"|"product",
  description, owner_id, members: [{user_id, role, added_at}],
  created_at, updated_at
}

chats {
  _id, project_id, session_id, created_by, created_at, status,
  session_summary: str   // rolling summarization output, §4.3
}

messages {
  _id, chat_id, role: "user"|"assistant"|"tool", content,
  tool_calls: [...], entities_referenced: [{mention, resolved, type}],
  embedding_id, created_at, seq
}

skills {
  _id, project_id: str|null,  // null = builtin
  owner_id, scope: "builtin"|"project_shared"|"project_private",
  name, title, content_md, version, source_file_ref, created_at, updated_at
}

users {
  _id, name, email, password_hash, llm_provider_profiles: [
    {provider, api_key_encrypted, model_name, default_temperature, is_default}
  ], created_at
}

teams {
  _id, name, member_user_ids: [...], created_at
}

langgraph_checkpoints {
  // managed by LangGraph's Mongo checkpoint saver — thread_id keyed to session_id
  _id, thread_id, checkpoint, metadata, created_at
}

agent_executions {
  _id, session_id, agent_name, stage, step, input_hash,
  output_json, status, hitl_decision, started_at, completed_at
}

files {
  _id, project_id, session_id, blob_uri, filename, mime_type,
  parsed_ref, uploaded_by, uploaded_at
}

parsed_documents {
  _id, file_id, parse_method, structured_output: object,
  chunk_refs: [...], parsed_at, version
}

db_connections {
  _id, project_id, created_by, dialect, host_ref (secret-manager pointer, NOT raw creds),
  existing_model_ref, target_dialect, naming_skill_ref, created_at
}
```

All of the above are Mongo collections — no schema lives outside Mongo except the two explicit-push exceptions in §4.1 (Postgres metastore tables, Neo4j graph), both of which are *outputs*, not app state.

### 4.3 Conversation memory (context engineering)
Four-layer design, resolves the "Virat Kohli → he" coreference case and long-session continuity:

1. **Short-term buffer** — last N raw `messages` docs, verbatim into Orchestrator prompt each turn.
2. **Entity memory table** — per-chat `entities` extraction (cheap LLM call or NER) populates `{mention, resolved, type, last_seen_turn}`. Every turn, resolve pronouns/references against this table *before* the main call — either by rewriting the input or passing the table as structured context. This is the explicit mechanism (not implicit long-context reliance) that keeps "he" bound to "Virat Kohli" across intervening messages.
3. **Rolling summarization** — once a chat exceeds a token threshold, older turns compress into `chats.session_summary`. Functions as the "LSTM-like" persistent state — a bounded running summary rather than raw replay.
4. **Vector recall** — message embeddings in Atlas Vector Search, scoped by `chat_id`/`project_id`, queried semantically each turn for anything beyond the rolling window (cross-session continuity).

### 4.4 Vector store use cases (single Atlas Vector Search deployment, scoped by metadata filter/namespace — not separate infra per case)
| Use case | Embedded content | Scope filter |
|---|---|---|
| Conversation semantic recall | message chunks | `chat_id` |
| Skill semantic search (`/skill list` fuzzy find) | skill `content_md` | `project_id` + `builtin` |
| Agent-output determinism Tier 2 (already-designed three-tier lookup) | prior output + input signature | USER + GLOBAL |
| Enterprise model mapping (Step 3.8) | candidate entity/attribute name+description | GLOBAL, cross-session |
| Uploaded document RAG (data dictionaries, existing model docs) | `parsed_documents` chunks | `project_id` |
| Cross-session entity linking (supplements existing Jaccard similarity in `adm_silver_kg_v2.py`, does not replace it) | entity name+attribute signature | GLOBAL |

This is the same deployment the pending nine-layer RAG architecture already targets (hybrid search via `$rankFusion`, `$rerank` with Voyage AI, semantic caching, auto-embedding, scalar quantization) — no new infra decision required here, just confirming scope-filter usage patterns ahead of that implementation.

### 4.5 File upload & parsing pipeline
```
Upload → blob store (raw, immutable) → files doc created (blob_uri)
       → async Celery parse job → parsed_documents doc (structured_output + chunk_refs)
       → chunks embedded → Atlas Vector Search
       → downstream agents reference parsed_ref only, never raw blob_uri directly
```
Re-upload/correction creates a new `parsed_documents` version; blob history untouched. This is what "keep in parsing and store record of it" resolves to — parse output is a first-class, versioned, queryable record, not a transient in-memory step.

### 4.6 DB connection intake
Modal fields (feeds `IntakeAgent`'s `ProjectContext.source_ref`): host/port, dialect, auth (stored via secret-manager reference, never raw in Mongo/Postgres), database/schema, table selection (list-and-pick after test-connect), existing enterprise model reference (optional, feeds Step 3.8), target dialect for output DDL, naming convention skill selection (defaults to builtin, overridable).

---

## 5. Security & RBAC

### 5.1 Roles
| Role | Permissions |
|---|---|
| `owner` | Full CRUD on project, members, skills promotion, push-to-KG, delete project |
| `editor` | Run pipeline, HITL approve/edit/regenerate, create/edit own skills, cannot manage members or push-to-KG |
| `viewer` | Read-only chat/canvas access, no pipeline actions |

### 5.2 Enforcement
- API-layer middleware checks project membership + role by reading `projects.members[]` (Mongo) on every project-scoped request — no separate relational join needed since it's a single-document read.
- `push_to_metastore`, `push_to_kg`, and `delete_project` actions gated to `owner` only, enforced server-side (not just UI-hidden).

### 5.3 Secrets
- LLM provider API keys (BYO-key) and DB connection credentials: encrypted at rest (KMS-backed or equivalent), never returned in plaintext via any read API — only a masked reference (`sk-...abcd`) is ever sent to the client.

---

## 6. Build Phases (sequenced for AI coding agent execution)

Each phase should be a self-contained, sequentially executable prompt — matching your existing ten-phase pattern for the original pipeline build. Recommended sequencing for ADM 2.0 additions on top of that foundation:

1. **Phase A — Auth + Dashboard + Project CRUD** (Mongo schema for `users`/`teams`/`projects`, RBAC middleware reading `members[]`, project/member CRUD incl. post-creation member edit)
2. **Phase B — Remaining Mongo collections + file upload/parse pipeline** (blob store, `files`/`parsed_documents`, async parse Celery task, `db_connections`)
3. **Phase C — IntakeAgent subgraph + ProjectContext contract**
4. **Phase D — Orchestrator + 24-agent LangGraph wiring with Mongo checkpointer, Default Workflow only, 8-gate structure**
5. **Phase E — Chat UI + gate cards + WebSocket streaming**
6. **Phase F — Canvas (ERD, attribute grid, STTM grid, DDL viewer) bound to session-state JSON, editable, save path**
7. **Phase G — Skill system (SkillGeneratorAgent, 3-tier scoping, enhance flow, slash commands)**
8. **Phase H — Conversation memory (entity table, rolling summarization, vector recall wiring)**
9. **Phase I — A2A registry + at least one non-LangGraph remote agent proof-of-concept**
10. **Phase J — Custom Workflow DAG builder + auto-assembly**
11. **Phase K — Push-to-metastore (Postgres, DDL-driven table creation) + push-to-KG (`adm_silver_kg_v2.py` as Celery task) as two independent owner-gated actions, artifact download, deployment/cloud decision**

`[OPEN]` item to resolve during Phase D: the regeneration-dependency encoding format (§3.6) — recommend `stage_step_dependencies.yaml` per layer rather than hardcoded if-else.

---

## 7. Explicit non-goals for this spec
- Skill marketplace / template editor UI — referenced in original requirements as not-yet-built; still out of scope here.
- Nine-layer RAG architecture implementation — pending separate approval; this doc only confirms how the vector store will be *used* once approved, not its internal layer design.
- Multi-region/HA deployment topology — deferred to Phase K cloud decision.
