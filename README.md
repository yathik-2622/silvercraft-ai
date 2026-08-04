# ADM 2.0 — First Cut (Local Build)

Local, MongoDB-based implementation of the ADM 2.0 "first cut" TDS
(Canonical/3NF, single end-to-end run) — fully LangGraph/LangChain
oriented throughout, not hand-rolled orchestration wearing LangGraph's
name.

| TDS component (Azure) | This build (local) |
|---|---|
| Azure Cosmos DB (NoSQL API) | **MongoDB** — your live cluster (`MONGO_URI`), same document shapes |
| Azure AI Search (`modeling_reference`) | **MongoDB Atlas Vector Search** — TWO indexes now, see below |
| Azure Cache for Redis | **Local Redis** (Celery broker/backend + Pub/Sub only) |
| Azure Blob Storage | **Local filesystem** (`ARTIFACT_STORAGE_DIR`) — generated artifacts only, never source data |
| Azure OpenAI (implied) | Your OpenAI-compatible gateway (`LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`/`EMBEDDING_MODEL`) |

**No seed script.** Content — both modeling reference documents and
skill files — goes in through the real admin ingestion pipeline
(`POST /admin/kb/upload`), not a hardcoded Python bootstrap. See
"Admin content ingestion" below.

---

## What's genuinely LangGraph/LangChain, not just imported

- **2 compiled `StateGraph`s**: the Orchestrator Graph and — new in this
  revision — a real **Send-based fan-out graph** for stage task execution
  (`app/graphs/solution_agent_graph.py`, `ADM_get_fanout_graph()`). Stage
  tasks are dispatched via LangGraph's native `Send` API, not
  `asyncio.gather` — verified against the actually-installed `langgraph`
  package before writing it, not assumed from docs.
- **`langgraph-checkpoint-mongodb`**'s `MongoDBSaver`, backed by your live
  cluster, gives the fan-out graph genuine durable checkpointing — also
  verified directly (its `aput`/`aget_tuple`/`alist` methods work with
  `.ainvoke()` via inherited executor-wrapped defaults, confirmed by
  reading the installed source, not the changelog).
- **`create_react_agent`** for every TaskWorker, streamed via
  `agent.astream_events(..., version="v2")` — real token/tool-call
  streaming, not a fake typing effect.
- **LangChain's real text splitters** (`RecursiveCharacterTextSplitter`,
  `MarkdownTextSplitter`, `TokenTextSplitter`) power every chunking
  strategy — no hand-rolled splitting logic anywhere.

## Folder structure (new/changed this revision marked ★)

```
ADM_2.O/
├── README.md
├── requirements.txt
├── .env.example
├── docker-compose.yml
├── app/
│   ├── main.py
│   ├── config.py
│   ├── db/
│   │   ├── mongo_client.py
│   │   ├── collections.py            ★ kb_documents added
│   │   └── vector_search.py          ★ chunk-level modeling_reference + skill-level semantic search
│   ├── models/schemas.py             ★ ADM_KbDocument, ADM_Citation, ADM_Skill.embedding, User.is_admin
│   ├── llm/{client.py, embeddings.py}
│   ├── core/
│   │   ├── hitl.py
│   │   ├── redis_pubsub.py
│   │   ├── privacy.py
│   │   ├── auth.py                   ★ ADM_require_admin added
│   │   ├── ownership.py
│   │   ├── reasoning_stream.py       ★ ADM_stream_citations, kb_ingest source
│   │   └── chunking.py               ★ NEW — 4 named strategies, offset-tracked
│   ├── tools/
│   │   ├── csv_excel_parser.py, sql_db_connector.py, db_metadata_introspector.py,
│   │   │   profiling_stats.py, ddl_generator.py, diff_tool.py, merge_results.py,
│   │   │   git_publish.py, skill_normalizer_extract.py, upload_ingestion.py
│   │   └── document_text_extract.py  ★ NEW — .md/.txt/.pdf/.docx/.pptx
│   ├── agents/
│   │   ├── context_builder.py        ★ returns citations now
│   │   ├── task_worker.py
│   │   └── skill_normalizer.py       ★ embeds the skill on approval
│   ├── graphs/
│   │   ├── orchestrator_graph.py     ★ real semantic skill search, citations
│   │   ├── solution_agent_graph.py   ★ real Send-based fan-out (was asyncio.gather)
│   │   └── checkpointer.py           ★ NEW — shared MongoDBSaver
│   ├── celery_app/tasks.py           ★ 8 task types now (+ingest_kb_document_task, +embed_skill_task)
│   └── api/
│       ├── routes_auth.py, routes_projects.py, routes_chats.py,
│       │   routes_contracts.py, routes_skills.py, routes_uploads.py
│       ├── routes_admin.py           ★ NEW — unified KB/skill ingestion, admin-only
│       └── routes_kb.py              ★ NEW — GET /kb/documents/{id}, any authenticated user
├── scripts/
│   ├── promote_admin.py              ★ NEW — one-off, NOT a seed script (see docstring)
│   └── run_local.sh
└── tests/test_health.py
```

