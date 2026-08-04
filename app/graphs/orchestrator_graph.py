"""
Orchestrator Graph — LangGraph graph #1 (TDS §8: "2 LangGraph graphs").
Owns: intent extraction, the clarification loop, Tier routing, and Tier 0
skill-discovery matching (full skill index held in-context, no vector
search needed at this skill count, per TDS §5 row 2b). Every entry point
(chat message, `/`-selection, skill import) passes through here first —
there is no shortcut that reaches TaskWorker without this graph running.

Every node now streams its reasoning live to the chat's Redis channel via
app.core.reasoning_stream, so the UI can render "what the Orchestrator is
doing" as a live dropdown (node enter/exit, what it's about to fetch,
which downstream component it hands off to, and token-by-token answer
text) — the same shape the reference Cortex frontend already renders.
"""
from typing import Literal, TypedDict

from langgraph.graph import StateGraph, END

from app.db.vector_search import ADM_semantic_search, ADM_semantic_search_skills
from app.core.runtime_settings import ADM_chat_completion_json_for_user, ADM_stream_chat_completion_for_user
from app.core.reasoning_stream import (
    ADM_SOURCE_ORCHESTRATOR,
    ADM_stream_agent_call,
    ADM_stream_citations,
    ADM_stream_fetch,
    ADM_stream_log,
    ADM_stream_node,
    ADM_stream_token,
)


class ADM_OrchestratorState(TypedDict, total=False):
    project_id: str | None
    chat_id: str
    user_id: str | None                   # the sender of THIS message — whose BYOK settings resolve for this run's LLM calls
    message: str
    file_refs: list[dict]
    selected_skill_ids: list[str]
    orchestrator_model: str | None       # per-chat override, Orchestrator LLM calls only
    derive_title: bool                    # True only for a chat's first message with a still-default title
    derived_title: str | None
    tier: Literal["tier0", "tier2", "tier3"]
    missing_info: list[str]
    response_text: str
    matched_skill: dict | None
    matched_skills: list[dict]
    modeling_style: str | None
    citations: list[dict]
    create_project_prompt: dict | None    # set whenever "project" is in missing_info — see ADM_node_extract_intent


ADM_INTENT_SYSTEM_PROMPT = """You are the ADM Orchestrator's intent classifier.
Classify the user's message into exactly one tier:
- "tier0": a how-to / conversational question, no modeling execution requested.
- "tier3": a full modeling request (e.g. "model this as Canonical", with or
  without an attached source). Tier 2 (single-stage) is out of scope this cut
  and must never be selected — treat anything that isn't tier0 as tier3.

Also identify missing_info required for tier3 to proceed: specifically
"modeling_style" if not stated, and "source" if no file_refs were attached
and none was mentioned in the message. (Whether a project is missing is
determined by the caller, not you — never include "project" yourself.)

If this looks like a tier3 request, also infer a short business-domain
phrase describing what's being modeled (e.g. "Retail & E-Commerce",
"Financial & Core Banking") from the message content alone, in case a new
project needs to be created for it — null if nothing in the message
suggests one.

Also produce a short chat title (max 6 words, no trailing punctuation)
that captures the intent of this message — e.g. "Canonical model for
customer data" or "Source analysis question". This is used as the chat's
display name, so keep it concrete and specific to what was actually
asked, not generic ("Data modeling help" is too vague).

Return strict JSON: {"tier": "tier0"|"tier3", "modeling_style": str|null,
"missing_info": [str, ...], "title": str, "suggested_domain": str|null}
"""


async def ADM_node_extract_intent(state: ADM_OrchestratorState) -> ADM_OrchestratorState:
    chat_id = state["chat_id"]
    await ADM_stream_node(chat_id, ADM_SOURCE_ORCHESTRATOR, "extract_intent", "enter")
    await ADM_stream_log(chat_id, ADM_SOURCE_ORCHESTRATOR, "Classifying intent (tier0 vs tier3) for the incoming message...")

    has_source = bool(state.get("file_refs"))
    user_msg = f"Message: {state['message']}\nHas attached source: {has_source}"
    # --- BYOK divergence point -------------------------------------------
    # This is an Orchestrator LLM call, so it resolves the SENDING user's
    # own saved provider/key (app.core.runtime_settings) instead of the
    # platform's cached client. TaskWorker/SolutionAgent calls (everything
    # under app/agents/task_worker.py and app/graphs/solution_agent_graph.py)
    # never go through this path — they keep using app.llm.client's
    # platform-only ADM_chat_completion, unconditionally, regardless of
    # what the sending user has configured here. The per-chat
    # `orchestrator_model` override (state["orchestrator_model"]) still
    # wins over the user's account-level default_model when set, same
    # precedence as before this change.
    result = await ADM_chat_completion_json_for_user(
        [{"role": "system", "content": ADM_INTENT_SYSTEM_PROMPT}, {"role": "user", "content": user_msg}],
        user_id=state.get("user_id"),
        model=state.get("orchestrator_model"),
    )
    state["tier"] = result.get("tier", "tier3")
    state["modeling_style"] = result.get("modeling_style")
    missing = list(result.get("missing_info", []))
    if state["tier"] == "tier3" and not has_source and "source" not in missing:
        missing.append("source")
    if state["tier"] == "tier3" and not state["modeling_style"] and "modeling_style" not in missing:
        missing.append("modeling_style")
    has_project = bool(state.get("project_id"))
    if state["tier"] == "tier3" and not has_project and "project" not in missing:
        # Inserted first, not appended — a dashboard chat's Create Project
        # card is the gate every other clarification sits behind, so it's
        # what ADM_node_clarify (which only ever asks about missing_info[0])
        # surfaces first.
        missing.insert(0, "project")
    state["missing_info"] = missing
    state["create_project_prompt"] = (
        {"suggested_domain": result.get("suggested_domain"), "suggested_layer": "silver"}
        if "project" in missing else None
    )
    if state.get("derive_title"):
        state["derived_title"] = (result.get("title") or "").strip()[:80] or None

    await ADM_stream_log(
        chat_id, ADM_SOURCE_ORCHESTRATOR,
        f"Intent classified: tier={state['tier']}, missing_info={missing or 'none'}",
    )
    await ADM_stream_node(chat_id, ADM_SOURCE_ORCHESTRATOR, "extract_intent", "exit", tier=state["tier"])
    return state


