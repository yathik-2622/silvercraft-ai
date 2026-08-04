# ADM 2.0 — Full UI Walkthrough (Sign-in → Completed Model → Git Push)

This is a click-by-click test script, not a conceptual guide. Every value
below (usernames, filenames, prompts, paths) is a real, literal value —
follow it exactly and you will reach a completed, downloaded, git-pushed
model without inventing any of your own test data. Swap in your own values
only where explicitly noted.

It exercises, in one continuous session:
- Admin promotion + skill catalog upload
- Project creation with `target_platform`
- Business Standards upload (project-scoped, unembedded)
- BYOK LLM settings (configure, break on purpose, fix, verify)
- A full Tier 3 modeling run: file upload → plan review/comment → approve →
  a mandatory HITL gate (edit path) → more HITL gates (approve path) →
  creating a skill mid-flow → all 4 stages completing
- Downloading the generated DDL and confirming it matches the platform you set
- Pushing the artifact to a local git repo
- Confirming BYOK actually fired for an Orchestrator call in this same session

Budget ~30-40 minutes end to end (most of it is waiting on the LLM during
Stage 1-4 execution).

---

## 0. Prerequisites — start the stack

Three terminals, from the repo root (`ADM_2o/`):

```bash
# Terminal 1 — Mongo must already be reachable (Atlas or local) via MONGO_URI in .env

# Terminal 2 — API
uvicorn app.main:app --reload --port 8080

# Terminal 3 — Celery worker
celery -A app.celery_app.celery_app worker --loglevel=info -P solo
```

Redis must be up first (`docker compose up -d`, or the WSL-native path in
`README.md` if Docker Desktop is being difficult).

```bash
# Terminal 4 — Frontend
cd frontend
npm run dev
```

Open **http://localhost:5173/**. Leave all four terminals running for the
rest of this walkthrough — you'll glance back at the Celery terminal a
few times to confirm background work picked up.

---

## Part 1 — Register and become admin

1. On the sign-in screen, click **Register** (bottom of the card).
2. Fill in:
   - **Username**: `adm_walkthrough_user`
   - **Email**: leave blank
   - **Password**: `Walkthrough#2026`
3. Click **Create account**. You land on the dashboard, logged in as a
   normal (non-admin) user — there is no **Admin** entry in the profile
   menu yet.
4. In a terminal, from `ADM_2o/`:
   ```bash
   python scripts/promote_admin.py adm_walkthrough_user
   ```
   Expect: `'adm_walkthrough_user' is now an admin. They'll need to log in again...`
5. Back in the browser: click your avatar (bottom-left) → **Sign Out**, then
   sign back in with the same username/password. `is_admin` is checked
   live against the DB on every request, never cached in the JWT, so this
   re-login is what actually picks up the promotion.
6. Click your avatar again — you should now see an **Admin** entry above
   **Sign Out**. If it's missing, the promotion script didn't match a user
   (typo in the username) — rerun it.

---

## Part 2 — Upload the skill catalog

The Canonical/3NF workflow needs 14 skill files, all already in the repo at
`sample_skills/`. Skills upload one file at a time.

1. Click **Admin** in the profile menu.
2. In the **Upload Skill (Global)** card, click the file input and select
   `sample_skills/workflow/canonical_v1.yaml`. Click **Upload**.
   Expect: `Uploaded directly: workflow_canonical (workflow) at scope=global.`