---

## Atlas Vector Search — you need to create TWO indexes, not one

This is the part you have to do yourself in the Atlas UI (Search → Create
Search Index → JSON Editor) — deliberately not hidden behind a name you
can't see.

**1. On the `modeling_reference` collection** (name must match
`VECTOR_INDEX_NAME` in `.env`, default `modeling_reference_vector_index`):
```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "doc_type" },
    { "type": "filter", "path": "source_doc_id" }
  ]
}
```

**2. On the `skills` collection** (name must match `SKILL_VECTOR_INDEX_NAME`
in `.env`, default `skills_vector_index`) — this is the new one, for
semantic skill discovery ("what skills do I need for Canonical modeling"):
```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "kind" },
    { "type": "filter", "path": "scope" }
  ]
}
```

Without either index, the code falls back to naive in-Python cosine
similarity automatically — the demo still runs end-to-end, just slower at
scale. Create both once you're ready for real performance.

---

## Setup

```bash
cd ADM_2.O
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# set MONGO_URI to your live cluster + LLM_BASE_URL/LLM_API_KEY/LLM_MODEL/EMBEDDING_MODEL

docker compose up -d          # local Redis only — see below for a Docker-free alternative

# terminal 1
uvicorn app.main:app --reload --port 8000
# terminal 2
celery -A app.celery_app.celery_app worker --loglevel=info -P solo
```

Open `http://localhost:8000/docs` for the full interactive API.

### Redis without Docker Desktop (WSL-native)

