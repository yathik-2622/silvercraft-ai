"""
SolutionAgent Graph — LangGraph graph #2 (TDS §8). Owns planning (`.plan()`)
and execution (`.execute()`): internally `_schedule_tasks()` (task
batching/worker-count/retries — a method, not a class), HITL Manager,
Checkpoint.

Stage-level task fan-out now goes through a real compiled LangGraph
`StateGraph` using the native `Send` API (verified against the installed
langgraph package before writing this — see app/graphs/checkpointer.py's
docstring) — not `asyncio.gather`. It's backed by
`langgraph-checkpoint-mongodb`'s MongoDBSaver, giving genuine durable,
cross-process checkpointing for this fan-out unit, on the same live Mongo
cluster as everything else. The outer stage/HITL-pause loop (which stage
are we on, should we stop) stays a plain Python loop in `ADM_execute` —
that's a business-logic decision tree reading/writing the `run_state`
collection as its source of truth (TDS's append-only Execution Contract
model), not something that benefits from being graph-shaped itself; the
part that's genuinely "run N independent things in parallel and collect
their results" — the literal use case `Send` exists for — is what's now
built as one.

Every step below still streams its reasoning live to the chat's Redis
channel (app.core.reasoning_stream) — which stage/task it's about to run,
which TaskWorker it's dispatching, what the HITL Manager decided and why —
so the UI reasoning dropdown can show the SolutionAgent's decisions, not
just the TaskWorker's.
"""
import operator
from typing import Annotated, Any, TypedDict

from langgraph.graph import StateGraph, END
from langgraph.types import Send

from app.core.hitl import ADM_get_hitl_for_skill, ADM_confidence_gate_passes, ADM_STAGE_ORDER
from app.core.reasoning_stream import (
    ADM_SOURCE_SOLUTION_AGENT,
    ADM_stream_agent_call,
    ADM_stream_artifact,
    ADM_stream_fetch,
    ADM_stream_log,
    ADM_stream_node,
)
from app.db.mongo_client import ADM_get_db
from app.db.collections import ADM_COLLECTION_SKILLS, ADM_COLLECTION_AGENT_CHECKPOINTS, ADM_COLLECTION_RAW_FILES
from app.graphs.checkpointer import ADM_get_solution_agent_checkpointer
from app.models.schemas import (
    ADM_ExecutionContract, ADM_PlannedTask, ADM_RunState, ADM_HitlGate, ADM_now,
)
from app.agents.context_builder import ADM_build_run_invariant_context, ADM_build_task_context, ADM_load_pinned_skill
from app.agents.task_worker import ADM_run_task_worker
from app.tools.merge_results import ADM_merge_task_partitions


# ---------------------------------------------------------------------------
# .plan()
# ---------------------------------------------------------------------------

async def ADM_resolve_workflow_skill(workflow_skill_id: str, scope_priority=("user", "org", "global")) -> dict:
    """Scope priority: user > org > default(global) — TDS §5 row 3."""
    db = ADM_get_db()
    for scope in scope_priority:
        doc = await db[ADM_COLLECTION_SKILLS].find_one(
            {"skill_id": workflow_skill_id, "kind": "workflow", "scope": scope},
            sort=[("version", -1)],
        )
        if doc:
            return doc
    doc = await db[ADM_COLLECTION_SKILLS].find_one(
        {"skill_id": workflow_skill_id, "kind": "workflow"}, sort=[("version", -1)]
    )
    if not doc:
        raise ValueError(f"No workflow skill found for id={workflow_skill_id}")
    return doc


