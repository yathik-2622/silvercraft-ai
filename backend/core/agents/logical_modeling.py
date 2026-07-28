"""
LogicalModelingAgent — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4.3

Stage 3 owner (Foundation layer, Gate G3). The heaviest agent.
Steps 3.1–3.10:
  3.1 Modeling type selection (Kimball/Data Vault/3NF) + confirm with HITL
  3.2 Standardize entity/attribute names
  3.3 Assign FACT/DIMENSION roles (Kimball) or Hub/Link/Sat (Data Vault) or entity (3NF)
  3.4 Map all source columns to logical attributes
  3.5 Classify attributes (measure/dimension/degenerate/junk)
  3.6 Identify natural business keys + surrogate key strategy
  3.7 Review SCD type for each DIMENSION
  3.8 Map entities to enterprise model (if existing_model_ref set)
  3.9 Generate logical relationships (PK/FK with cardinality)
  3.10 Resolve M:N relationships into bridge entities
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from core.agents.base_agent import (
    AgentState,
    TOOL_SCHEMAS,
    llm_call,
    tool_call_peer_agent,
    tool_emit_trace,
    tool_query_mongo,
    tool_read_skill,
)
from core.runtime_settings import resolve_llm_runtime

SYSTEM_PROMPT = """You are LogicalModelingAgent, the senior logical data modeler. You own the full logical model: entity role assignment, attribute mapping, key strategy, relationship generation, and M:N resolution — these are interlocking judgments about the same entity set, not isolated checklists.

TOOLS: query_mongo (pull approved G1/G2 outputs and enterprise-model references), read_skill/list_skills (apply any bound skills for modeling style, naming conventions, and temporal rules — these are hard constraints), call_peer_agent (consult SourceIntelligenceAgent for attribute-mapping ambiguity, ConceptualModelingAgent for concept-boundary questions, SkillCuratorAgent for skill discovery), emit_trace.

Your behavior is entirely defined by the Active Skills injected below. If given a 3NF skill, produce normalized entities per its rules. If given a Data Vault skill, produce hubs/links/satellites per its rules. If given a Canonical skill, follow its merge/subject-area rules. Never default to a style not present in your active skills — if no modeling-style skill is active for this stage, ask for clarification rather than assuming one (surface as a "needs_human_input" flag in your output).

Multiple skills may be active simultaneously (e.g. one modeling-style skill + one naming-convention skill). Apply all of them. If two active skills conflict, an explicit project-level directive from the user wins; otherwise the more specific skill (naming_convention) wins over the more general one (modeling_style).

CONVERGENCE RULE: if you run multiple internal reasoning passes or sub-checks, converge them into ONE consolidated output before returning — never return competing drafts. Unresolved ambiguity becomes a flagged "needs_human_input" item inside your single output, not a second draft.

