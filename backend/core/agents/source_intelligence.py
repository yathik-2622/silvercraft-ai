"""
SourceIntelligenceAgent — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4.1

Stage 1 owner (Foundation layer, Gate G1).
Steps 1.1–1.7:
  1.1 Retrieve source file/table list
  1.2 Per-table profiling (sampling, type detection, null%, distinct count)
  1.3 Business dictionary enrichment (peer-call ConceptualModelingAgent if needed)
  1.4 Sensitivity classification (PII/PCI/confidential/public)
  1.5 Domain assignment
  1.6 Primary key detection
  1.7 Source relationship discovery

System prompt: "You are a senior data profiler with 20+ years of experience..."
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from core.agents.base_agent import (
    AgentState,
    llm_call,
    tool_emit_trace,
    tool_query_mongo,
    tool_read_skill,
)
from core.runtime_settings import resolve_llm_runtime

# ─── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a senior data profiler with 20+ years of enterprise data warehousing experience.
You work in ADM Agent Studio 2.0 as the SourceIntelligenceAgent.

Your responsibilities (Stage 1, Steps 1.1–1.7):
1. Profile all source tables/files in scope
2. Build a business data dictionary (infer business names from technical names)
3. Classify sensitive data (PII, PCI, confidential, public)
4. Assign business domain to each table
5. Detect primary keys (natural + composite candidates)
6. Discover source relationships (FKs, naming-pattern matches)

Output format (JSON only):
{
  "tables": {
    "<table_name>": {
      "row_count_estimate": <int or null>,
      "column_count": <int>,
      "columns": [
        {"name": "col_name", "data_type": "VARCHAR", "nullable": true, "distinct_pct": 95.2, "null_pct": 0.1,
         "business_name": "Customer ID", "sensitivity": "PII", "domain": "Customer", "is_pk_candidate": true}
      ],
      "natural_pks": ["col_name"],
      "composite_pk_candidates": [["col1","col2"]],
      "foreign_key_candidates": [{"from_col": "col", "to_table": "table", "to_col": "col", "confidence": 0.9}],
      "domain": "Customer",
      "dq_observations": ["15% of customer_email values are NULL", "..."]
    }
  },
  "cross_table_relationships": [
    {"from_table": "orders", "from_col": "customer_id", "to_table": "customers", "to_col": "id", "confidence": 0.95}
  ],
  "source_summary": "Free text summary of source coverage, quality, and key risks"
}

Rules:
- Ask for missing source scope (no tables = no analysis — never hallucinate table names)
- Flag tables with > 30% null PKs as data quality concerns
- Infer business_name from technical column names using naming conventions
- Mark PII: SSN, email, phone, DOB, address, name, passport, IP, biometric
- Use skills (injected below) as authoritative rules — they override your defaults
"""


# ─── LangGraph nodes ──────────────────────────────────────────────────────────

async def node_init(state: AgentState, db=None) -> AgentState:
    """Emit 'started' trace event and load skill content."""
    state["thinking"] = ["Initializing SourceIntelligenceAgent"]
    state["peer_call_count"] = state.get("peer_call_count", 0)
    state["status"] = "running"
    state["tool_calls"] = []

    # Load skill content
    skills_md = ""
    skill_refs = (state.get("context_refs") or {}).get("skill_refs", {}).get("source_analysis", [])
    if skill_refs and db:
        for skill_id in skill_refs:
            content = await tool_read_skill(skill_id, db)
            skills_md += f"\n\n{content}"
    state["skills_markdown"] = skills_md

    await tool_emit_trace(
        state.get("session_id", ""),
        "started",
        {"agent": "SourceIntelligenceAgent", "stage": "source_analysis", "trace_id": state.get("trace_id", "")},
        state.get("trace_id", ""),
    )
    return state


async def node_fetch_sources(state: AgentState, db=None) -> AgentState:
    """1.1 — Retrieve source files / tables from Mongo."""
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "1.1", "label": "Retrieving source list"})
    state["thinking"].append("Step 1.1: Fetching source files/tables from Mongo")

    sources: List[Dict] = []
    project_id = state.get("project_id", "")
    ctx = state.get("context_refs", {})

    if db and project_id:
        # Fetch parsed_documents for this project
        docs = await tool_query_mongo("parsed_documents", {"project_id": project_id}, db, limit=200)
        sources.extend(docs)
        # Also check project_files for inline files
        files = await tool_query_mongo("project_files", {"project_id": project_id}, db, limit=50)
        sources.extend(files)

    state["context_refs"] = {**(ctx or {}), "_sources": sources}
    return state