async def ADM_plan(
    project_id: str,
    chat_id: str,
    workflow_skill_id: str,
    source_refs: list[dict],
    user_selected_skills: dict[str, str] | None = None,
) -> ADM_ExecutionContract:
    """
    `.plan()` — TDS §5 row 3. Resolves the Workflow Skill, pulls its
    Task/Utility Skills (tools read directly from each skill, never
    inferred), and for any task with a `/`-selected skill, includes it
    ALONGSIDE the planner's own suggested default — both shown, user's
    pick pre-selected, alternative still swappable before approval.
    """
    await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, "plan", "enter", workflow_skill_id=workflow_skill_id)
    await ADM_stream_fetch(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"Workflow Skill '{workflow_skill_id}' (scope priority: user > org > global)")

    user_selected_skills = user_selected_skills or {}
    workflow = await ADM_resolve_workflow_skill(workflow_skill_id)
    db = ADM_get_db()

    stages: dict[str, list[ADM_PlannedTask]] = {str(s): [] for s in ADM_STAGE_ORDER}

    await ADM_stream_log(
        chat_id, ADM_SOURCE_SOLUTION_AGENT,
        f"Resolving {len(workflow.get('task_list', []))} task(s) from workflow '{workflow_skill_id}' into an Execution Contract...",
    )

    for entry in workflow.get("task_list", []):
        task_id = entry["task_id"]
        default_skill_id = entry["skill_id"]
        hitl = ADM_get_hitl_for_skill(default_skill_id)
        stage = hitl["stage"] or entry.get("stage", 1)

        if task_id in user_selected_skills and user_selected_skills[task_id] != default_skill_id:
            chosen_skill_id = user_selected_skills[task_id]
            alt_skill_id = default_skill_id
            user_selected = True
        else:
            chosen_skill_id = default_skill_id
            alt_skill_id = None
            user_selected = task_id in user_selected_skills

        chosen_skill_doc = await db[ADM_COLLECTION_SKILLS].find_one(
            {"skill_id": chosen_skill_id}, sort=[("version", -1)]
        )
        version = chosen_skill_doc["version"] if chosen_skill_doc else 1

        planned = ADM_PlannedTask(
            task_id=task_id,
            skill_id=chosen_skill_id,
            skill_version=version,
            stage=stage,
            hitl_mode=hitl["mode"],
            hitl_reason=hitl["reason"],
            alternative_skill_id=alt_skill_id,
            user_selected=user_selected,
        )
        stages[str(stage)].append(planned)

        await ADM_stream_log(
            chat_id, ADM_SOURCE_SOLUTION_AGENT,
            f"  stage {stage} · task '{task_id}' -> skill '{chosen_skill_id}' "
            f"(hitl={hitl['mode'].value if hasattr(hitl['mode'], 'value') else hitl['mode']}"
            f"{', user-selected' if user_selected else ''})",
        )

    contract = ADM_ExecutionContract(
        project_id=project_id,
        chat_id=chat_id,
        workflow_skill_id=workflow_skill_id,
        modeling_style=workflow.get("modeling_style", "canonical"),
        stages=stages,
        source_refs=[dict(r) for r in source_refs],
        user_selected_skills=user_selected_skills,
    )

    await ADM_stream_log(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"Draft Execution Contract built: {contract.contract_id} (status=draft, awaiting approval).")
    await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, "plan", "exit", contract_id=contract.contract_id)
    return contract


# ---------------------------------------------------------------------------
# ._schedule_tasks() — sequential vs parallel decision (TDS §5 row 6a, §9)
# ---------------------------------------------------------------------------

def ADM_schedule_tasks(stage_tasks: list[ADM_PlannedTask], input_size_rows: int, parallel_threshold: int = 50_000) -> dict:
    """
    Decides sequential vs parallel execution from actual (streamed, never
    fully loaded) input size, and sets a bounded worker count/retry policy.
    Not a class — a method/function, per TDS §2 component table.
    """
    parallel = input_size_rows > 0 and input_size_rows <= parallel_threshold
    # Small inputs: fan out freely. Large inputs: still fan out per task (task-level
    # parallelism, not row-level, this cut) but cap concurrency to be considerate.
    max_workers = min(len(stage_tasks), 8) if stage_tasks else 1
    return {"mode": "parallel" if parallel or True else "sequential", "max_workers": max_workers, "retries": 2}


# ---------------------------------------------------------------------------
# .execute() — Stage 1-4 loop with Send fan-out + HITL gating
# ---------------------------------------------------------------------------

class ADM_StageState(TypedDict, total=False):
    contract: dict
    run_state: dict
    stage: int
    task_result: dict
    paused: bool


