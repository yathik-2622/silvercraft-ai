"""
ConceptualModelingAgent — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4.2

Stage 2 owner (Foundation layer, Gate G2).
Steps 2.1–2.2:
  2.1 Generate business concepts (nouns) from approved G1 output
  2.2 Derive relationships between concepts (verb-phrase associations, cardinality)

System prompt: "You are a business analyst translating raw data assets into business concepts..."
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from core.agents.base_agent import AgentState, llm_call, tool_emit_trace, tool_query_mongo, tool_read_skill
from core.runtime_settings import resolve_llm_runtime

SYSTEM_PROMPT = """You are a business analyst and information architect translating raw data assets into business concepts.
You work in ADM Agent Studio 2.0 as the ConceptualModelingAgent.

Your responsibilities (Stage 2, Steps 2.1–2.2):
2.1 Generate a clean list of BUSINESS CONCEPTS (nouns) — one concept per real-world entity.
    Each concept must map back to one or more source tables from the G1 output.
2.2 Derive RELATIONSHIPS between concepts as verb-phrase associations with cardinality.

Output format (JSON only):
{
  "concepts": {
    "<ConceptName>": {
      "definition": "One-sentence business definition",
      "synonyms": ["alias1"],
      "source_tables": ["customers", "customer_emails"],
      "is_core": true,
      "domain": "Customer"
    }
  },
  "relationships": [
    {
      "from_concept": "Customer",
      "to_concept": "Order",
      "verb_phrase": "places",
      "inverse_verb": "placed by",
      "cardinality": "1:N",
      "assumptions": ["One customer can place many orders"]
    }
  ],
  "modeling_assumptions": ["..."]
}

Rules:
- NEVER invent concepts not grounded in G1 source tables
- Merge similar source tables into a single concept when they represent the same business entity
- Use business language in definition — avoid technical jargon
"""


async def node_init(state: AgentState, db=None) -> AgentState:
    state["thinking"] = ["Initializing ConceptualModelingAgent"]
    state["peer_call_count"] = state.get("peer_call_count", 0)
    state["status"] = "running"
    state["tool_calls"] = []
    skills_md = ""
    skill_refs = (state.get("context_refs") or {}).get("skill_refs", {}).get("conceptual", [])
    if skill_refs and db:
        for skill_id in skill_refs:
            skills_md += f"\n\n{await tool_read_skill(skill_id, db)}"
    state["skills_markdown"] = skills_md
    await tool_emit_trace(state.get("session_id", ""), "started", {"agent": "ConceptualModelingAgent", "stage": "conceptual_modeling"}, state.get("trace_id", ""))
    return state


async def node_fetch_g1(state: AgentState, db=None) -> AgentState:
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "2.0", "label": "Loading G1 source analysis output"})
    session_id = state.get("session_id", "")
    g1 = {}
    if db and session_id:
        gates = await tool_query_mongo("session_gates", {"session_id": session_id, "gate": "G1"}, db)
        g1 = (gates[0] if gates else {}).get("output_payload", {})
    state["context_refs"] = {**(state.get("context_refs") or {}), "_g1": g1}
    return state


async def node_conceptual_model(state: AgentState, db=None) -> AgentState:
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "2.1-2.2", "label": "Generating concepts and relationships"})
    runtime = resolve_llm_runtime(None)
    ctx = state.get("context_refs", {})
    g1 = ctx.get("_g1", {})
    skills_block = f"\n\n## Active Skills\n{state.get('skills_markdown', '')}" if state.get("skills_markdown") else ""
    user_prompt = (
        f"Instruction: {state.get('instruction', 'Build the conceptual model.')}\n"
        f"Directives: {json.dumps(state.get('directives', []))}\n\n"
        f"G1 Source Analysis:\n{json.dumps(g1, default=str)[:5000]}\n\n"
        "Return the full conceptual model as valid JSON."
    )
    try:
        raw = await llm_call(runtime, SYSTEM_PROMPT + skills_block, user_prompt, response_format="json")
        result = json.loads(raw)
    except Exception as exc:
        result = {"error": str(exc)}
    state["output"] = result
    state["output_text"] = json.dumps(result, indent=2)[:4000]
    await tool_emit_trace(state.get("session_id", ""), "output", {"stage": "conceptual_modeling", "concept_count": len(result.get("concepts", {}))})
    return state


async def node_save_gate(state: AgentState, db=None) -> AgentState:
    if db and state.get("session_id"):
        await db["session_gates"].update_one(
            {"session_id": state["session_id"], "gate": "G2"},
            {"$set": {"status": "ready", "output_payload": state.get("output", {}), "has_unsaved_changes": False, "stage_steps": ["2.1", "2.2"], "completed_at": __import__("datetime").datetime.utcnow()}},
            upsert=True,
        )
    await tool_emit_trace(state.get("session_id", ""), "gate_ready", {"gate": "G2", "stage": "conceptual_modeling"}, state.get("trace_id", ""))
    state["status"] = "ready"
    return state


def build_conceptual_modeling_subgraph():
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        return None
    graph = StateGraph(AgentState)
    graph.add_node("init", node_init)
    graph.add_node("fetch_g1", node_fetch_g1)
    graph.add_node("conceptual_model", node_conceptual_model)
    graph.add_node("save_gate", node_save_gate)
    graph.set_entry_point("init")
    graph.add_edge("init", "fetch_g1")
    graph.add_edge("fetch_g1", "conceptual_model")
    graph.add_edge("conceptual_model", "save_gate")
    graph.add_edge("save_gate", END)
    return graph.compile()


CONCEPTUAL_MODELING_GRAPH = build_conceptual_modeling_subgraph()


async def run_conceptual_modeling_agent(session_id, project_id, instruction, context_refs, directives, trace_id, db):
    initial: AgentState = {"session_id": session_id, "project_id": project_id, "trace_id": trace_id, "stage": "conceptual_modeling", "instruction": instruction, "directives": directives, "context_refs": context_refs, "runtime": {}, "peer_call_count": 0, "skills_markdown": "", "tool_calls": [], "thinking": [], "output": {}, "output_text": "", "error": None, "status": "running"}
    if CONCEPTUAL_MODELING_GRAPH:
        return await CONCEPTUAL_MODELING_GRAPH.ainvoke(initial)
    s = await node_init(initial, db)
    s = await node_fetch_g1(s, db)
    s = await node_conceptual_model(s, db)
    s = await node_save_gate(s, db)
    return s