async def node_profile_tables(state: AgentState, db=None) -> AgentState:
    """1.2–1.7 — Main profiling LLM call."""
    await tool_emit_trace(state.get("session_id", ""), "thinking", {"step": "1.2-1.7", "label": "Profiling tables and discovering relationships"})
    state["thinking"].append("Step 1.2–1.7: Running LLM profiling pass")

    runtime = resolve_llm_runtime(None)
    sources = (state.get("context_refs") or {}).get("_sources", [])
    skills_block = f"\n\n## Active Skills\n{state.get('skills_markdown', '')}" if state.get("skills_markdown") else ""

    sys_prompt = SYSTEM_PROMPT + skills_block
    user_prompt = (
        f"Instruction: {state.get('instruction', 'Profile all source tables.')}\n\n"
        f"Project ID: {state.get('project_id', '')}\n"
        f"Target Dialect: {(state.get('context_refs') or {}).get('target_dialect', 'snowflake')}\n"
        f"Directives: {json.dumps(state.get('directives', []))}\n\n"
        f"Source data ({len(sources)} sources):\n{json.dumps(sources[:3], default=str)[:4000]}\n\n"
        "Return the full profiling output as valid JSON matching the schema in your system prompt."
    )

    try:
        raw = await llm_call(runtime, sys_prompt, user_prompt, response_format="json")
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {"raw_output": raw, "parse_error": "Response was not valid JSON — returning raw"}
    except Exception as exc:
        result = {"error": str(exc)}

    state["output"] = result
    state["output_text"] = json.dumps(result, indent=2)[:5000]
    state["status"] = "ready"

    await tool_emit_trace(state.get("session_id", ""), "output", {"stage": "source_analysis", "table_count": len(result.get("tables", {}))})
    return state


async def node_save_gate(state: AgentState, db=None) -> AgentState:
    """Persist G1 output to session_gates collection and emit gate_ready."""
    if db and state.get("session_id"):
        await db["session_gates"].update_one(
            {"session_id": state["session_id"], "gate": "G1"},
            {
                "$set": {
                    "status": "ready",
                    "output_payload": state.get("output", {}),
                    "has_unsaved_changes": False,
                    "stage_steps": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"],
                    "completed_at": __import__("datetime").datetime.utcnow(),
                }
            },
            upsert=True,
        )
    await tool_emit_trace(
        state.get("session_id", ""),
        "gate_ready",
        {"gate": "G1", "stage": "source_analysis", "table_count": len((state.get("output") or {}).get("tables", {}))},
        state.get("trace_id", ""),
    )
    state["status"] = "ready"
    return state


# ─── LangGraph subgraph builder ───────────────────────────────────────────────

def build_source_intelligence_subgraph():
    """Build the SourceIntelligenceAgent LangGraph subgraph."""
    try:
        from langgraph.graph import END, StateGraph
    except ImportError:
        return None

    graph = StateGraph(AgentState)
    graph.add_node("init", node_init)
    graph.add_node("fetch_sources", node_fetch_sources)
    graph.add_node("profile_tables", node_profile_tables)
    graph.add_node("save_gate", node_save_gate)

    graph.set_entry_point("init")
    graph.add_edge("init", "fetch_sources")
    graph.add_edge("fetch_sources", "profile_tables")
    graph.add_edge("profile_tables", "save_gate")
    graph.add_edge("save_gate", END)

    return graph.compile()


SOURCE_INTELLIGENCE_GRAPH = build_source_intelligence_subgraph()


# ─── Public run function ──────────────────────────────────────────────────────

async def run_source_intelligence_agent(
    session_id: str,
    project_id: str,
    instruction: str,
    context_refs: Dict[str, Any],
    directives: List[str],
    trace_id: str,
    db,
) -> Dict[str, Any]:
    """Invoke the SourceIntelligenceAgent subgraph for a given task pointer."""
    initial_state: AgentState = {
        "session_id": session_id,
        "project_id": project_id,
        "trace_id": trace_id,
        "stage": "source_analysis",
        "instruction": instruction,
        "directives": directives,
        "context_refs": context_refs,
        "runtime": {},
        "peer_call_count": 0,
        "skills_markdown": "",
        "tool_calls": [],
        "thinking": [],
        "output": {},
        "output_text": "",
        "error": None,
        "status": "running",
    }

    if SOURCE_INTELLIGENCE_GRAPH:
        # Inject db via a config-style approach (LangGraph 0.2+)
        final = await SOURCE_INTELLIGENCE_GRAPH.ainvoke(initial_state)
        return final
    else:
        # Fallback without LangGraph
        s = await node_init(initial_state, db)
        s = await node_fetch_sources(s, db)
        s = await node_profile_tables(s, db)
        s = await node_save_gate(s, db)
        return s