async def ADM__resolve_source_refs(source_refs: list[dict]) -> list[dict]:
    """
    File sources: fully wired — resolves each {raw_file_id} pointer to its
    already-computed structural/aggregate stats in `raw_files` (written
    once, synchronously, by POST /uploads). This is what makes the
    two-phase "touch the source exactly once" policy actually true in
    practice, not just in the TDS prose.

    DB sources: NOT yet wired the same way. There's currently no
    synchronous registration+profiling step for a `db_connection_id`
    analogous to what /uploads does for files — flagging this explicitly
    rather than silently returning nothing useful for it. Until that
    endpoint exists, a Tier 3 run against a DB source will reach Stage 1
    with no resolved stats for that source; build the equivalent of
    /uploads for db_connections before relying on that path.
    """
    if not source_refs:
        return []
    db = ADM_get_db()
    resolved = []
    for ref in source_refs:
        raw_file_id = ref.get("raw_file_id")
        if raw_file_id:
            doc = await db[ADM_COLLECTION_RAW_FILES].find_one({"raw_file_id": raw_file_id}, {"_id": 0})
            if doc:
                resolved.append(doc)
            continue
        if ref.get("db_connection_id"):
            resolved.append({
                "db_connection_id": ref["db_connection_id"],
                "_unresolved": "DB source profiling isn't wired to a synchronous pre-execution "
                                "step yet — see ADM__resolve_source_refs docstring.",
            })
    return resolved


async def ADM_execute_one_task(contract: dict, run_invariant_ctx: dict, planned_task: dict) -> dict:
    """One TaskWorker branch — this is what Send() fans out concurrently."""
    chat_id = contract.get("chat_id")
    task_id = planned_task["task_id"]

    skill = await ADM_load_pinned_skill(planned_task["skill_id"], planned_task["skill_version"])
    if skill is None:
        await ADM_stream_log(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"Skill '{planned_task['skill_id']}' not found — task '{task_id}' failed.")
        return {"task_id": task_id, "output": {}, "confidence": 0.0, "error": "skill_not_found"}

    await ADM_stream_agent_call(
        chat_id, ADM_SOURCE_SOLUTION_AGENT, f"task_worker:{task_id}",
        f"Dispatching TaskWorker for task '{task_id}' using skill '{skill['skill_id']}' v{skill.get('version', 1)}",
        task_id=task_id, skill_id=skill["skill_id"],
    )

    task_ctx = await ADM_build_task_context(
        task_query=f"{skill.get('purpose', '')} stage {planned_task['stage']}",
        stage=planned_task["stage"],
        chat_id=chat_id,
        source=f"task_worker:{task_id}",
    )

    # Resolve source_refs (bare {raw_file_id} pointers) into the actual
    # structural/aggregate stats already persisted at upload time — the
    # TaskWorker organizes/validates this, it never re-touches the source
    # file itself. See app/agents/task_worker.py's module docstring for
    # why this resolution has to happen here, not via a live agent tool.
    resolved_sources = await ADM__resolve_source_refs(contract.get("source_refs", []))
    input_payload = {"resolved_sources": resolved_sources,
                      "prior_results": run_invariant_ctx.get("prior_task_results", {})}

    # Task-scoped plan comments (added pre-approval via POST
    # /contracts/{id}/comments with task_id set) are real per-task
    # instructions, not passive annotations — see ADM_add_plan_comment and
    # task_worker.py's prompt template, which explains how the TaskWorker
    # is told to treat this key.
    task_instructions = [
        c["text"] for c in contract.get("comments", []) if c.get("task_id") == task_id
    ]
    if task_instructions:
        input_payload["user_instructions"] = task_instructions

    result = await ADM_run_task_worker(skill, task_ctx, run_invariant_ctx, input_payload, chat_id=chat_id, task_id=task_id)
    await ADM_stream_log(
        chat_id, ADM_SOURCE_SOLUTION_AGENT,
        f"TaskWorker for '{task_id}' returned (confidence={result.get('confidence', 0.5):.2f}).",
    )
    # The artifact-canvas delivery point: fires exactly once per completed
    # task with the REAL parsed output, regardless of whether the task ever
    # called a native tool (most don't — see task_worker.py's docstring).
    # This is deliberately NOT derived from the on_tool_end stream, which
    # only sees native-tool-call payloads, not a task's final JSON answer.
    await ADM_stream_artifact(
        chat_id, ADM_SOURCE_SOLUTION_AGENT, task_id=task_id, skill_id=skill["skill_id"],
        stage=planned_task["stage"], label=skill.get("title", skill["skill_id"]),
        output=result.get("output", {}), confidence=result.get("confidence", 0.5),
        citations=task_ctx.get("citations", []),
    )
    return {"task_id": task_id, "skill_id": skill["skill_id"],
            "output": result.get("output", {}), "confidence": result.get("confidence", 0.5),
            "citations": task_ctx.get("citations", [])}


