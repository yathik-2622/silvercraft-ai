# ADM Agent Studio 2.0 — API Error Handling & Agent Topology Spec (v3)

**Companion to:** `ADM_2.0_BUILD_SPEC.md`, `ADM_2.0_AGENT_ARCHITECTURE_V2.md`. This doc adds: (1) a standard error contract applied to every API in the system, (2) the full endpoint list including one dedicated API surface per agent, and (3) the wiring diagram showing exactly how the Orchestrator, the 5 agents, storage, and protocol boundaries connect.

---

## 1. Standard error envelope — every API in the system returns this shape on failure

```json
{
  "error": {
    "code": "AGENT_SCHEMA_VALIDATION_FAILED",
    "message": "LogicalModelingAgent output did not match the expected schema after one retry.",
    "http_status": 422,
    "retryable": false,
    "trace_id": "uuid",
    "details": { "missing_fields": ["entities.DIM_AGENT.scd_type"] },
    "occurred_at": "iso8601"
  }
}
```
No endpoint in the system returns a bare string, an HTML error page, or a stack trace to the client. `trace_id` always ties back to the `agent_executions` / request-log record so the person's bug report and the backend log are the same lookup.

### 1.1 Error code taxonomy (shared across all APIs)
| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `AUTH_REQUIRED` | 401 | no | missing/expired session |
| `FORBIDDEN_ROLE` | 403 | no | RBAC — role doesn't permit this action (§5.2 of build spec) |
| `NOT_FOUND` | 404 | no | project/session/skill/file id doesn't exist or isn't visible to this user |
| `VALIDATION_ERROR` | 400 | no | malformed request body |
| `CONFLICT` | 409 | sometimes | see §1.2 — several distinct conflict subtypes |
| `RATE_LIMITED` | 429 | yes, after `retry_after_ms` | LLM provider or platform-level throttle |
| `FILE_PARSE_FAILED` | 422 | yes (re-upload) | parse job failed — corrupt file, unsupported structure |
| `DB_CONNECTION_FAILED` | 502 | yes | source DB unreachable or auth rejected |
| `AGENT_TOOL_FAILURE` | 502 | yes, capped (§3) | an agent's internal `query_mongo`/`vector_search`/`web_reference` call failed |
| `AGENT_SCHEMA_VALIDATION_FAILED` | 422 | no (surfaces as gate error card) | agent output invalid after one corrective retry — see build spec §2.2 step 4 |
| `AGENT_TIMEOUT` | 504 | yes, capped | agent exceeded its wall-clock budget (§3.3) |
| `PEER_CALL_BUDGET_EXCEEDED` | 409 | no | an agent hit its `max_peer_calls` cap (agent-architecture spec §2.2 step 4) |
| `LLM_PROVIDER_ERROR` | 502 | yes | BYO-key provider rejected/errored the call (bad key, quota, provider outage) |
| `GATE_UNSAVED_CHANGES` | 409 | no | Approve blocked — canvas has unsaved edits (agent-architecture spec §5.1) |
| `CHECKPOINT_CONFLICT` | 409 | no | concurrent regenerate/edit on the same gate from two clients |
| `PUSH_TARGET_UNREACHABLE` | 502 | yes | Postgres metastore or Neo4j unreachable on push |
| `SKILL_STAGE_MISMATCH` | 400 | no | skill's `stage_binding` doesn't match the agent it's being force-applied to |
| `INTERNAL_ERROR` | 500 | no | unclassified — always paired with a logged stack trace server-side, never shown to client |

### 1.2 `CONFLICT` subtypes (all 409, distinguished by `code`)
- `GATE_UNSAVED_CHANGES`, `CHECKPOINT_CONFLICT`, `PEER_CALL_BUDGET_EXCEEDED` (above), plus:
- `PROJECT_NAME_DUPLICATE` — project name already exists for this owner
- `SESSION_LOCKED` — a message was sent while the Orchestrator is still processing a prior one on the same session (UI should disable input while `status: "running"`, this is the server-side backstop)
- `PUSH_ALREADY_IN_PROGRESS` — a metastore/KG push is already running for this session

