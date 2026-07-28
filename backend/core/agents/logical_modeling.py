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
    llm_call,
    tool_call_peer_agent,
    tool_emit_trace,
    tool_query_mongo,
    tool_read_skill,
)
from core.runtime_settings import resolve_llm_runtime

SYSTEM_PROMPT = """You are a senior logical data modeler and information architect with 20+ years experience.
You work in ADM Agent Studio 2.0 as the LogicalModelingAgent.

Your responsibilities (Stage 3, Steps 3.1–3.10):
3.1 SELECT modeling type (Kimball/Data Vault 2.0/3NF) based on project context and instruction
3.2 Standardize all entity and attribute names using naming_skill rules
3.3 Assign roles: FACT/DIMENSION (Kimball), HUB/LINK/SATELLITE (Data Vault), ENTITY (3NF)
3.4 Map every source column to a logical attribute in the correct entity
3.5 Classify each attribute: measure, conformed_dimension, degenerate, junk, SCD_tracking, metadata
3.6 Identify natural business keys (NBK) + propose SK (surrogate key) strategy
3.7 Review SCD type for each DIMENSION (Type 0/1/2/3/4/6) — default SCD2 for Customer/Product
3.8 Map entities to enterprise model reference if existing_model_ref is provided
3.9 Generate logical relationships (PK→FK, cardinality: 1:1 / 1:N / M:N)
3.10 Resolve all M:N relationships into bridge/link entities

Output format (JSON):
{
  "modeling_type": "kimball",
  "entities": {
    "<entity_name>": {
      "role": "DIMENSION",
      "source_tables": ["orders"],
      "natural_business_keys": ["customer_id"],
      "scd_type": 2,
      "attributes": [
        {"name": "customer_id", "logical_type": "INTEGER", "role": "natural_key", "source_col": "cust_id", "source_table": "customers"}
      ],
      "enterprise_model_match": null
    }
  },
  "relationships": [
    {"from_entity": "fact_sales", "from_attr": "customer_sk", "to_entity": "dim_customer", "to_attr": "customer_sk", "cardinality": "M:1", "relationship_type": "FK"}
  ],
  "bridge_entities": [],
  "modeling_assumptions": ["Assumed SCD2 for dim_customer based on historical tracking requirement"]
}

Rules:
- NEVER change source column name — always use source_col to track origin
- Default SCD type = 2 for Customer, Product, Employee; SCD1 for all others unless instructed
- Flag entities with > 100 attributes as God Objects — suggest decomposition
- Use naming_skill for all standardization (injected below)
"""


async def node_init(state: AgentState, db=None) -> AgentState:
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


async def node_fetch_context(state: AgentState, db=None) -> AgentState:
    """Fetch G1 and G2 gate outputs via query_mongo."""
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "3.0", "label": "Loading prior stage outputs"})
    session_id = state.get("session_id", "")
    g1 = g2 = {}
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


async def node_logical_model(state: AgentState, db=None) -> AgentState:
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
        raw = await llm_call(runtime, SYSTEM_PROMPT + skills_block, user_prompt, response_format="json")
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {"raw_output": raw, "parse_error": "Not valid JSON"}
    except Exception as exc:
        result = {"error": str(exc)}

    state["output"] = result
    state["output_text"] = json.dumps(result, indent=2)[:6000]
    await tool_emit_trace(state.get("session_id", ""), "output", {"stage": "logical_modeling", "entity_count": len(result.get("entities", {}))})
    return state


async def node_save_gate(state: AgentState, db=None) -> AgentState:
    if db and state.get("session_id"):
        await db["session_gates"].update_one(
            {"session_id": state["session_id"], "gate": "G3"},
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
    initial: AgentState = {"session_id": session_id, "project_id": project_id, "trace_id": trace_id, "stage": "logical_modeling", "instruction": instruction, "directives": directives, "context_refs": context_refs, "runtime": {}, "peer_call_count": 0, "skills_markdown": "", "tool_calls": [], "thinking": [], "output": {}, "output_text": "", "error": None, "status": "running"}
    if LOGICAL_MODELING_GRAPH:
        return await LOGICAL_MODELING_GRAPH.ainvoke(initial)
    s = await node_init(initial, db)
    s = await node_fetch_context(s, db)
    s = await node_logical_model(s, db)
    s = await node_save_gate(s, db)
    return s
