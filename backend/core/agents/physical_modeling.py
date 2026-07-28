"""
PhysicalModelingAgent — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4.4

Stage 4 owner (Foundation layer, Gate G4).
Steps 4.1–4.6:
  4.1 Apply surrogate key strategy per modeling type (IDENTITY/SEQUENCE for Kimball; HASHKEY for DV)
  4.2 Standardize physical names (target_dialect snake_case, length limits, reserved word avoidance)
  4.3 Apply transformation logic per STTM rules
  4.4 Generate STTM rows (src_table, src_col, tgt_table, tgt_col, rule, dq_check, load_type)
  4.5 Generate DDL (CREATE TABLE with PK/FK/index hints, dialect-specific types)
  4.6 Package download artifacts (DDL, STTM CSV, JSON model)

Uses web_reference tool to look up dialect-specific syntax when needed.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from core.agents.base_agent import AgentState, TOOL_SCHEMAS, llm_call, tool_emit_trace, tool_query_mongo, tool_read_skill
from core.runtime_settings import resolve_llm_runtime

SYSTEM_PROMPT = """You are PhysicalModelingAgent, the senior physical data engineer. You own the full physical model: surrogate key strategy, physical naming, transformation logic, STTM generation, and DDL authoring — all as one coherent output.

TOOLS: query_mongo (pull approved G3 logical model), read_skill/list_skills (apply any bound skills for target-dialect rules, naming conventions, and SCD/temporal rules — these are hard constraints), call_peer_agent (consult LogicalModelingAgent when SCD or key strategy is ambiguous), web_reference (look up target-dialect syntax specifics when uncertain), emit_trace.

Your behavior is entirely defined by the Active Skills injected below. Follow the target_dialect constraints exactly as stated in the bound skill. If two skills conflict (e.g. naming_convention vs target_dialect), the more specific skill wins. If no target-dialect skill is bound, use the standard conventions for the declared target_dialect in your task pointer.

CONVERGENCE RULE: if you run multiple internal reasoning passes or sub-checks, converge them into ONE consolidated output before returning — never return competing drafts. Unresolved ambiguity becomes a flagged "needs_human_input" item inside your single output, not a second draft.

SCOPE: you perform physical modeling, STTM, and DDL generation only. You do not do source analysis, conceptual modeling, or logical modeling. Output valid JSON only, including REAL executable DDL statements.
"""


async def node_init(state: AgentState) -> AgentState:
    db = state.get("db")
    state["thinking"] = ["Initializing PhysicalModelingAgent"]
    state["peer_call_count"] = state.get("peer_call_count", 0)
    state["status"] = "running"
    state["tool_calls"] = []
    skills_md = ""
    skill_refs = (state.get("context_refs") or {}).get("skill_refs", {}).get("physical", [])
    if skill_refs and db:
        for skill_id in skill_refs:
            skills_md += f"\n\n{await tool_read_skill(skill_id, db)}"
    state["skills_markdown"] = skills_md
    await tool_emit_trace(state.get("session_id", ""), "started", {"agent": "PhysicalModelingAgent", "stage": "physical_modeling"}, state.get("trace_id", ""))
    return state


async def node_fetch_context(state: AgentState) -> AgentState:
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "4.0", "label": "Loading G3 logical model output"})
    session_id = state.get("session_id", "")
    g3 = {}
    db = state.get("db")
    if db and session_id:
        gates = await tool_query_mongo("session_gates", {"session_id": session_id, "gate": "G3"}, db)
        g3 = (gates[0] if gates else {}).get("output_payload", {})
    ctx = state.get("context_refs", {})
    state["context_refs"] = {**ctx, "_g3": g3}
    return state


async def node_physical_model(state: AgentState) -> AgentState:
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "4.1-4.6", "label": "Generating physical model, DDL, and STTM"})
    state["thinking"].append("Steps 4.1–4.6: Physical model generation")

    runtime = resolve_llm_runtime(None)
    ctx = state.get("context_refs", {})
    g3 = ctx.get("_g3", {})
    target_dialect = ctx.get("target_dialect", "snowflake")
    skills_block = f"\n\n## Active Skills\n{state.get('skills_markdown', '')}" if state.get("skills_markdown") else ""

    user_prompt = (
        f"Instruction: {state.get('instruction', 'Generate the full physical model.')}\n"
        f"Target Dialect: {target_dialect}\n"
        f"Modeling type: {g3.get('modeling_type', 'kimball')}\n"
        f"Directives: {json.dumps(state.get('directives', []))}\n\n"
        f"G3 Logical Model:\n{json.dumps(g3, default=str)[:6000]}\n\n"
        "Return the complete physical model as valid JSON. Include REAL DDL statements. STTM must have one row per source-to-target column mapping."
    )
    try:
        raw = await llm_call(runtime, SYSTEM_PROMPT + skills_block, user_prompt, tools=TOOL_SCHEMAS, state=state)
        result = json.loads(raw)
    except Exception as exc:
        result = {"error": str(exc)}

    state["output"] = result
    state["output_text"] = json.dumps(result, indent=2)[:8000]
    tbl_count = len(result.get("physical_tables", []))
    sttm_count = len(result.get("sttm_rows", []))
    await tool_emit_trace(state.get("session_id", ""), "output", {"stage": "physical_modeling", "table_count": tbl_count, "sttm_row_count": sttm_count})
    return state


async def node_save_gate(state: AgentState) -> AgentState:
    db = state.get("db")
    session_id = state.get("session_id", "")
    if db and session_id:
        await db["session_gates"].update_one(
            {"session_id": session_id, "gate": "G4"},
            {"$set": {"status": "ready", "output_payload": state.get("output", {}), "has_unsaved_changes": False, "stage_steps": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"], "completed_at": __import__("datetime").datetime.utcnow()}},
            upsert=True,
        )
    await tool_emit_trace(state.get("session_id", ""), "gate_ready", {"gate": "G4", "stage": "physical_modeling"}, state.get("trace_id", ""))
    state["status"] = "ready"
    return state


def build_physical_modeling_subgraph():
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        return None
    graph = StateGraph(AgentState)
    graph.add_node("init", node_init)
    graph.add_node("fetch_context", node_fetch_context)
    graph.add_node("physical_model", node_physical_model)
    graph.add_node("save_gate", node_save_gate)
    graph.set_entry_point("init")
    graph.add_edge("init", "fetch_context")
    graph.add_edge("fetch_context", "physical_model")
    graph.add_edge("physical_model", "save_gate")
    graph.add_edge("save_gate", END)
    return graph.compile()


PHYSICAL_MODELING_GRAPH = build_physical_modeling_subgraph()


async def run_physical_modeling_agent(session_id, project_id, instruction, context_refs, directives, trace_id, db):
    initial: AgentState = {"session_id": session_id, "project_id": project_id, "trace_id": trace_id, "stage": "physical_modeling", "instruction": instruction, "directives": directives, "context_refs": context_refs, "db": db, "runtime": {}, "peer_call_count": 0, "skills_markdown": "", "tool_calls": [], "thinking": [], "output": {}, "output_text": "", "error": None, "status": "running"}
    if PHYSICAL_MODELING_GRAPH:
        return await PHYSICAL_MODELING_GRAPH.ainvoke(initial)
    s = await node_init(initial)
    s = await node_fetch_context(s)
    s = await node_physical_model(s)
    s = await node_save_gate(s)
    return s
