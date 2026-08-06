"""
Reasoning Stream — publishes granular "who is calling what" events for
every orchestrator/agent component (Orchestrator Graph, SolutionAgent
Graph, TaskWorker, Context Builder, Skill Normalizer), on the SAME Redis
channel/infrastructure already in place (`ADM_publish_chat_event`, TDS
§8's "2 logical Redis uses" — no new infra added, only a richer event
vocabulary on the existing Pub/Sub use).

Event envelope (what lands in Mongo/gets relayed to the client) mirrors
the shape the reference Cortex frontend already knows how to render as a
reasoning dropdown:

    {"type": "log"|"node"|"agent_call"|"tool_start"|"tool_end"|"token"|"error",
     "payload": {"source": <component>, ...}}

`source` identifies which component emitted the event, e.g.
"orchestrator", "solution_agent", "task_worker:derive_keys",
"context_builder", "skill_normalizer" — this is what lets the UI attribute
each line to "which orchestrator/agent is calling what."
"""
from typing import Any

from app.core.redis_pubsub import ADM_publish_chat_event

# ── canonical source labels ─────────────────────────────────────────────
ADM_SOURCE_ORCHESTRATOR = "orchestrator"
ADM_SOURCE_SOLUTION_AGENT = "solution_agent"
ADM_SOURCE_CONTEXT_BUILDER = "context_builder"
ADM_SOURCE_SKILL_NORMALIZER = "skill_normalizer"
ADM_SOURCE_KB_INGEST = "kb_ingest"


def ADM_task_worker_source(task_id: str) -> str:
    """Every TaskWorker instance streams under its own task-scoped source label."""
    return f"task_worker:{task_id}"


# ── event emitters ──────────────────────────────────────────────────────

async def ADM_stream_log(chat_id: str, source: str, message: str, **extra) -> None:
    """One human-readable reasoning line, e.g. 'Orchestrator: extracting intent...'."""
    await ADM_publish_chat_event(chat_id, "log", {"source": source, "message": message, **extra})


async def ADM_stream_node(chat_id: str, source: str, node: str, phase: str, **extra) -> None:
    """LangGraph node enter/exit — phase is 'enter' or 'exit'."""
    await ADM_publish_chat_event(
        chat_id, "node", {"source": source, "node": node, "phase": phase, **extra}
    )


async def ADM_stream_agent_call(chat_id: str, source: str, target: str, message: str, **extra) -> None:
    """One component calling into another — e.g. Orchestrator -> plan_task,
    SolutionAgent -> TaskWorker(task_id=...). This is the literal
    "which orchestrator is calling what, which agent is calling what tool"
    trace the reasoning dropdown is built from."""
    await ADM_publish_chat_event(
        chat_id, "agent_call", {"source": source, "target": target, "message": message, **extra}
    )


async def ADM_stream_fetch(chat_id: str, source: str, what: str, **extra) -> None:
    """Announces a read the component is about to perform (Mongo query, vector
    search, skill resolution, file/DB introspection) BEFORE it happens, so the
    UI can show 'fetching business standards...' etc. live, not after the fact."""
    await ADM_publish_chat_event(
        chat_id, "log", {"source": source, "message": f"Fetching {what}...", "fetch": what, **extra}
    )


async def ADM_stream_tool_start(chat_id: str, source: str, tool_name: str, tool_input: dict) -> None:
    await ADM_publish_chat_event(
        chat_id, "tool_start", {"source": source, "tool": tool_name, "input": tool_input}
    )


def ADM_summarize_for_log(value: Any, max_len: int = 150) -> str:
    """A short, human-readable one-liner for the reasoning log — never a raw
    JSON slice. The structured value itself (for a completed task's real
    output) travels through ADM_stream_artifact instead; this is only for
    the text log line. A dict shaped like a TaskWorker envelope
    ({"output":..., "confidence":...}) gets a size-hint summary; anything
    else falls back to a hard-capped str()."""
    if isinstance(value, dict) and "output" in value and "confidence" in value:
        inner = value["output"]
        if isinstance(inner, list):
            shape_hint = f"{len(inner)} row(s)"
        elif isinstance(inner, dict):
            shape_hint = f"{len(inner)} field(s)"
        else:
            shape_hint = "result"
        try:
            conf = f"{float(value['confidence']):.2f}"
        except (TypeError, ValueError):
            conf = str(value["confidence"])
        return f"confidence={conf}, {shape_hint}"

    text = value if isinstance(value, str) else str(value)
    text = text.strip()
    if len(text) > max_len:
        return text[:max_len] + "…"
    return text


async def ADM_stream_tool_end(chat_id: str, source: str, tool_name: str, output: Any) -> None:
    await ADM_publish_chat_event(
        chat_id, "tool_end", {"source": source, "tool": tool_name, "output_preview": ADM_summarize_for_log(output)}
    )


async def ADM_stream_artifact(
    chat_id: str, source: str, task_id: str, skill_id: str, stage: int, label: str,
    output: Any, confidence: float | None = None, citations: list[dict] | None = None,
) -> None:
    """Carries the REAL structured task output (never stringified) plus
    enough metadata for the frontend to route it to the right artifact
    renderer and let a user reopen it later from the chat's artifact chip.
    One of these per completed Stage 1-4 task — see
    app.graphs.solution_agent_graph.ADM_execute_one_task, the one place the
    fully-parsed {output, confidence} already exists with no re-parsing
    needed, regardless of whether the task ever called a native tool."""
    await ADM_publish_chat_event(chat_id, "artifact", {
        "source": source, "task_id": task_id, "skill_id": skill_id, "stage": stage,
        "label": label, "output": output, "confidence": confidence, "citations": citations or [],
    })


async def ADM_stream_token(chat_id: str, source: str, content: str) -> None:
    """One streamed LLM token/delta — the literal text-typing-out effect."""
    await ADM_publish_chat_event(chat_id, "token", {"source": source, "content": content})


async def ADM_stream_error(chat_id: str, source: str, message: str) -> None:
    await ADM_publish_chat_event(chat_id, "error", {"source": source, "message": message})


async def ADM_stream_citations(chat_id: str, source: str, citations: list[dict]) -> None:
    """Announces which KB chunks the answer actually drew on — the literal
    'which doc, which chunk exactly' trace the citation UI renders from."""
    await ADM_publish_chat_event(chat_id, "citations", {"source": source, "citations": citations})