3. Repeat for every file below (same card, same button, one at a time —
   there's no multi-select on this input):
   ```
   sample_skills/task/profile_source.yaml
   sample_skills/task/build_data_dictionary.yaml
   sample_skills/task/cluster_subject_areas.yaml
   sample_skills/task/classify_sensitivity.yaml
   sample_skills/task/discover_relationships.yaml
   sample_skills/task/generate_conceptual_entities.yaml
   sample_skills/task/generate_conceptual_relationships.yaml
   sample_skills/task/classify_entity_role.yaml
   sample_skills/task/derive_keys.yaml
   sample_skills/task/resolve_relationships.yaml
   sample_skills/task/generate_ddl.yaml
   sample_skills/task/generate_sttm.yaml
   sample_skills/utility/merge_results.yaml
   ```
   Each should report `Uploaded directly: <skill_id> (<kind>) at scope=global.`
   — 13 uploads, 14 total with the workflow file from step 2.
4. Click **Skill Repository** in the sidebar and confirm all 14 skills are
   listed. This is a real check, not decoration — if the workflow skill's
   `task_list` references a `skill_id` that never got uploaded, the run
   in Part 6 will fail partway through Stage 1-4 with a "skill not found"
   error instead of a clean plan.

---

## Part 3 — Create the project

1. Click **Projects** in the sidebar → **Create New Project**.
2. Fill in:
   - **Project Name**: `Retail Customer Model`
   - **Domain**: `Retail / Customer Analytics`
   - **Layer**: `Silver — Foundation` (default, leave as-is)
   - **Target Platform**: select **Snowflake** — deliberately not the
     default (PostgreSQL), so the DDL you download in Part 10 is visibly
     platform-specific rather than accidentally matching the default.
3. Leave **Team Members** empty.
4. Click **Create & Launch**. You land in the project's empty workspace
   ("What are we modeling today?").

---

## Part 4 — Upload Business Standards for this project

1. Click **Admin** in the profile menu again.
2. In the **Upload Business Standards** card:
   - **Project**: select `Retail Customer Model` from the dropdown.
   - **File**: create a local file named `retail_standards.md` with exactly
     this content, then select it:
     ```markdown
     # Retail Business Standards — Retail Customer Model

     - Every customer table must retain a `customer_id` primary key with global uniqueness.
     - PII columns (email, full_name, phone) must be flagged `sensitivity: PII` at Stage 1.
     - All monetary fields are stored in USD cents (integer), never floating point.
     - Table names use `snake_case`, never `camelCase` or spaces.
     - Every foreign key relationship must be reviewed by a human before being finalized (mandatory HITL).
     ```
3. Click **Upload**. Expect: `Saved (### characters) as the business
   standards for this project.`
4. This is not chunked or embedded — it's stored whole and injected as
   run-invariant context for every task in this project's runs. You'll see
   its effect indirectly: Stage 1's `classify_sensitivity` output should
   flag `email` and `full_name` as PII (matching the standard above)
   without you ever mentioning PII in your chat prompt.

---

## Part 5 — Configure BYOK LLM settings

1. Click **Settings** in the profile menu.
2. In the **LLM Runtime (BYOK)** card:
   - **Provider**: leave at `Platform Gateway` for now — we'll switch it
     deliberately in Part 12, not here. This section is just to confirm
     the settings UI itself works before you rely on it later.
3. **Provider Keys** card: leave all four blank for now.
4. Click **Save Settings**. Expect `Settings saved.` and the **Model
   Catalog Preview** grid below populates with the platform gateway's
   models. This confirms the settings round-trip (GET/PUT) and the live
   model-discovery call both work before you touch anything mid-run.
5. Leave this page — we'll come back to actually configure a custom key
   in Part 12, after there's an existing chat session to test against.

---

## Part 6 — Start the modeling chat

1. Click **Retail Customer Model** in **Projects** if you navigated away
   (or you're still there from Part 3).
2. In the message composer, click the **paperclip** icon (left of the
   text box, title "Attach a source file").
3. Create a local file named `customers.csv` with exactly this content:
   ```csv
   customer_id,full_name,email,signup_date,account_status,lifetime_value
   c1,Alice Smith,alice@example.com,2024-01-05,active,1200.50
   c2,Bob Jones,bob@example.com,2024-02-11,active,340.00
   c3,Carla Diaz,carla@example.com,2024-03-02,inactive,0.00
   c4,Dan Lee,dan@example.com,2024-03-19,active,980.25
   c5,Eve Chen,eve@example.com,2024-04-01,active,55.10
   ```
   Select it. Wait for the "Uploading..." text to clear and a green chip
   reading `customers.csv (5 rows)` to appear above the composer.
4. Type this exact message and press **Enter** (or click **Send**):
   ```
   Model this as Canonical from my uploaded customers.csv file.
   ```
5. The message is classified as a **Tier 3** request (a full modeling
   request, not a how-to question) because it names a modeling style
   ("Canonical") and has an attached source. Within a few seconds you
   should see the **Live Reasoning** panel on the right start streaming
   node/log events, and shortly after, a **Plan** panel should appear
   showing a draft contract with 12 tasks across 4 stages.

If nothing appears after ~30s, check the Celery terminal (Terminal 3) for
a traceback — the most common cause at this point is a missing skill from
Part 2.

---

## Part 7 — Review the plan, comment, approve

1. In the **Plan** panel, status should read **Draft**.
2. Scroll the plan-comments box at the bottom-right of the panel and type:
   ```
   Please confirm PII columns get flagged before we finalize keys.
   ```
   Press the send arrow. This is the plan-editing step — a real
   human-in-the-loop annotation attached to the contract before it ever
   runs, visible to anyone else looking at this plan.
3. Click **Approve & Run** (top-right of the Plan panel). Status changes
   to **Running**, and the graph nodes start lighting up left to right as
   Stage 1 tasks execute.

---

## Part 8 — Resolve HITL gates

This workflow has 3 mandatory-review tasks: `discover_relationships`
(Stage 1), `derive_keys` (Stage 3), and `generate_ddl` (Stage 4). Each
pauses the run (**Awaiting Review** status) until you act on it.

**Gate 1 — `discover_relationships` (edit path):**

1. When the run pauses and a task node shows a pending-review indicator,
   click that node (`discover_relationships`).
2. The Task Detail panel opens with the task's proposed output. Click
   **Edit**.
3. You'll see the raw JSON output in a text box. Leave the structure
   intact — just confirm it's readable, then make one small deliberate
   change: if there's a `confidence` key in the output, change its value
   to `0.99`. If there isn't one, add `"reviewer_note": "confirmed manually"`
   as a top-level key.
4. Click **Save & Resume**. This exercises the actual edit path (not just
   approve) — the run resumes with your edited output instead of the
   original.

**Gate 2 — `derive_keys` (approve path):**

1. When the run reaches Stage 3 and pauses again, click the
   `derive_keys` node.
2. Review the proposed primary/foreign keys, then click **Approve**
   (no edit this time — demonstrates the plain approval path).

**Gate 3 — `generate_ddl` (approve path):**

1. When the run reaches Stage 4 and pauses on `generate_ddl`, click that
   node, review the proposed table/column output, and click **Approve**.

Between gates, the graph runs unattended — you're just waiting and
watching the Live Reasoning stream. No action needed until the next
pending-review node lights up.

---

## Part 9 — Create a skill mid-flow

While the run is anywhere between Stage 1 and Stage 3 (waiting on a gate
or mid-execution — this doesn't block or interact with the running
contract at all), create a new skill from the same chat:

1. In the message composer, type `/` (just the slash character). A menu
   appears with **Create Skill** at the top, plus your 14 uploaded skills
   below it.
2. Click **Create Skill**. A modal opens.
3. Fill in:
   - **Title**: `Flag PII Columns`
   - **Description**: `Flag columns containing personally identifiable information such as name, email, or phone, per the project's business standards.`
4. Click **Enhance & Preview**. Wait for the Skill Normalizer to process
   it (a few seconds) — the modal switches to a preview form with fields
   populated (Skill ID, Title, Purpose, Prompt, etc.) auto-derived from
   your description.
5. Check the pre-filled **Skill ID** — set it explicitly to
   `flag_pii_columns` if it isn't already. Set **Stage** to `1` and
   **HITL Mode** to `Auto — no review needed`. Leave the rest as
   generated.
6. Click **Confirm & Create**. Expect a success screen: `Skill created:
   Flag PII Columns` with the skill_id shown. Click **Done**.
7. This skill now exists at `scope=user` for your account — a real skill,
   created without leaving the chat, independent of the modeling run
   still in progress alongside it.

---

## Part 10 — Completion and DDL download

1. Continue resolving HITL gates from Part 8 as they appear until the
   Plan panel's status badge reads **Completed** and you see "All stages
   complete" with a green checkmark.
2. A new panel appears below the plan: **Download DDL** / **Push to Git**
   / **Provenance Report** buttons.
3. Click **Download DDL**. A `.sql` file downloads (named after the
   contract ID). Open it and confirm:
   - Table/column identifiers are wrapped in double quotes or use
     Snowflake conventions, **and** `CREATE TABLE IF NOT EXISTS` is used
     for each table — this is the Snowflake-specific syntax path. If you
     instead see plain unquoted identifiers with no `IF NOT EXISTS`,
     `target_platform` didn't propagate — check Part 3's project
     settings (**Projects** → pencil icon on the project card → confirm
     **Target Platform** still reads Snowflake).
4. Click **Provenance Report**. Confirm it lists all 12 tasks with their
   skill IDs, HITL outcomes (`mandatory → edited` for
   `discover_relationships`, `mandatory → approved` for the other two),
   and confidence scores.

---

## Part 11 — Push to Git

1. Still in the completion panel, click **Push to Git**. A small form
   expands with three fields.
2. Fill in:
   - **Local repo path**: `C:\adm-ddl-export` (this folder does not need
     to exist yet — the backend runs `git init` on it automatically if
     it's missing).
   - **Remote URL**: leave blank (a blank remote means a local-only
     commit — no GitHub/remote credentials needed for this walkthrough).
   - **Branch**: `main` (default, leave as-is).
3. Click **Push**. Expect `Enqueued — check the reasoning stream for the
   push result.`
4. Watch the Live Reasoning panel for a follow-up log line starting
   `git push result: Published ...`. Then confirm on disk:
   ```bash
   cd C:\adm-ddl-export
   git log --oneline
   ```
   You should see one commit (`ADM: publish artifact`) containing the
   same `.sql` file you downloaded in Part 10.

---

## Part 12 — Configure and verify BYOK for an Orchestrator call

This is done last, deliberately, so there's already a live chat session to
test against — and because the safest way to *prove* BYOK is wired up
(rather than silently falling back to the platform key) is to break it on
purpose first and watch it actually fail.

1. Get a free API key: sign up at `https://openrouter.ai/keys` (free tier,
   no payment method required) and copy a key (starts with `sk-or-`).
2. Click **Settings** in the profile menu.
3. First, the negative test — prove the custom path is really being hit:
   - **Provider**: select `Custom OpenAI Gateway`.
   - **Base URL**: `https://openrouter.ai/v1/WRONG` (deliberately broken
     path).
   - **Primary API key (Gateway / Custom)**: paste your real OpenRouter
     key.
   - Click **Save Settings**.
4. Go back to your `Retail Customer Model` chat (the same one from Parts
   6-11, still selected in the sidebar) and send a plain how-to question
   — not a modeling request, so it stays Tier 0 and returns quickly:
   ```
   How does 3NF normalization work?
   ```
5. Expect this to fail (an error message in the chat, or the Live
   Reasoning panel showing a fetch/connection error against the broken
   URL). This confirms the Orchestrator actually attempted your custom
   endpoint instead of silently using the platform's key — if it had
   silently used the platform key, this would have succeeded despite the
   broken URL.
6. Now fix it — back in **Settings**:
   - **Provider**: `OpenRouter`.
   - **Base URL**: clear it (leave blank — OpenRouter's provider default
     fills in automatically).
   - **OpenRouter key**: paste the same real key.
   - Click **Save Settings**. The **Model Catalog Preview** should
     refresh with OpenRouter's live model list.
7. In the chat's model dropdown (top-right of the composer, the small
   Cpu-icon select), pick any model from the now-refreshed list.
8. Send the same question again:
   ```
   How does 3NF normalization work?
   ```
9. Expect a normal streamed answer this time. Combined with step 5's
   failure, this is a real, observed round-trip proof that:
   - Your saved provider/key is genuinely reaching the Orchestrator's LLM
     call site (it failed when misconfigured, succeeded when fixed).
   - The Stage 1-4 modeling run you completed in Parts 6-11 was
     unaffected by any of this — it ran entirely on the platform's own
     key throughout, per BYOK's scope boundary (TaskWorker/SolutionAgent
     execution never resolves per-user settings, only the Orchestrator's
     two call sites do).

---

## What you've now verified, end to end

- A clean-boot backend creates zero documents until a real API call
  touches it (separately verified — see the startup-audit note in
  `SETUP_AND_TESTING.md` if you want to re-run that check).
- Admin promotion, global skill upload, and the Skill Repository reading
  those uploads back.
- Project creation with a real `target_platform`, reflected in the
  actual downloaded DDL's syntax (not just stored and ignored).
- Business Standards upload, and its effect on a real Stage 1 task's
  output (PII flagging) without restating the rule in the chat prompt.
- A full Tier 3 run: plan review with a real comment, an approved
  execution, one HITL gate resolved via edit and two via plain approval.
- A skill created interactively mid-run, independent of the run itself.
- A downloaded DDL artifact matching the configured platform, pushed to
  a real local git repository with a real commit.
- BYOK settings that visibly break the Orchestrator when misconfigured
  and visibly fix it when corrected — proving the resolution path is
  real, not decorative — while the modeling run itself stayed entirely
  on the platform key throughout, per the documented scope boundary.
