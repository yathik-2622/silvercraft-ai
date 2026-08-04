# ADM 2.0 — VS Code Setup & Testing Guide

## 1. Open in VS Code

```bash
unzip ADM_2.O.zip
code ADM_2.O
```

Recommended extensions: Python (Microsoft), Pylance. When VS Code prompts,
select the `.venv` you create below as the interpreter (bottom-right, or
`Cmd/Ctrl+Shift+P` → "Python: Select Interpreter").

## 2. Environment

```bash
cd ADM_2.O
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
```

Edit `.env`:
- `MONGO_URI` — your live cluster connection string
- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` — your LLM gateway
- `EMBEDDING_MODEL` — your embedding model
- `JWT_SECRET_KEY` — change from the placeholder
- Leave `VECTOR_INDEX_NAME` / `SKILL_VECTOR_INDEX_NAME` at their defaults
  unless you name your Atlas indexes something else (step 4)

## 3. Local Redis

```bash
docker compose up -d
```

Redis is used for exactly two things (Celery broker/backend + Pub/Sub
reasoning stream) — nothing else is cached here.

**If Docker Desktop won't cooperate** (its WSL2 integration is a known
flaky point — the Windows-side processes can look running while `dockerd`
never actually starts inside Docker Desktop's internal `docker-desktop`
WSL distro, and `docker ps` just hangs with nothing obviously wrong): try
`wsl --shutdown` from PowerShell, wait ~10s, relaunch Docker Desktop, give
it a minute before retrying. If that doesn't fix it, skip Docker
entirely and run Redis natively inside your normal WSL2 Ubuntu distro
instead:

```bash
sudo apt update && sudo apt install -y redis-server
sudo service redis-server start
redis-cli ping   # should return PONG
```

No `.env` change needed — WSL2 forwards `localhost` to the distro
automatically, so the default `REDIS_URL=redis://localhost:6379/0` reaches
this Redis the same as the Docker one, and it has no Docker Desktop
dependency at all.

## 4. Create the two Atlas Vector Search indexes

In Atlas UI: your cluster → **Search** → **Create Search Index** → **JSON
Editor**. Do this twice:

**On `modeling_reference`** (index name must match `VECTOR_INDEX_NAME`,
default `modeling_reference_vector_index`):
```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "doc_type" },
    { "type": "filter", "path": "source_doc_id" }
  ]
}
```

**On `skills`** (index name must match `SKILL_VECTOR_INDEX_NAME`, default
`skills_vector_index`):
```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "kind" },
    { "type": "filter", "path": "scope" }
  ]
}
```

If you skip this step, everything still works — the code falls back to
in-Python cosine similarity automatically — just slower at real scale.
Create both indexes when you're ready for production-shaped performance.

## 5. Run the app (two terminals)

```bash
# Terminal 1 — API
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Celery worker
celery -A app.celery_app.celery_app worker --loglevel=info -P solo
```

Open `http://localhost:8000/docs` — this is your full interactive test
surface (Swagger). Every request below can be run from here, from
Postman, or from `curl`.

## 6. Register + become admin

1. `/docs` → `POST /auth/register` → `{"username": "you", "password": "..."}`
   → copy the returned `access_token`.
2. Click **Authorize** (top right of `/docs`) → paste the token.
3. In a terminal:
   ```bash
   python scripts/promote_admin.py you
   ```
4. Log in again (`POST /auth/login`) — `is_admin` is checked live against
   the DB on every request, never cached in the token, so a stale token
   from before promotion won't show it.

## 7. Upload the sample skill catalog (proves admin YAML path + global scope)

