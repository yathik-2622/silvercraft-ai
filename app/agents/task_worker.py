"""
TaskWorker — TDS §5 row 6d, §8. One `create_react_agent` instance per task.
System prompt = that task's pinned skill prompt. Tools = that skill's
DECLARED native tools only (never inferred). Executes, validates,
returns confidence.

Deliberately NOT in this file's tool registry: anything that touches a
live file handle or a live DB connection (csv/excel parsing, DB
profiling/introspection). Per the §3 two-phase policy, the source is
touched exactly once, synchronously, at upload/registration time
(POST /uploads) — never again during Stage 1 TaskWorker execution. Two
concrete reasons this matters, not one:
  1. A file handle (BinaryIO) isn't JSON-schema-able — binding it as an
     agent tool crashes tool-schema generation outright. This was the
     bug that surfaced it.
  2. A DB connection string is schema-able (it's just a str) but binding
     it as an agent tool means the DSN — with credentials — would have
     to flow through the LLM's context and tool-call arguments for the
     agent to use it. That doesn't crash; it quietly leaks a credential
     into LLM context on every Stage 1 run. Same underlying design flaw,
     worse failure mode.
`ADM_execute_one_task` (app/graphs/solution_agent_graph.py) resolves
`source_refs` into already-computed `raw_files` stats and injects them
directly into `input_payload` before the TaskWorker ever runs — the
TaskWorker organizes/validates already-extracted data, it never re-reads
the source.

Execution goes through `agent.astream_events(..., version="v2")` (same
primitive the reference Cortex orchestrator uses) instead of a single
blocking `.ainvoke()`, so every tool call (which tool, with what input,
what it returned) and every token of the model's reasoning/answer
streams live to the chat's Redis channel via app.core.reasoning_stream,
tagged under this task's own source label ("task_worker:<task_id>").
"""
import json
import logging
from typing import Any, Callable

from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from app.config import ADM_get_settings
from app.core.reasoning_stream import (
    ADM_stream_node,
    ADM_stream_tool_end,
    ADM_stream_tool_start,
    ADM_stream_token,
    ADM_task_worker_source,
)
from app.tools.profiling_stats import ADM_build_column_stat_summary
from app.tools.ddl_generator import ADM_generate_ddl_script
from app.tools.diff_tool import ADM_dict_diff
from app.tools.merge_results import ADM_merge_task_partitions

logger = logging.getLogger(__name__)

# Registry mapping a skill's declared tool name -> the actual native python
# callable. TaskWorker never infers tools; it only wires up what the skill
# explicitly declares. Every function here operates on plain, already-
# extracted data (JSON-serializable in and out) — nothing here ever takes
# a live file handle or a raw connection string. See module docstring for
# why upload_ingestion/sql_db_connector/db_metadata_introspector are
# deliberately absent — those remain callable directly (as plain Python,
# not agent tools) only from the synchronous /uploads and
# /db-connections/{id}/profile endpoints. No skill should declare
# "db_metadata_introspector" (or any other DB/file-touching tool) in its
# `tools:` list — the schema/relationship signal those would have provided
# is already available pre-resolved in input_payload.resolved_sources
# (column names/dtypes across every source table) and prior_results
# (earlier tasks' outputs), which is what cluster_subject_areas/
# discover_relationships/derive_keys now read instead.
ADM_NATIVE_TOOL_REGISTRY: dict[str, Callable] = {
    "profiling_stats": ADM_build_column_stat_summary,
    "ddl_generator": ADM_generate_ddl_script,
    "diff": ADM_dict_diff,
    "merge_results": ADM_merge_task_partitions,
}


def ADM_get_chat_model() -> ChatOpenAI:
    settings = ADM_get_settings()
    return ChatOpenAI(
        model=settings.LLM_MODEL,
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
        temperature=0.1,
        streaming=True,   # required for astream_events to emit on_chat_model_stream
    )


def ADM_build_declared_tools(
    declared_tool_names: list[str], skill_id: str | None = None, run_invariant_context: dict | None = None,
) -> list[StructuredTool]:
    """
    Wraps only the tools a skill explicitly declares in its `tools:` field.
    A name with no entry in ADM_NATIVE_TOOL_REGISTRY is skipped rather than
    guessed at — but that skip is now logged as a warning, not silent. A
    skill quietly running without a tool it thinks it has is exactly the
    failure mode that let 3 skills (cluster_subject_areas,
    discover_relationships, derive_keys) sit for a while declaring
    "db_metadata_introspector", which was never in this registry, with
    nothing anywhere noticing.

    "ddl_generator" specifically gets its target_platform argument bound
    HERE, from run_invariant_context — not left for the LLM to copy over
    as a tool-call argument, IF the ReAct loop actually invokes the tool
    live (defense in depth; see the important caveat below). Binding it
    via a real nested-function closure (ADM__bind_ddl_generator below),
    NOT functools.partial — found live: StructuredTool.from_function's
    schema builder calls typing.get_type_hints() on the callable (via
    pydantic v1's deprecated validate_arguments), which raises
    `TypeError: ... is not a module, class, method, or function` on a
    functools.partial object outright. A plain closure IS a real
    function, so get_type_hints works on it and the LLM only ever sees
    "tables" in the tool's schema — target_platform is no longer a choice
    it can get wrong, if this code path even runs.

    IMPORTANT caveat found live: this binding only affects an actual tool
    call made mid-ReAct-loop. generate_ddl's expected_output is just
    "output.tables: [...]" — a JSON shape the LLM can (and, observed live,
    typically does) construct directly as its final answer without ever
    invoking the ddl_generator tool at all. The artifact users actually
    download is rendered separately, from that persisted task *output*,
    by app/celery_app/tasks.py's ADM_generate_provenance_and_artifacts —
    THAT is the call site that had to be fixed to actually thread
    target_platform through; this binding is correct and worth keeping,
    but was not by itself sufficient, and chasing it in isolation (it
    tested correctly on its own) cost real time before the artifact
    -rendering call site was checked directly.
    """
    tools = []
    for name in declared_tool_names:
        fn = ADM_NATIVE_TOOL_REGISTRY.get(name)
        if fn is None:
            logger.warning(
                "Skill%s declares tool '%s', which has no entry in ADM_NATIVE_TOOL_REGISTRY — "
                "skipping it. The TaskWorker will run without this tool bound.",
                f" '{skill_id}'" if skill_id else "", name,
            )
            continue
        doc = fn.__doc__ or name
        if name == "ddl_generator" and (run_invariant_context or {}).get("target_platform"):
            fn = ADM__bind_ddl_generator(run_invariant_context["target_platform"])
        tools.append(StructuredTool.from_function(func=fn, name=name, description=doc))
    return tools


