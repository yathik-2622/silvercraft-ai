# Antigravity Brief — SilverCraft AI: Dynamic Skill-Driven Agents + Simplified Canvas

**Repo:** `silvercraft-ai-test` (existing codebase, attached)
**Reference specs already in repo root:** `ADM_2.0_BUILD_SPEC.md`, `ADM_2.0_AGENT_ARCHITECTURE_V2.md`, `ADM_2.0_API_ERRORS_AND_TOPOLOGY.md`
**New reference material (attached separately):** `silver-layer-skills/` (architect-authored skill files — authoritative for agent behavior), `golden-test-kit/` (golden dataset + expected outputs per stage — authoritative for correctness)

This is a **refactor brief against an existing codebase**, not a greenfield build. Read the current code before changing it — the task-pointer state shape, tool belt, and canvas foundation in this repo are largely correct and should be preserved. What's wrong is narrower and more specific than a rewrite: **agents are currently hardcoded per modeling style instead of being generic and skill-driven**, and there are two competing orchestration systems that need to collapse into one.

---

## 1. The core architectural change — read this first

**Current (wrong) pattern**, found in `backend/orchestrator.py`: a fixed agent identity per modeling style — `agent-data-vault`, `agent-logical-normalizer` (3NF), etc. — selected via `_required_agents_for_skill()`. Adding a new modeling style today means writing a new agent.

**Target pattern:** **5 generic, stage-owning agents** (matching `backend/core/agents/*.py`'s existing shape — keep that module, fix what's inside it) **plus the Orchestrator as a 6th, also generic.** None of them know about "3NF" or "Data Vault" or "Canonical" as concepts baked into code. Each agent's behavior is entirely determined by **whichever skill document(s) are bound to it at runtime.** One `LogicalModelingAgent` can produce a 3NF model, a Data Vault model, or a Canonical model — same agent, same code, different skill content injected into its context. This is the literal meaning of "give the agent a skill, it can do that skill" — a skill is a runtime behavior definition the agent interprets, not a compile-time branch.

**The agents:**
| Agent | Stage-owner for | Generic across |
|---|---|---|
| `SourceIntelligenceAgent` | Stage 1 (Source Analysis) | any profiling/classification/naming subtask skill |
| `ConceptualModelingAgent` | Stage 2 (Conceptual Model) | any concept-derivation skill |
| `LogicalModelingAgent` | Stage 3 (Logical Model) | **3NF / Data Vault / Canonical / any future style skill** |
| `PhysicalModelingAgent` | Stage 4 (Physical Model & STTM) | any target-dialect + style-implementation skill |
| `SkillCuratorAgent` | cross-cutting | matches/creates/binds skills, called by the other 4 and by Orchestrator |
| `Orchestrator` | pipeline control | resolves *which* skills apply per stage from `ProjectContext`, dispatches, gates — does not hardcode style either |

Delete `backend/orchestrator.py`'s `BUILTIN_SKILLS` dict, `SLASH_MAP`, `_required_agents_for_skill`, and `/plan` endpoint's fixed-4-node DAG logic. That entire file's job — routing a prompt to a hardcoded agent/skill combination — gets absorbed into the Orchestrator's dispatch logic in `backend/core/chat_orchestration.py`, driven by skill lookup, not a lookup table of agent names.

---

## 2. How skill-driven dispatch actually works (concrete mechanism)

### 2.1 Skill document shape (extend `models/skill.py`)
Every skill gets two classification fields, not just `stage_binding`:
```python
class Skill(BaseModel):
    ...
    stage_binding: Literal["source_analysis","conceptual","logical","physical","cross_cutting"]
    skill_kind: Literal["modeling_style", "subtask", "naming_convention", "target_dialect"]
    style_key: Optional[str] = None   # e.g. "3nf" | "datavault" | "canonical" — only set when skill_kind == "modeling_style"
```
Import `silver-layer-skills/*.md` as `builtin` skills at seed time, parsed from their frontmatter (`name`, `description`, `version` — already present in the architect's files) plus this inferred classification: files matching `03-logical-data-model-{style}-agent.md` and `04-physical-data-model-{style}-agent.md` → `skill_kind: modeling_style`, `style_key` extracted from filename. `01-source-analysis-agent.md`, `02-conceptual-data-model-agent.md` → `skill_kind: subtask`, no style_key (style-independent, per the architect's own "Style-Dependent? No" column in `00-pipeline-orchestrator.md`).