def ADM_route_after_intent(state: ADM_OrchestratorState) -> str:
    if state["tier"] == "tier3" and state["missing_info"]:
        return "clarify"
    if state["tier"] == "tier0":
        return "tier0_answer"
    return "route_tier3"


async def ADM_node_clarify(state: ADM_OrchestratorState) -> ADM_OrchestratorState:
    """Row 2a: missing info -> clarifying question, one at a time, never assuming."""
    chat_id = state["chat_id"]
    await ADM_stream_node(chat_id, ADM_SOURCE_ORCHESTRATOR, "clarify", "enter")

    field = state["missing_info"][0]
    if field == "project":
        # Not a text question — the frontend keys off missing_info +
        # create_project_prompt (already set in ADM_node_extract_intent)
        # to render an inline Create Project card instead.
        state["response_text"] = (
            "This needs a project to run in — set one up below and I'll pick up right where we left off."
        )
    else:
        prompts = {
            "modeling_style": "Which modeling style would you like? (This first cut supports Canonical/3NF.)",
            "source": "Which source should I model — please attach a file or a database connection.",
        }
        state["response_text"] = prompts.get(field, f"Could you clarify: {field}?")

    await ADM_stream_log(chat_id, ADM_SOURCE_ORCHESTRATOR, f"Missing required info ('{field}') — asking a clarifying question instead of assuming.")
    await ADM_stream_node(chat_id, ADM_SOURCE_ORCHESTRATOR, "clarify", "exit", field=field)
    return state