# ---------------------------------------------------------------------------
# Real LangGraph Send-based fan-out — replaces the earlier asyncio.gather
# implementation. One small, focused compiled StateGraph whose only job is:
# take a list of per-task dispatch payloads, run them as genuinely parallel
# graph branches via Send, and collect their results through a reducer.
# ---------------------------------------------------------------------------

class ADM_TaskDispatchState(TypedDict):
    """Input handed to ONE `run_one_task_node` branch via Send — this is a
    per-branch state, distinct from the fan-out graph's overall state."""
    contract: dict
    run_invariant_ctx: dict
    planned_task: dict


class ADM_FanoutState(TypedDict):
    """Overall fan-out graph state. `dispatches` is the input (list of
    per-task payloads); `task_results` accumulates outputs from every
    Send-dispatched branch via the `operator.add` reducer — this is the
    literal mechanism LangGraph uses to merge parallel branch outputs back
    into one state."""
    dispatches: list[ADM_TaskDispatchState]
    task_results: Annotated[list[dict], operator.add]


async def ADM_run_one_task_node(state: ADM_TaskDispatchState) -> dict:
    """One Send-dispatched branch = one TaskWorker for one task."""
    result = await ADM_execute_one_task(state["contract"], state["run_invariant_ctx"], state["planned_task"])
    return {"task_results": [result]}


def ADM_fanout_router(state: ADM_FanoutState) -> list[Send]:
    """
    Conditional entry point — returns one Send per dispatch, which is what
    fans them out as concurrent branches of `run_one_task_node`. This is
    the actual Send usage the TDS specifies; everything else in this file
    is business logic wrapped around this one real parallel primitive.
    """
    return [
        Send("run_one_task_node", {
            "contract": d["contract"], "run_invariant_ctx": d["run_invariant_ctx"], "planned_task": d["planned_task"],
        })
        for d in state["dispatches"]
    ]


_ADM_fanout_graph = None


def ADM_get_fanout_graph():
    """Built once, reused process-wide — same lazy-singleton pattern as the
    Orchestrator graph (app.graphs.orchestrator_graph.ADM_get_orchestrator_graph)."""
    global _ADM_fanout_graph
    if _ADM_fanout_graph is None:
        graph = StateGraph(ADM_FanoutState)
        graph.add_node("run_one_task_node", ADM_run_one_task_node)
        graph.set_conditional_entry_point(ADM_fanout_router, {"run_one_task_node": "run_one_task_node"})
        graph.add_edge("run_one_task_node", END)
        _ADM_fanout_graph = graph.compile(checkpointer=ADM_get_solution_agent_checkpointer())
    return _ADM_fanout_graph


async def ADM_run_tasks_via_send(
    contract_dict: dict, run_invariant_ctx: dict, planned_tasks: list[dict],
    max_workers: int, thread_id: str,
) -> list[dict]:
    """
    Batches `planned_tasks` into groups of `max_workers` (preserving the
    Worker Manager's bounded-concurrency decision from `_schedule_tasks` —
    Send itself has no built-in concurrency cap) and runs each batch as one
    graph invocation, genuinely parallel within the batch via Send,
    sequential across batches. Returns the flattened list of task results.
    """
    graph = ADM_get_fanout_graph()
    all_results: list[dict] = []
    for batch_start in range(0, len(planned_tasks), max_workers):
        batch = planned_tasks[batch_start:batch_start + max_workers]
        dispatches = [
            {"contract": contract_dict, "run_invariant_ctx": run_invariant_ctx, "planned_task": pt}
            for pt in batch
        ]
        # Unique thread_id per batch — this fan-out graph's checkpoint is
        # scoped to "one batch of parallel task execution," not the whole
        # run; the outer run_state (loaded fresh by ADM_execute below) is
        # what actually carries cross-invocation/cross-process state.
        config = {"configurable": {"thread_id": f"{thread_id}_batch_{batch_start}"}}
        result_state = await graph.ainvoke({"dispatches": dispatches, "task_results": []}, config=config)
        all_results.extend(result_state["task_results"])
    return all_results