### 2.2 Runtime resolution (Orchestrator, before dispatching any stage-owner agent)
```python
async def resolve_active_skills(project_context, stage: str, db) -> list[str]:
    """Returns skill_ids to inject into this stage's task pointer."""
    bindings = project_context.active_skill_bindings.get(stage, [])   # explicit user-added skills, always included
    style_key = project_context.modeling_style_key                    # e.g. "datavault", set once at Gate 2 per architect's spec
    if stage in ("logical", "physical") and style_key:
        style_skill = await db.skills.find_one({
            "stage_binding": stage, "skill_kind": "modeling_style", "style_key": style_key
        })
        if style_skill:
            bindings.append(str(style_skill["_id"]))
    return bindings
```
This is *all* the "which agent do I use" logic needs to be. No agent-name lookup table. No per-style agent class. Style is data, resolved once per project (per the architect's own rule: "Style cannot change between LDM and PDM within a single run").

### 2.3 Agent system prompt must become style-agnostic
Rewrite every stage-owner agent's `SYSTEM_PROMPT` (currently in `source_intelligence.py`, `logical_modeling.py`, etc.) to the pattern below — this is the single most important text change in this brief:
```
You are {AgentName}, the senior {role} for this project. You do not have a fixed
modeling style or fixed subtask rules of your own. Your entire behavior is defined
by the "Active Skills" injected below — treat every active skill as an authoritative
rulebook, not a suggestion. If given a Data Vault skill, produce hubs/links/satellites
per its rules. If given a 3NF skill, produce normalized entities per its rules. If
given a Canonical skill, follow its merge/subject-area rules. Never default to a
style not present in your active skills — if no modeling-style skill is active for
this stage, ask for clarification rather than assuming one (surface as a
"needs_human_input" flag in your output, per the Convergence Rule below).

Multiple skills may be active simultaneously (e.g. one modeling-style skill + one
naming-convention skill + one subtask skill). Apply all of them. If two active
skills conflict, an explicit project-level directive from the user wins; otherwise
the more specific skill (subtask/naming) wins over the more general one (modeling
style).

CONVERGENCE RULE (from the pipeline orchestrator skill): if you run multiple internal
reasoning passes or sub-checks, converge them into ONE consolidated output before
returning — never return competing drafts. Unresolved ambiguity becomes a flagged
"needs_human_input" item inside your single output, not a second draft.
```
This replaces the hardcoded, style-specific prose currently in each agent file. The style-specific knowledge (what a Hub/Link/Satellite is, what 3NF requires) lives **only** in the skill markdown files from now on, never in Python.

---

## 3. Make the agents actually agentic (fix the monolithic-call problem)

Current: `node_profile_tables` etc. make one `llm_call()` and parse JSON. That's a structured LLM call, not an agent. Fix per stage-owner agent:

1. Wire the existing tool functions (`tool_query_mongo`, `tool_read_skill`, `tool_call_peer_agent`) into the LLM call as **actual function-calling tools** (OpenAI-compatible `tools=[...]` param — the repo's `llm_call()` helper needs a `tools` argument and a loop that executes tool calls and feeds results back until the model returns a final answer, not a single request/response).
2. Minimum viable ReAct loop per agent (replace the single `node_profile_tables`-style node with):
   ```
   node_init → node_plan (LLM decides what it needs: which sources, which skills,
   whether to consult a peer) → node_act (execute whatever tool calls the model
   requested) → node_observe (feed results back) → loop node_plan↔node_act up to
   a max_iterations budget → node_finalize (consolidate per Convergence Rule) →
   node_save_gate
   ```
3. **Fix the `db` injection bug now**: `SOURCE_INTELLIGENCE_GRAPH.ainvoke(initial_state)` must pass `db` through LangGraph's `config={"configurable": {"db": db}}` (or bind `db` via `functools.partial` on each node before graph construction) — right now every agent silently loses Mongo access the moment it runs through the compiled graph instead of the fallback path. This affects all 5 agent files identically; fix once, verify each.

---

## 4. Canvas — simplify to match the reference screenshots exactly

Reference: the 4 screenshots (Source Analysis / Conceptual Model / Logical Model / Physical Model & STTM stages) and the existing `StructuredCanvas.tsx`, which is 80% correct already.

**Keep exactly:**
- Stage rail across the top (`Source Analysis → Conceptual Model → Logical Model → Physical Model & STTM`), current stage highlighted, completed stages checkmarked — this already exists in `StudioPage.tsx`, keep it.
- Table View / Diagram View toggle (this is `view === 'erd'` vs the grid views in `StructuredCanvas.tsx` — rename to exactly **"Table View"** and **"Diagram View"** to match the reference UI copy).
- Diagram View = entity cards on canvas, nothing more — the existing `TableNode` React Flow component is close; strip it down to: entity name, role badge (FACT/DIM or Hub/Link/Sat per active skill), and column list. No extra chrome on the node itself.
- Save button + "Unsaved changes" pill — already correct, keep as-is.
- "Skill Files" pill with active-count badge, per the reference screenshots — surface which skills are currently bound to *this stage*, clickable to view/swap.

**Remove from the canvas surface itself:**
- The inline "Push to Git" and "Push to Metastore" buttons in `StructuredCanvas.tsx` (lines ~116–121) — these belong at the final-gate/session level (already correctly speced as owner-gated actions in `ADM_2.0_API_ERRORS_AND_TOPOLOGY.md` §2.4's `/sessions/{id}/push/*` endpoints), not floating inside every stage's canvas.
- Any per-view chrome beyond Table View / Diagram View toggle + Export + Approve-and-proceed (matching the reference screenshots' minimal top bar: title, Skill Files, Export, Approve & Proceed — nothing else).

**Two edit paths, one write path:** canvas direct-edit (inline rename, drag-relationship per the earlier agent-architecture spec §5) and chat-prompt edit ("make claim_id a surrogate key instead") must both terminate in the *same* mutation — a call to the owning agent's `/edit` handling, not two separate code paths. Concretely: a canvas edit constructs a synthetic instruction ("Human edited entity X, field Y, from A to B — validate and reconcile") and routes it through the same stage-owner agent's `run` function used for chat-driven edits, tagged `source: "canvas_edit"` vs `source: "chat_instruction"` only for audit/trace purposes — never a parallel mutation path that could drift from what the agent itself would produce.

---

## 5. Testing — wire up the golden-test-kit as a real eval harness

Nothing in the current repo reads `golden-test-kit/`. Add:
```
backend/tests/eval/
  test_golden_pipeline.py
    - loads golden-test-kit/golden-dataset/*.csv as the Stage 1 input
    - runs SourceIntelligenceAgent → asserts output structurally matches
      golden-test-kit/01-source-analysis/expected-output.md (not exact-string
      match — assert key facts: PK detection, PII flags, relationship discovery
      present and correct)
    - runs ConceptualModelingAgent on the approved Stage 1 output → compares
      against 02-conceptual-model/expected-output.md
    - runs LogicalModelingAgent three times, once per style_key (3nf, datavault,
      canonical), same Stage 2 input → compares each against the matching
      golden-test-kit/{03-3nf,04-datavault,05-canonical}/expected-output.md +
      ddl_*.sql — this is the test that actually proves the "one agent, N skills"
      architecture works: same agent code, three different correct outputs,
      driven only by which skill was injected.
```
This is the concrete acceptance test for the whole refactor: if `LogicalModelingAgent` can't produce all three golden outputs from the same class with only the skill swapped, the dynamic-agent goal isn't actually met yet.

---

## 6. What NOT to touch
- `backend/core/agents/base_agent.py`'s tool functions, `AgentState` shape, and peer-call budget logic — structurally correct, keep.
- `frontend/src/components/studio/StructuredCanvas.tsx`'s React Flow `TableNode` pattern and Save/dirty-state handling — correct pattern, just trim per §4.
- The Mongo-only storage decision, error envelope, and A2A/native peer-call transport branching already in the repo — all consistent with the agreed specs, no changes needed there.

## 7. Order of work
1. Fix the `db` injection bug (§3.3) — quick, unblocks everything else being testable.
2. Rewrite the 5 stage-owner system prompts to be style-agnostic (§2.3).
3. Add `skill_kind`/`style_key` to the skill model and seed `silver-layer-skills/*.md` (§2.1).
4. Implement `resolve_active_skills` in the Orchestrator, delete the hardcoded style→agent mapping in `orchestrator.py` (§2.2, §1).
5. Convert the single-call nodes into a real plan/act/observe loop with tool-calling (§3.1–3.2).
6. Trim the canvas to match the reference screenshots (§4).
7. Add the golden-test-kit eval harness (§5) and run it against all three logical-model styles as the acceptance gate for this whole refactor.