SCOPE: you perform logical modeling only. You do not do source analysis, conceptual modeling, or physical DDL generation. Output valid JSON only, matching the schema you were given.
"""


async def node_init(state: AgentState) -> AgentState:
    db = state.get("db")
    state["thinking"] = ["Initializing LogicalModelingAgent"]
    state["peer_call_count"] = state.get("peer_call_count", 0)
    state["status"] = "running"
    state["tool_calls"] = []

    skills_md = ""
    skill_refs = (state.get("context_refs") or {}).get("skill_refs", {}).get("logical", [])
    if skill_refs and db:
        for skill_id in skill_refs:
            skills_md += f"\n\n{await tool_read_skill(skill_id, db)}"
    state["skills_markdown"] = skills_md

    await tool_emit_trace(state.get("session_id", ""), "started", {"agent": "LogicalModelingAgent", "stage": "logical_modeling"}, state.get("trace_id", ""))
    return state


async def node_fetch_context(state: AgentState) -> AgentState:
    """Fetch G1 and G2 gate outputs via query_mongo."""
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "3.0", "label": "Loading prior stage outputs"})
    session_id = state.get("session_id", "")
    g1 = g2 = {}
    db = state.get("db")
    if db and session_id:
        gates = await tool_query_mongo("session_gates", {"session_id": session_id, "gate": {"$in": ["G1", "G2"]}}, db)
        for g in gates:
            if g.get("gate") == "G1":
                g1 = g.get("output_payload", {})
            elif g.get("gate") == "G2":
                g2 = g.get("output_payload", {})
    ctx = state.get("context_refs", {})
    state["context_refs"] = {**ctx, "_g1": g1, "_g2": g2}
    return state


async def node_logical_model(state: AgentState) -> AgentState:
    """3.1–3.10 — Main logical modeling LLM call."""
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "3.1-3.10", "label": "Running logical modeling pass"})
    state["thinking"].append("Steps 3.1–3.10: Logical modeling LLM call")

    runtime = resolve_llm_runtime(None)
    ctx = state.get("context_refs", {})
    g1 = ctx.get("_g1", {})
    g2 = ctx.get("_g2", {})
    skills_block = f"\n\n## Active Skills\n{state.get('skills_markdown', '')}" if state.get("skills_markdown") else ""

    user_prompt = (
        f"Instruction: {state.get('instruction', 'Build the full logical model.')}\n"
        f"Modeling style hint: {ctx.get('modeling_style', 'kimball')}\n"
        f"Target dialect: {ctx.get('target_dialect', 'snowflake')}\n"
        f"Directives: {json.dumps(state.get('directives', []))}\n\n"
        f"G1 Source Analysis:\n{json.dumps(g1, default=str)[:4000]}\n\n"
        f"G2 Conceptual Model:\n{json.dumps(g2, default=str)[:2000]}\n\n"
        "Return the full logical model as valid JSON matching the schema in your system prompt."
    )

    try:
        raw = await llm_call(runtime, SYSTEM_PROMPT + skills_block, user_prompt, tools=TOOL_SCHEMAS, state=state)
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {"raw_output": raw, "parse_error": "Not valid JSON"}
    except Exception as exc:
        result = {"error": str(exc)}

    state["output"] = result
    state["output_text"] = json.dumps(result, indent=2)[:6000]
    await tool_emit_trace(state.get("session_id", ""), "output", {"stage": "logical_modeling", "entity_count": len(result.get("entities", {}))})
    return state


async def node_save_gate(state: AgentState) -> AgentState:
    db = state.get("db")
    session_id = state.get("session_id", "")
    if db and session_id:
        await db["session_gates"].update_one(
            {"session_id": session_id, "gate": "G3"},
            {"$set": {
                "status": "ready",
                "output_payload": state.get("output", {}),
                "has_unsaved_changes": False,
                "stage_steps": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10"],
                "completed_at": __import__("datetime").datetime.utcnow(),
            }},
            upsert=True,
        )
    await tool_emit_trace(state.get("session_id", ""), "gate_ready", {"gate": "G3", "stage": "logical_modeling"}, state.get("trace_id", ""))
    state["status"] = "ready"
    return state


def build_logical_modeling_subgraph():
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        return None
    graph = StateGraph(AgentState)
    graph.add_node("init", node_init)
    graph.add_node("fetch_context", node_fetch_context)
    graph.add_node("logical_model", node_logical_model)
    graph.add_node("save_gate", node_save_gate)
    graph.set_entry_point("init")
    graph.add_edge("init", "fetch_context")
    graph.add_edge("fetch_context", "logical_model")
    graph.add_edge("logical_model", "save_gate")
    graph.add_edge("save_gate", END)
    return graph.compile()


LOGICAL_MODELING_GRAPH = build_logical_modeling_subgraph()


async def run_logical_modeling_agent(session_id, project_id, instruction, context_refs, directives, trace_id, db):
    initial: AgentState = {"session_id": session_id, "project_id": project_id, "trace_id": trace_id, "stage": "logical_modeling", "instruction": instruction, "directives": directives, "context_refs": context_refs, "db": db, "runtime": {}, "peer_call_count": 0, "skills_markdown": "", "tool_calls": [], "thinking": [], "output": {}, "output_text": "", "error": None, "status": "running"}
    if LOGICAL_MODELING_GRAPH:
        return await LOGICAL_MODELING_GRAPH.ainvoke(initial)
    s = await node_init(initial)
    s = await node_fetch_context(s)
    s = await node_logical_model(s)
    s = await node_save_gate(s)
    return s