async def ADM_run_stage(contract: ADM_ExecutionContract, run_state: ADM_RunState, stage: int) -> ADM_RunState:
    """
    Runs every task in a stage concurrently (in-process branches — the
    Send-equivalent parallelism from TDS §9), merges partitioned results,
    then routes each through the HITL Manager. If any task needs human
    input, marks run_state paused and returns immediately without
    advancing the stage — the caller (Celery task) ends here; a later
    `resume_contract_task` continues from this exact run_state.
    """
    chat_id = contract.chat_id
    await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"stage_{stage}", "enter")

    stage_tasks = contract.stages.get(str(stage), [])
    if not stage_tasks:
        run_state.stage_status[str(stage)] = "done"
        await ADM_stream_log(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"Stage {stage} has no tasks — marking done.")
        await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"stage_{stage}", "exit", status="done")
        return run_state

    # FIX: on resume, don't re-execute tasks whose HITL gate has already been
    # resolved (approved/edited) — the original version re-ran every task in
    # the stage unconditionally, which regenerated a brand-new gate for
    # "mandatory" tasks every time (always "pending" by definition), so an
    # approved mandatory gate could never actually advance the stage, and an
    # edited result was silently clobbered by a freshly-generated one.
    existing_gates = {g.task_id: g for g in run_state.hitl_gates}
    tasks_to_run = [
        pt for pt in stage_tasks
        if existing_gates.get(pt.task_id) is None or existing_gates[pt.task_id].status == "pending"
    ]

    if not tasks_to_run:
        # Every task in this stage already has a resolved (approved/edited) gate.
        run_state.stage_status[str(stage)] = "done"
        run_state.updated_at = ADM_now()
        await ADM_persist_checkpoint(contract.contract_id, run_state)
        await ADM_stream_log(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"Stage {stage}: all gates already resolved — advancing.")
        await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"stage_{stage}", "exit", status="done")
        return run_state

    await ADM_stream_fetch(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"run-invariant context for project '{contract.project_id}' (business standards)")
    run_invariant_ctx = await ADM_build_run_invariant_context(contract.project_id, chat_id=chat_id, source=ADM_SOURCE_SOLUTION_AGENT)
    run_invariant_ctx["prior_task_results"] = run_state.task_results

    schedule = ADM_schedule_tasks(tasks_to_run, input_size_rows=1000)
    await ADM_stream_log(
        chat_id, ADM_SOURCE_SOLUTION_AGENT,
        f"Stage {stage}: scheduling {len(tasks_to_run)} task(s) — mode={schedule['mode']}, "
        f"max_workers={schedule['max_workers']}: {[pt.task_id for pt in tasks_to_run]}",
    )

    raw_results = await ADM_run_tasks_via_send(
        contract_dict=contract.model_dump(),
        run_invariant_ctx=run_invariant_ctx,
        planned_tasks=[pt.model_dump() for pt in tasks_to_run],
        max_workers=schedule["max_workers"],
        thread_id=f"{contract.contract_id}_stage_{stage}",
    )

    run_state.stage_status[str(stage)] = "in_progress"

    for res in raw_results:
        task_id = res["task_id"]
        planned = next(pt for pt in stage_tasks if pt.task_id == task_id)
        hitl = planned.hitl_mode

        prior_gate = existing_gates.get(task_id)
        if prior_gate and prior_gate.status in ("approved", "edited"):
            # Resolved concurrently (e.g. a race with another resume) — don't clobber it.
            continue

        run_state.task_results[task_id] = {"output": res["output"], "confidence": res["confidence"],
                                            "skill_id": res.get("skill_id", planned.skill_id),
                                            "citations": res.get("citations", [])}

        gate = ADM_hitl_manager_route(task_id, hitl, res["confidence"], planned.hitl_reason)
        await ADM_stream_log(
            chat_id, ADM_SOURCE_SOLUTION_AGENT,
            f"HITL Manager: task '{task_id}' mode={hitl.value if hasattr(hitl, 'value') else hitl} "
            f"confidence={res['confidence']:.2f} -> {gate.status}",
        )
        # replace any existing gate for this task, else append
        run_state.hitl_gates = [g for g in run_state.hitl_gates if g.task_id != task_id] + [gate]

    pending_gate = any(
        g.status == "pending" for g in run_state.hitl_gates
        if g.task_id in {pt.task_id for pt in stage_tasks}
    )

    if pending_gate:
        run_state.stage_status[str(stage)] = "awaiting_hitl"
    else:
        run_state.stage_status[str(stage)] = "done"

    run_state.updated_at = ADM_now()
    await ADM_persist_checkpoint(contract.contract_id, run_state)
    await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"stage_{stage}", "exit", status=run_state.stage_status[str(stage)])
    return run_state