Via `/docs`, `POST /admin/kb/upload`, `kb_type=skill`, upload each file in
`sample_skills/`: `workflow/canonical_v1.yaml` first, then everything
under `task/` and `utility/` (order doesn't matter beyond that).

**What to check**: `GET /skills` — every uploaded skill should show
`"scope": "global"`, even though the YAML files themselves say
`scope: global` already (you can verify the *forcing* behavior
specifically by editing one YAML's `scope:` line to `user` before
uploading — the response will include a `note` field confirming it was
forced back to `global`, and `GET /skills` will still show `global`).

## 8. Upload a modeling reference doc (proves multi-format + chunking + citations)

`POST /admin/kb/upload`, `kb_type=modeling`, pick a `title`, pick a
`chunking_strategy` (`markdown`/`recursive`/`sliding_window`/
`page_aware`), upload any `.md`/`.txt`/`.pdf`/`.docx`/`.pptx` file — a
short markdown file describing 3NF normalization rules is a good first
test.

Watch it process live: `GET /admin/kb/upload/{doc_id}/stream` (NDJSON —
open in a browser tab, or `curl -N` to see it stream). Once
`status: "ready"` on `GET /admin/kb/documents`, it's searchable.

## 9. Test Tier 0 semantic skill discovery

`POST /projects` → `POST /chats` (with that `project_id`) →
`POST /chats/{id}/messages`:
```json
{"content": "What skills do I need for source analysis?", "file_refs": [], "selected_skill_ids": []}
```
Watch the response land on the chat (`GET /chats/{id}`) or stream live via
`GET /chats/{id}/stream` — the assistant message should include a
`matched_skills` array (ranked, from real vector search over `skills`,
not keyword matching) and `citations` if your uploaded KB doc was
relevant to the answer.

## 10. Test a free-text admin skill upload (proves convert-then-embed + global scope)

`POST /admin/kb/upload`, `kb_type=skill`, `project_id=<any real project_id>`,
upload a `.txt` file describing a skill in plain English (e.g. "This
skill should flag columns that look like phone numbers based on naming
patterns and data type, for PII classification purposes"). Response
includes a `draft_id` note.

`GET /skill-drafts/{draft_id}` — check `missing_fields`; if any, `PATCH
/skill-drafts/{draft_id}` with the missing values, then `POST
/skill-drafts/{draft_id}/approve`. Confirm via `GET /skills/{skill_id}`
that it landed at `"scope": "global"` (not `"user"`) — this is the fix
from this pass. Re-run step 9's Tier 0 question and confirm this new
skill can now show up in `matched_skills`.

## 11. Full Tier 3 run

`POST /chats/{id}/messages`:
```json
{"content": "Model this as Canonical", "file_refs": [{"raw_file_id": "<from POST /uploads>"}], "selected_skill_ids": []}
```
Then `GET /contracts/{id}` → `PATCH` (optional) → `POST /approve` →
watch `GET /chats/{id}/stream` for the full reasoning trace → resolve
HITL gates via `GET /contracts/{id}/hitl/pending` → `.../approve` or
`.../edit` → `GET /contracts/{id}/provenance` for the final report
(includes `knowledge_used` citations per task).

## Troubleshooting

- **Celery task never runs / API 500s on `.delay()` with a Celery result-backend
  reconnect error**: Redis isn't actually reachable — confirm Terminal 2
  is running and connected to the same `REDIS_URL` as the API, and that
  Redis itself is up (`redis-cli -u <REDIS_URL> ping`). If Redis runs via
  Docker and this just started happening, Docker Desktop's own engine may
  be the problem, not your code — see the Docker Desktop troubleshooting
  note in step 3 above (WSL-native Redis has no Docker Desktop dependency
  at all, so it's immune to this specific failure mode).
- **`MongoDBSaver` connection errors**: confirm `MONGO_URI` is reachable
  from your machine (Atlas network access list, VPN, etc.) — the
  Send-based fan-out graph's checkpointer needs this on every stage.
- **Vector search returns nothing**: check `GET /admin/kb/documents`
  shows `status: "ready"`, not `"processing"` or `"failed"`; if `"failed"`,
  check Terminal 2's Celery logs for the embedding-call error (usually a
  bad `EMBEDDING_MODEL` name or gateway credential).

---

## 12. What's new — collaborators, chat CRUD, model override, plan comments

Six additions closed in this pass, all requested by the frontend build
spec before Claude Code starts on the matching UI.

### Project collaborators + ownership tiers
- `POST /projects/{id}/collaborators` (owner-only, body `{"username": "..."}`)
- `DELETE /projects/{id}/collaborators/{user_id}` (owner-only)
- `GET /projects/{id}/collaborators` (owner or collaborator)
- `PATCH /projects/{id}` / `DELETE /projects/{id}` (owner-only)
- `GET /projects?scope=owned|shared|all` — maps directly to "My Projects"
  vs "Shared with me"

**Test**: register a second user, note their username. As user A,
`POST /projects` then `POST /projects/{id}/collaborators` with user B's
username. Log in as user B, `GET /projects?scope=shared` should show it;
`PATCH`/`DELETE` on that project as user B should 404 (not 403 — same
"don't reveal what you can't touch" rule as everywhere else).

### Chats are now project-wide, not creator-only
`GET /chats?project_id=` now returns every chat in the project, visible
to any member — previously filtered to `user_id == caller`, which broke
the "team can also access that project" requirement outright. New:
`PATCH /chats/{id}` (rename, or set `orchestrator_model`),
`DELETE /chats/{id}`. Both are project-access-level (owner or any
collaborator), matching the shared-visibility default — see the code
comment in `routes_chats.py::ADM_delete_chat` if you want creator-only
delete instead.

**Test**: as user B (collaborator from above), `GET /chats?project_id=`
should show chats user A created in that project, and `POST /chats` should
let B create their own.

### WebSocket auth (real gap, not on your list, closed while in this code)
`/ws/chats/{chat_id}` previously had zero auth — closed via a `?token=`
query param (browsers can't set WS headers), validated exactly like every
HTTP route, then the same project-access check. Connect with
`ws://localhost:8000/ws/chats/{chat_id}?token=<your JWT>`.

### Server-side chat auto-naming
The Orchestrator's existing intent-classification call now also returns a
`title` field — applied to the chat only on its first message, only if
the title is still the default ("New chat") and hasn't been manually
renamed since (`title_is_default` flag, flips false on any `PATCH`).

**Test**: `POST /chats` with no `title`, send a first message, then
`GET /chats/{id}` — title should reflect the message's intent within a
few seconds (after the Celery worker processes it), not "New chat".

### Per-chat Orchestrator model override
`PATCH /chats/{id}` with `{"orchestrator_model": "gpt-4o-mini"}` (or
whatever your gateway supports) — every subsequent message in that chat
uses this model for Orchestrator calls (intent classification, Tier 0
answers) only. TaskWorker/SolutionAgent execution is untouched — it still
uses the global `LLM_MODEL` setting, exactly as scoped in the frontend
spec.

### `POST /skills/import` returns `draft_id`
Previously `{"status": "accepted"}` with no way to know which draft your
upload produced. Now returns `{"status": "accepted", "draft_id": "..."}`
immediately — poll `GET /skill-drafts/{draft_id}` right away instead of
having no handle on it. Same fix applied to the admin free-text skill
upload path (`POST /admin/kb/upload`, `kb_type=skill`, non-YAML file).

### Plan comments
`POST /contracts/{id}/comments` with `{"text": "..."}` — any project
member can comment, at any contract status (not blocked by `immutable`
the way stage edits are). Comments appear in `GET /contracts/{id}` under
`comments: [{author_user_id, text, created_at}]`.

## 13. "My Skills" — created_by_user_id + GET /skills?mine=true

`scope=user` alone couldn't answer "show me the skills I made" — it
would mix every user's personal skills together with no way to tell them
apart. `ADM_Skill` now carries `created_by_user_id` (set on approval for
`target_scope="user"` drafts, left `None` for `target_scope="global"`
admin uploads — nothing personal to attribute there).

**Test**: as any non-admin user, create a skill via `POST /skills/import`
+ approve the resulting draft. `GET /skills?mine=true` should show it;
log in as a *different* user and repeat `GET /skills?mine=true` — it
should NOT show the first user's skill. `GET /skills` (no `mine` param)
still shows both, same as before.