async def ADM_node_tier0_answer(state: ADM_OrchestratorState) -> ADM_OrchestratorState:
    """
    Row 2b: Tier 0 — answer conversationally AND check the full skill index
    (small, held in-context) for a matching skill to render as a Preview card.
    Streams token-by-token, live, exactly like a normal chat model reply.
    """
    chat_id = state["chat_id"]
    await ADM_stream_node(chat_id, ADM_SOURCE_ORCHESTRATOR, "tier0_answer", "enter")

    # Embeddings are ALWAYS platform-only, never BYOK — see the
    # runtime_settings.py module docstring: modeling_reference/skills were
    # embedded at write time with the platform's own EMBEDDING_MODEL, so a
    # query embedded with a different (BYOK) model would land in an
    # incompatible vector space and silently return garbage matches. Only
    # the answer-generation call a few lines below is BYOK-aware.
    await ADM_stream_fetch(chat_id, ADM_SOURCE_ORCHESTRATOR, "modeling reference material (Atlas Vector Search)")
    kb_hits = await ADM_semantic_search(state["message"], top_k=3)
    kb_context = "\n".join(f"- {h.get('title')}: {h.get('content', '')[:300]}" for h in kb_hits)

    # Every chunk that fed the answer's context becomes a citation — the
    # chunk_id/source_doc_id/char_start/char_end are exactly what
    # GET /kb/documents/{source_doc_id} needs to render "whole doc, this
    # span highlighted" client-side, no further lookups required.
    citations = [
        {
            "source_doc_id": h.get("source_doc_id"),
            "chunk_id": h.get("chunk_id"),
            "title": h.get("title"),
            "chunk_index": h.get("chunk_index"),
            "char_start": h.get("char_start"),
            "char_end": h.get("char_end"),
            "snippet": (h.get("content") or "")[:200],
            "score": h.get("_score"),
        }
        for h in kb_hits if h.get("source_doc_id")
    ]
    state["citations"] = citations
    if citations:
        await ADM_stream_citations(chat_id, ADM_SOURCE_ORCHESTRATOR, citations)

    await ADM_stream_log(chat_id, ADM_SOURCE_ORCHESTRATOR, "Streaming answer...")
    answer_prompt = (
        f"User question: {state['message']}\n\n"
        f"Relevant modeling reference material:\n{kb_context}\n\n"
        f"Answer the question conversationally and concisely, in plain prose (no JSON)."
    )
    full_answer = ""
    # --- BYOK divergence point (see ADM_node_extract_intent above for the
    # full explanation) — this is the Orchestrator's other LLM call site,
    # so it's the other place that resolves the sending user's own
    # provider/key instead of the platform's cached client.
    async for delta in ADM_stream_chat_completion_for_user(
        [{"role": "system", "content": "You are the ADM Orchestrator answering a how-to question."},
         {"role": "user", "content": answer_prompt}],
        user_id=state.get("user_id"),
        model=state.get("orchestrator_model"),
    ):
        full_answer += delta
        await ADM_stream_token(chat_id, ADM_SOURCE_ORCHESTRATOR, delta)
    state["response_text"] = full_answer

    # Real semantic search over the skills catalog (skills are embedded on
    # write — app.db.vector_search.ADM_embed_and_store_skill) — supersedes
    # the earlier in-context keyword match, which was a deliberate month-1
    # simplification that stopped scaling once the catalog grows. This also
    # answers "what skills do I need for Canonical modeling / source
    # analysis" style questions with real matches, not just a single best
    # guess — matched_skills is the full ranked list, matched_skill stays
    # as the top hit for backward-compat with the single-card UI path.
    await ADM_stream_fetch(chat_id, ADM_SOURCE_ORCHESTRATOR, "matching skills (Atlas Vector Search over `skills`)")
    matched_skills = await ADM_semantic_search_skills(state["message"], top_k=5)
    state["matched_skills"] = matched_skills
    state["matched_skill"] = matched_skills[0] if matched_skills and (matched_skills[0].get("_score") or 0) > 0.5 else None
    if matched_skills:
        await ADM_stream_log(
            chat_id, ADM_SOURCE_ORCHESTRATOR,
            f"Matched {len(matched_skills)} skill(s): {[s['skill_id'] for s in matched_skills]} — Preview cards + `/` shortcuts available.",
        )

    await ADM_stream_node(chat_id, ADM_SOURCE_ORCHESTRATOR, "tier0_answer", "exit")
    return state


async def ADM_node_route_tier3(state: ADM_OrchestratorState) -> ADM_OrchestratorState:
    """Row 2e: complete tier3 request -> signal caller to enqueue plan_task."""
    chat_id = state["chat_id"]
    await ADM_stream_node(chat_id, ADM_SOURCE_ORCHESTRATOR, "route_tier3", "enter")
    state["response_text"] = "Got it — building your plan now."
    await ADM_stream_agent_call(
        chat_id, ADM_SOURCE_ORCHESTRATOR, "plan_task",
        f"Handing off to SolutionAgent.plan() via plan_task (modeling_style={state.get('modeling_style')})",
    )
    await ADM_stream_node(chat_id, ADM_SOURCE_ORCHESTRATOR, "route_tier3", "exit")
    return state


def ADM_build_orchestrator_graph():
    graph = StateGraph(ADM_OrchestratorState)
    graph.add_node("extract_intent", ADM_node_extract_intent)
    graph.add_node("clarify", ADM_node_clarify)
    graph.add_node("tier0_answer", ADM_node_tier0_answer)
    graph.add_node("route_tier3", ADM_node_route_tier3)

    graph.set_entry_point("extract_intent")
    graph.add_conditional_edges(
        "extract_intent", ADM_route_after_intent,
        {"clarify": "clarify", "tier0_answer": "tier0_answer", "route_tier3": "route_tier3"},
    )
    graph.add_edge("clarify", END)
    graph.add_edge("tier0_answer", END)
    graph.add_edge("route_tier3", END)
    return graph.compile()


_ADM_orchestrator_graph = None


def ADM_get_orchestrator_graph():
    global _ADM_orchestrator_graph
    if _ADM_orchestrator_graph is None:
        _ADM_orchestrator_graph = ADM_build_orchestrator_graph()
    return _ADM_orchestrator_graph


async def ADM_run_orchestrator(
    project_id: str | None, chat_id: str, message: str,
    file_refs: list[dict], selected_skill_ids: list[str],
    orchestrator_model: str | None = None, derive_title: bool = False,
    user_id: str | None = None,
) -> ADM_OrchestratorState:
    await ADM_stream_log(chat_id, ADM_SOURCE_ORCHESTRATOR, "Orchestrator received the message — starting graph run.")
    graph = ADM_get_orchestrator_graph()
    initial_state: ADM_OrchestratorState = {
        "project_id": project_id, "chat_id": chat_id, "message": message,
        "file_refs": file_refs, "selected_skill_ids": selected_skill_ids,
        "orchestrator_model": orchestrator_model, "derive_title": derive_title,
        "user_id": user_id,
    }
    final_state = await graph.ainvoke(initial_state)
    await ADM_stream_log(chat_id, ADM_SOURCE_ORCHESTRATOR, "Orchestrator graph run complete.")
    return final_state