def ADM__bind_ddl_generator(target_platform: str) -> Callable:
    """Real closure, not functools.partial — see ADM_build_declared_tools'
    docstring for exactly why that distinction matters here."""
    ddl_generator_fn = ADM_NATIVE_TOOL_REGISTRY["ddl_generator"]

    def ddl_generator(tables: list[dict]) -> str:
        return ddl_generator_fn(tables, target_platform=target_platform)

    return ddl_generator


async def ADM_run_task_worker(
    skill: dict,
    task_context: dict,
    run_invariant_context: dict,
    input_payload: dict[str, Any],
    chat_id: str | None = None,
    task_id: str | None = None,
) -> dict:
    """
    Spawns a `create_react_agent` for exactly one task, executes it against
    the declared tools only, and returns {output, confidence}.

    When `chat_id` is supplied (live chat run), every tool call and every
    token of model output streams live via app.core.reasoning_stream. When
    omitted (e.g. a script/test calling this directly), execution falls
    back to a single non-streaming `.ainvoke()` — no live audience, no
    need to pay the event-loop overhead of astream_events.
    """
    task_label = task_id or skill.get("skill_id", "unknown_task")
    source = ADM_task_worker_source(task_label)

    declared_tools = ADM_build_declared_tools(
        skill.get("tools", []), skill_id=skill.get("skill_id"), run_invariant_context=run_invariant_context,
    )
    model = ADM_get_chat_model()

    system_prompt = skill.get("prompt", "")
    agent = create_react_agent(model, declared_tools, prompt=system_prompt)

    user_content = (
        f"Task: {skill.get('title')}\n"
        f"Purpose: {skill.get('purpose')}\n"
        f"Expected output: {skill.get('expected_output')}\n\n"
        f"Run-invariant context:\n{json.dumps(run_invariant_context, default=str)[:4000]}\n\n"
        f"Task-specific context:\n{json.dumps(task_context, default=str)[:4000]}\n\n"
        f"Input payload (structural/aggregate metadata only, per ADM privacy policy):\n"
        f"{json.dumps(input_payload, default=str)[:6000]}\n\n"
        f"If 'user_instructions' is present in the input payload, treat it as a direct "
        f"override from the user for THIS task specifically — prioritize it over your own "
        f"default judgment.\n\n"
        f"Produce the expected output as strict JSON with keys: "
        f"'output' (the task's result object) and 'confidence' (0.0-1.0 float, "
        f"your self-assessed confidence in this result)."
    )
    initial_input = {"messages": [{"role": "user", "content": user_content}]}

    if not chat_id:
        # No live audience — plain blocking call, unchanged from before.
        result = await agent.ainvoke(initial_input)
        final_message = result["messages"][-1]
        raw = final_message.content if hasattr(final_message, "content") else str(final_message)
        return ADM_parse_worker_output(raw)

    await ADM_stream_node(chat_id, source, "task_worker", "enter", task_id=task_label, skill_id=skill.get("skill_id"), tools=list(skill.get("tools", [])))

    last_ai_content = ""
    async for event in agent.astream_events(initial_input, version="v2"):
        kind = event["event"]

        if kind == "on_tool_start":
            await ADM_stream_tool_start(chat_id, source, event["name"], event["data"].get("input", {}))

        elif kind == "on_tool_end":
            output = event["data"].get("output")
            await ADM_stream_tool_end(chat_id, source, event["name"], output)

        elif kind == "on_chat_model_stream":
            chunk = event["data"].get("chunk")
            delta = getattr(chunk, "content", "") if chunk else ""
            if delta:
                await ADM_stream_token(chat_id, source, delta)

        elif kind == "on_chat_model_end":
            output = event["data"].get("output")
            content = getattr(output, "content", None)
            if content:
                # Every LLM turn in the ReAct loop fires this; the LAST one
                # before the graph ends is the agent's final answer — keep
                # overwriting so we end up with that one.
                last_ai_content = content

    await ADM_stream_node(chat_id, source, "task_worker", "exit", task_id=task_label)

    if not last_ai_content:
        # Streaming produced no usable final content (e.g. gateway doesn't
        # support streamed tool-calling deltas) — fall back to one more,
        # non-streaming call so the task still completes correctly.
        result = await agent.ainvoke(initial_input)
        final_message = result["messages"][-1]
        last_ai_content = final_message.content if hasattr(final_message, "content") else str(final_message)

    return ADM_parse_worker_output(last_ai_content)


def ADM_parse_worker_output(raw: str) -> dict:
    """Best-effort JSON extraction from the agent's final message."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        parsed = json.loads(text)
        if "output" in parsed and "confidence" in parsed:
            return parsed
        return {"output": parsed, "confidence": 0.7}
    except json.JSONDecodeError:
        return {"output": {"raw_text": text}, "confidence": 0.5}