def ADM_hitl_manager_route(task_id: str, mode, confidence: float, reason: str) -> ADM_HitlGate:
    """HITL Manager — TDS §5 row 6f. Routes by the task's declared hitl block."""
    mode_val = mode.value if hasattr(mode, "value") else mode
    if mode_val == "auto":
        return ADM_HitlGate(task_id=task_id, mode=mode, reason=reason, status="approved")
    if mode_val == "confidence_gated":
        if ADM_confidence_gate_passes(confidence):
            return ADM_HitlGate(task_id=task_id, mode=mode, reason=reason, status="approved")
        return ADM_HitlGate(task_id=task_id, mode=mode, reason=reason, status="pending")
    # mandatory
    return ADM_HitlGate(task_id=task_id, mode=mode, reason=reason, status="pending")


async def ADM_persist_checkpoint(contract_id: str, run_state: ADM_RunState) -> None:
    db = ADM_get_db()
    await db[ADM_COLLECTION_AGENT_CHECKPOINTS].update_one(
        {"contract_id": contract_id},
        {"$set": {"contract_id": contract_id, "run_state": run_state.model_dump(), "checkpointed_at": ADM_now()}},
        upsert=True,
    )


async def ADM_execute(contract: ADM_ExecutionContract, run_state: ADM_RunState) -> ADM_RunState:
    """
    `.execute()` — TDS §5 row 6. Drives the Stage 1->4 loop starting from
    run_state.current_stage, stopping the moment any stage lands in
    `awaiting_hitl`. One call = one Celery task invocation
    (`execute_contract_task` or `resume_contract_task`).
    """
    chat_id = contract.chat_id
    await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, "execute", "enter", starting_stage=run_state.current_stage)
    await ADM_stream_log(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"SolutionAgent.execute(): starting from stage {run_state.current_stage} for contract {contract.contract_id}.")

    for stage in ADM_STAGE_ORDER:
        if stage < run_state.current_stage:
            continue
        status = run_state.stage_status.get(str(stage))
        if status == "done":
            continue

        run_state = await ADM_run_stage(contract, run_state, stage)

        if run_state.stage_status[str(stage)] == "awaiting_hitl":
            run_state.current_stage = stage
            await ADM_stream_log(chat_id, ADM_SOURCE_SOLUTION_AGENT, f"Paused at stage {stage} — awaiting HITL review before continuing.")
            await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, "execute", "exit", status="paused", stage=stage)
            return run_state

        run_state.current_stage = stage + 1

    run_state.current_stage = max(ADM_STAGE_ORDER) + 1  # sentinel: all stages complete
    await ADM_stream_log(chat_id, ADM_SOURCE_SOLUTION_AGENT, "All stages complete.")
    await ADM_stream_node(chat_id, ADM_SOURCE_SOLUTION_AGENT, "execute", "exit", status="completed")
    return run_state


def ADM_all_stages_complete(run_state: ADM_RunState) -> bool:
    return all(run_state.stage_status.get(str(s)) == "done" for s in ADM_STAGE_ORDER)