### 1.3 Retry policy (server-side, inside the backend — not the client's responsibility)
- **Agent tool calls** (`query_mongo`, `vector_search`, `web_reference`): exponential backoff, base 250ms, max 3 attempts, then surfaces as `AGENT_TOOL_FAILURE` up to the calling agent — the agent decides whether to proceed degraded (e.g. skip a `web_reference` lookup and note the gap in `warnings`) or fail the step, per its own system prompt's judgment. Not every tool failure is fatal.
- **LLM provider calls**: exponential backoff on 429/5xx, base 1s, max 4 attempts, honoring `Retry-After` if the provider sends one. On final failure → `LLM_PROVIDER_ERROR`, session pauses (not silently retried forever), person sees "Your LLM provider is unavailable — check your key in Settings" with a direct link to the Settings modal.
- **A2A peer calls to an externally-hosted agent**: single retry only (external agents are outside our control, don't hammer them), 5s timeout, then `AGENT_TOOL_FAILURE` bubbles to the calling agent same as any other tool failure.
- **Push targets** (Postgres/Neo4j): 3 attempts, 2s/4s/8s backoff, then `PUSH_TARGET_UNREACHABLE` — push is idempotent (safe to retry the whole push, not partial) so the person can just retry from the UI without side effects.
- **File parsing**: one automatic retry on transient failure (e.g. temporary blob-store hiccup); on a genuine parse failure (corrupt/unsupported file) it does not retry automatically — surfaces `FILE_PARSE_FAILED` immediately so the person can fix and re-upload rather than waiting out a doomed retry loop.
- **Idempotency**: every POST that triggers agent dispatch or a push accepts an `Idempotency-Key` header; a repeated request with the same key within 24h returns the original result rather than double-dispatching — this matters specifically because a flaky network retry on "Approve" must never run a stage twice.

---

## 2. Full API surface

### 2.1 Auth
| Endpoint | Method | Notes |
|---|---|---|
| `/auth/login` | POST | 401 on bad creds, 429 after repeated failures |
| `/auth/refresh` | POST | rotates refresh token |
| `/auth/logout` | POST | |

### 2.2 Projects
| Endpoint | Method | Notes |
|---|---|---|
| `/projects` | POST | 409 `PROJECT_NAME_DUPLICATE` per-owner |
| `/projects?scope=mine\|shared` | GET | |
| `/projects/{id}` | GET / PATCH / DELETE | DELETE owner-only, 403 otherwise |
| `/projects/{id}/members` | POST / DELETE | owner-only |

### 2.3 Files & DB connections
| Endpoint | Method | Notes |
|---|---|---|
| `/files/upload` | POST (multipart — the only multipart endpoint in the system, per build spec §4.5) | 413 over size limit, 415 unsupported type |
| `/files/{id}/status` | GET | `{status: "parsing"\|"parsed"\|"failed", parsed_ref?, error?}` |
| `/db-connections` | POST | tests connection on save; 502 `DB_CONNECTION_FAILED` |
| `/db-connections/{id}/test` | POST | re-test without saving |
| `/db-connections/{id}/tables` | GET | list-and-pick after successful test |

### 2.4 Chat & session control
| Endpoint | Method | Notes |
|---|---|---|
| `/chat/{session_id}/messages` | POST | 409 `SESSION_LOCKED` if Orchestrator mid-task |
| `/chat/{session_id}/messages` | GET | paginated history |
| `/chat/{session_id}/stream` | WS | trace events (agent-architecture spec §2.2 step 5), gate cards, token stream |
| `/sessions/{id}/gates/{gate}` | GET | current gate's combined output + status |
| `/sessions/{id}/gates/{gate}/approve` | POST | 409 `GATE_UNSAVED_CHANGES` if canvas dirty |
| `/sessions/{id}/gates/{gate}/edit` | POST | commits canvas edits into session state |
| `/sessions/{id}/gates/{gate}/regenerate` | POST | body: `{ from_step?: string }`, consults `stage_step_dependencies.yaml` |
| `/sessions/{id}/push/metastore` | POST | owner-only, 409 if not all gates approved |
| `/sessions/{id}/push/kg` | POST | owner-only, same gating |

### 2.5 Skills
| Endpoint | Method | Notes |
|---|---|---|
| `/skills?project_id&scope` | GET | |
| `/skills` | POST | routes to `SkillCuratorAgent.create` |
| `/skills/{id}/enhance` | POST | routes to `SkillCuratorAgent.enhance`, returns a diff, not an immediate write |
| `/skills/{id}` | PATCH / DELETE | |
| `/skills/{id}/promote` | POST | `project_private` → `project_shared` |
| `/skills/{id}/download` | GET | returns raw markdown as an artifact |

### 2.6 Settings
| Endpoint | Method | Notes |
|---|---|---|
| `/users/me/llm-providers` | GET / POST | keys encrypted at rest, never returned in plaintext (build spec §5.3) |
| `/users/me/llm-providers/{id}` | PATCH / DELETE | |

---

## 3. Agent APIs — one surface per agent

Every agent (§4 of `ADM_2.0_AGENT_ARCHITECTURE_V2.md`) is addressable through its own endpoint, whether it's invoked natively in-process or hosted externally. This uniformity is what makes swapping a native agent for an A2A-remote one (e.g. a CrewAI-built `PhysicalModelingAgent`) a configuration change, not a code change.

### 3.1 Endpoint shape (identical pattern per agent)
```
POST /agents/{agent_name}/run
  body: Task Pointer (agent-architecture spec §1)
  → 202 { task_id, status: "running" }, result delivered over the session's WS stream
  errors: AGENT_TOOL_FAILURE, AGENT_TIMEOUT, AGENT_SCHEMA_VALIDATION_FAILED,
          PEER_CALL_BUDGET_EXCEEDED, LLM_PROVIDER_ERROR

POST /agents/{agent_name}/peer-call         ← how call_peer_agent actually lands
  body: { from_agent, question, context_refs, trace_id }
  → 200 { answer, confidence?, thinking? }
  errors: AGENT_TOOL_FAILURE, AGENT_TIMEOUT

GET  /agents/{agent_name}/.well-known/agent-card.json   ← A2A discovery document
  → AgentCard per A2A v1.0 spec: capabilities, skills, endpoint, auth scheme
```

### 3.2 The full agent list on this surface
| `agent_name` | Kind | Reachable via |
|---|---|---|
| `orchestrator` | Supervisor | `/agents/orchestrator/run` — internal only, not directly callable by the UI (UI talks to `/chat` and `/sessions/*` instead, which dispatch to this) |
| `intake` | Subgraph, invoked by orchestrator | `/agents/intake/run` |
| `source-intelligence` | Stage-owner | `/agents/source-intelligence/run`, `/peer-call`, `/agent-card.json` |
| `conceptual-modeling` | Stage-owner | `/agents/conceptual-modeling/run`, `/peer-call`, `/agent-card.json` |
| `logical-modeling` | Stage-owner | `/agents/logical-modeling/run`, `/peer-call`, `/agent-card.json` |
| `physical-modeling` | Stage-owner | `/agents/physical-modeling/run`, `/peer-call`, `/agent-card.json` |
| `skill-curator` | Cross-cutting, leaf | `/agents/skill-curator/run`, `/peer-call` (no outbound peer calls of its own, per agent-architecture spec §4.5) |

`intake` and `orchestrator` don't publish an `agent-card.json` — they are never legitimate A2A delegation targets from an *external* system (nothing outside this platform should be triggering intake or acting as the orchestrator); the 5 modeling/skill agents do publish one, since those are the ones a person might legitimately swap for an external framework's implementation.

### 3.3 Timeout budgets (feed `AGENT_TIMEOUT`)
| Agent | Per-step internal budget | Whole-stage hard cap |
|---|---|---|
| `intake` | 60s (should be near-instant; slow = a tool is hanging) | n/a |
| `source-intelligence` | 90s per table | 12 min |
| `conceptual-modeling` | — | 5 min |
| `logical-modeling` | 90s per entity | 15 min (heaviest stage) |
| `physical-modeling` | 60s per table | 10 min |
| `skill-curator` | 30s | n/a (single-shot, not stage-bound) |
| peer-call (any) | 20s | — (one round trip, per agent-architecture spec §2.2 step 4) |

On hard-cap breach: stage halts, gate shows an **error card** (not a silent partial result) with whichever sub-outputs did complete preserved and visible, plus a **Retry stage** action.

---

## 4. Topology — how everything connects

```
                                   ┌─────────────────────────┐
                                   │   React UI (browser)    │
                                   │  Dashboard · Chat+Canvas│
                                   └───────────┬─────────────┘
                                               │ HTTPS + WSS
                                   ┌───────────▼─────────────┐
                                   │      API Gateway         │
                                   │  (FastAPI, JSON only     │
                                   │   except /files/upload)  │
                                   └──┬───────┬───────┬───────┘
                    ┌─────────────────┘       │       └──────────────────┐
                    │                         │                          │
          ┌─────────▼────────┐     ┌──────────▼──────────┐    ┌──────────▼─────────┐
          │ Auth/Project/     │     │   Chat & Session     │    │   Skills API        │
          │ Files/Settings    │     │   Control API        │    │                      │
          │ (plain CRUD)      │     │  enqueues Celery task │    │  → SkillCuratorAgent│
          └─────────┬─────────┘     └──────────┬──────────┘    └──────────┬───────────┘
                    │                          │                          │
                    │                ┌─────────▼──────────┐               │
                    │                │  Redis (broker +    │               │
                    │                │  result backend +   │               │
                    │                │  WS pub/sub)         │               │
                    │                └─────────┬──────────┘               │
                    │                          │                          │
                    │                ┌─────────▼──────────┐               │
                    │                │  Celery worker:      │               │
                    │                │  Orchestrator         │◄──────────────┘
                    │                │  (LangGraph, Mongo-   │
                    │                │  backed checkpointer) │
                    │                └──┬────┬────┬────┬────┘
                    │                   │    │    │    │  dispatch (native call, task pointer)
                    │           ┌───────┘    │    │    └────────┐
                    │           │            │    │             │
                    │   ┌───────▼──────┐ ┌───▼────▼───┐  ┌──────▼───────┐  ┌────────────────┐
                    │   │IntakeAgent   │ │SourceIntel-│  │LogicalModel- │  │PhysicalModel-   │
                    │   │(subgraph)    │ │ligenceAgent│  │ingAgent      │  │ingAgent         │
                    │   └──────────────┘ └─────┬──────┘  └──────┬───────┘  └────────┬────────┘
                    │                          │ call_peer_agent │  call_peer_agent  │
                    │                          └────────┬────────┴────────┬──────────┘
                    │                                   │                 │
                    │                          ┌────────▼─────────────────▼───────┐
                    │                          │   ConceptualModelingAgent          │
                    │                          └────────────────┬────────────────────┘
                    │                                            │ (all 4 stage-owners also
                    │                                            │  peer-call SkillCuratorAgent)
                    │                                   ┌────────▼─────────┐
                    │                                   │  SkillCuratorAgent │
                    │                                   └────────┬──────────┘
                    │                                            │
    ┌───────────────┴────────────────────────────────────────────┴───────────────────────┐
    │                              MCP Tool Layer (every agent's tool belt)                │
    │   query_mongo · vector_search (Atlas) · read_skill/list_skills · web_reference        │
    └───────────────┬───────────────────────────────┬──────────────────────┬───────────────┘
                    │                               │                      │
          ┌─────────▼─────────┐          ┌──────────▼──────────┐  ┌────────▼────────┐
          │     MongoDB        │          │  MongoDB Atlas       │  │  Blob store       │
          │ (system of record  │          │  Vector Search        │  │  (S3-compatible / │
          │  for everything    │          │  (skills, memory,     │  │   MinIO) — raw     │
          │  app-layer, per     │          │  enterprise-model     │  │   files + artifacts│
          │  build spec §4.1)   │          │  matching, etc.)      │  │                    │
          └─────────────────────┘          └───────────────────────┘  └────────────────────┘

    A2A boundary (only crossed if a peer agent is externally registered):
          call_peer_agent ──JSON-RPC──► [agent_registry lookup] ──► external AgentCard endpoint
          (e.g. a CrewAI-hosted PhysicalModelingAgent variant, per agent-architecture spec §2.2)

    Explicit push targets (only touched on owner-gated "Approve final gate → Push"):
          Session state (Mongo) ──► PostgreSQL metastore   (relational tables from DDL)
          Session state (Mongo) ──► Neo4j                   (27-level KG ontology, adm_silver_kg_v2.py)
```

### 4.1 Reading the topology
- **Everything left of the MCP Tool Layer is app-layer plumbing** (auth, CRUD, session control) — plain REST, no agents involved, talks straight to Mongo.
- **Everything inside the dashed box is the agentic core** — one Celery worker process runs the Orchestrator's LangGraph graph; the 5 agents are subgraphs/nodes within that same graph by default (native transport, zero network hop) unless a specific one has been re-registered as an external A2A endpoint.
- **The MCP tool layer is shared** — all 5 agents call through the same tool definitions, they just get different tool *permissions* per their system prompt (e.g. only `PhysicalModelingAgent` gets `web_reference`).
- **The A2A boundary is opt-in per agent, not architectural** — nothing about the topology changes when an agent is swapped from native to external; `call_peer_agent` and `/agents/{name}/run` both check the same `agent_registry` doc to decide native-vs-A2A dispatch, transparently to the caller.
- **Push targets are leaves, not part of the operating loop** — Postgres and Neo4j are never read from during normal pipeline execution, only written to, and only once, on explicit owner action — consistent with build spec §4.1's "everything lives in Mongo until you choose to materialize."

### 4.2 What crosses the WebSocket vs. what doesn't
| Over WS (`/chat/{session_id}/stream`) | Over REST (request/response) |
|---|---|
| Live trace events (`started`/`thinking`/`tool_call`/`peer_call`/`output`/`completed`/`error`) | Gate approve/edit/regenerate actions |
| Gate-card ready notifications | Canvas save |
| Token-by-token assistant chat replies (general-help mode) | Skill CRUD |
| Session lock/unlock status | Push-to-metastore/KG (long-running but request/response with polling, not streamed — push isn't a chat-visible trace) |