`docker compose up -d` above is still the default path. This is an
alternative for when Docker Desktop itself is the problem — its WSL2
integration is a known flaky point: the Windows-side processes can be
running while `dockerd` never actually starts inside its internal
`docker-desktop` WSL distro (distinct from your normal Ubuntu WSL distro),
leaving `docker ps` hanging indefinitely with nothing obviously wrong. If
you hit that, either restart Docker Desktop (`wsl --shutdown` from
PowerShell, wait ~10s, relaunch Docker Desktop, give it a minute before
retrying — Settings → Troubleshoot → Clean/Purge or Reset to factory
defaults if that's not enough), or skip Docker for Redis entirely:

```bash
# Inside your normal WSL2 Ubuntu distro (NOT the internal docker-desktop distro)
sudo apt update
sudo apt install -y redis-server

sudo service redis-server start
redis-cli ping   # should return PONG
```

No `.env` change needed either way — WSL2 forwards `localhost` to the
distro automatically, so `REDIS_URL=redis://localhost:6379/0` (the
default) reaches this Redis exactly the same as the Docker one. This has
no Docker Desktop dependency at all, so it can't get stuck the way the
Docker path just did.

### Fresh machine setup, start to finish

1. **Prerequisites**: Python 3.11+, WSL2 with an Ubuntu distro (only
   needed if you're using the WSL-native Redis path above), a reachable
   MongoDB Atlas cluster, and your LLM gateway's base URL + API key.
2. Clone the repo, `cp .env.example .env`, fill in `MONGO_URI` /
   `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` / `EMBEDDING_MODEL` /
   `JWT_SECRET_KEY` / `SETTINGS_ENCRYPTION_KEY` (see "Setup" above and
   `SETUP_AND_TESTING.md` step 2 for what each one is).
3. Start Redis — `docker compose up -d`, or the WSL-native path above if
   Docker Desktop won't cooperate.
4. Confirm Mongo is reachable (`mongosh "<your MONGO_URI>"` or equivalent)
   and create the two Atlas Vector Search indexes (below) — the app runs
   without them via the cosine-similarity fallback, but create them before
   relying on real search performance.
5. `uvicorn app.main:app --reload --port 8000` (terminal 1), `celery -A
   app.celery_app.celery_app worker --loglevel=info -P solo` (terminal 2).
6. Register + promote your first admin user (below), then work through
   `SETUP_AND_TESTING.md` end to end — it's the detailed, numbered
   walkthrough this summary points at.

### First admin user

```bash
# 1. Register a normal user via POST /auth/register (or /docs)
# 2. Promote them:
python scripts/promote_admin.py <username>
# 3. Log in again (is_admin is checked live per-request against the DB,
#    never cached in the JWT — see app/core/auth.py:ADM_require_admin)
```

---

## Admin content ingestion (replaces seed.py)

One endpoint, two dropdown-driven paths — `GET /admin/kb/config` returns
both dropdowns' options in one call for a UI to render:

```json
{
  "kb_types": {
    "modeling": "Modelling reference documents — chunked + embedded.",
    "skill": "Skill files — YAML parsed directly, or free-text via the Normalizer."
  },
  "chunking_strategies": {
    "markdown": "...", "recursive": "...", "sliding_window": "...", "page_aware": "..."
  }
}
```

**Modelling KB docs** — `POST /admin/kb/upload` (admin JWT required):
`kb_type=modeling`, `title`, `chunking_strategy` (one of the 4 above),
`file` (.md/.txt/.pdf/.docx/.pptx). Runs via Celery (`ingest_kb_document_task`)
since embedding is an LLM-gateway call. Watch progress live at
`GET /admin/kb/upload/{doc_id}/stream` (NDJSON, same pattern as chat
streaming). Any authenticated user can later fetch
`GET /kb/documents/{doc_id}` to render a citation's full document +
highlighted chunk (`char_start`/`char_end` from the citation slice
directly into `full_text`).

**Skill files** — same endpoint, `kb_type=skill`:
- `.yaml`/`.yml` → parsed directly against the exact `ADM_Skill` schema,
  written straight to `skills`, embedded via a lightweight Celery task
  (`embed_skill_task`). **Shows up on the Skill Library page
  immediately** — `GET /skills` already reads this same collection
  directly, so there's no separate sync step; uploading the skill *is*
  updating the library.
- Any other format (free-text skill description) → routed through the
  existing Skill Normalizer (`project_id` required in this case — lands
  at `scope=user` pending the usual draft/approve review).

Sample skill YAML files matching the current schema are in
`sample_skills/` — upload `canonical_v1.yaml` (workflow) plus the task/
utility skill files to get a working Canonical catalog without writing
any YAML by hand first.

## Semantic skill discovery ("what skills do I need for X")

Tier 0 no longer holds the whole skill catalog in an LLM prompt context
(that was a deliberate month-1 simplification, documented as such at the
time, that stops scaling once the catalog grows past a handful of
skills). It now runs real semantic search over `skills` — every skill is
embedded on write (title + purpose + expected_output), searched via the
`skills` Atlas Vector Search index above. A Tier 0 question like *"what
skills do I need for source analysis"* returns a **ranked list**
(`matched_skills` on the assistant message), not just a single best
guess — each with a Preview card + its `/<skill_id>` composer shortcut.
Direct `/`-selection from the composer still does an exact `skill_id`
lookup, unaffected by any of this — semantic search is for discovery,
exact lookup is for when the user already knows what they want.

---

## Demo walkthrough

0. `POST /auth/register` → save `access_token`. `Authorization: Bearer <token>`
   on every request below (Swagger's "Authorize" button does this for you).
1. Promote yourself to admin (see above) if you want to upload KB/skill content.
2. `POST /admin/kb/upload` (kb_type=skill, upload `sample_skills/canonical_v1.yaml`,
   then each task/utility skill file) — builds your Canonical catalog.
3. `POST /admin/kb/upload` (kb_type=modeling, your own modeling documents,
   pick a chunking strategy) — builds the Modelling Reference KB.
4. `POST /projects` → create a project (layer=`silver`, domain=`your_domain`).
5. `POST /chats` → open a chat.
6. `POST /chats/{id}/messages` — `{"content": "Model this as Canonical", "file_refs": [...]}`
   → Tier 0/Tier 3 routing, clarifying question inline if info's missing.
7. `GET /contracts/{id}` → inspect the Plan → `PATCH` (optional) → `POST /approve`.
8. Watch live: `GET /chats/{chat_id}/stream` (NDJSON) or the WebSocket —
   full reasoning trace, not just lifecycle events.
9. `GET /contracts/{id}/hitl/pending` → `.../approve` or `.../edit` as gates fire.
10. `GET /contracts/{id}/provenance` (now includes `knowledge_used` citations
    per task), `.../download`, or `POST .../push-to-git`.

## What's deliberately NOT built (TDS §1, out of scope for first cut)

Data Vault / Dimensional / Data Mesh styles, Tier 2 single-stage routing,
standalone `TaskRunner`/`/run` execution, Execution Contract versioning
chains, Learning KB, general-purpose Redis caching, Event Bus, MCP tool
servers, multi-client override resolution, Existing Models KB (Stage 3
Step 8 is a stubbed no-op).
