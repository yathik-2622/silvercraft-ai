"""Provider-neutral master/sub-agent orchestration for chat-first modeling."""

from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException

from core.runtime_settings import resolve_llm_runtime


STAGE_AGENTS = {
    "1-source-analysis": ("Source Analysis Agent", "Profile supplied sources, ask only for missing source scope, and return a data dictionary, quality observations, relationships, and sensitive-data findings."),
    "2-conceptual": ("Conceptual Modeling Agent", "Define business concepts, candidate relationships, cardinalities, and assumptions from approved source analysis."),
    "3-logical": ("Logical Modeling Agent", "Create normalized logical entities, attributes, PK/FK relationships, and validation assumptions."),
    "4-physical-sttm": ("Physical Data Modeling Agent", "Create target-dialect physical design guidance, DDL-ready structures, and source-to-target mappings."),
}


async def _chat_completion(runtime: dict, system_prompt: str, user_prompt: str) -> str:
    """Call any OpenAI-compatible provider configured for the signed-in user."""
    if not runtime.get("api_key"):
        raise HTTPException(status_code=503, detail="No LLM API key is configured. Open Settings and save your provider key.")
    base_url = (runtime.get("base_url") or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=503, detail="No LLM base URL is configured.")
    headers = {"Authorization": f"Bearer {runtime['api_key']}", "Content-Type": "application/json"}
    body = {"model": runtime["default_model"], "temperature": 0.2, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{base_url}/chat/completions", headers=headers, json=body)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"LLM provider rejected the request: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to reach the configured LLM provider: {exc}") from exc
    try:
        return str(payload["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="LLM provider returned an unsupported completion response.") from exc


async def run_chat_orchestration(db, user_id: str, request: dict[str, Any]) -> dict[str, Any]:
    """Master agent delegates the current stage to its specialist and records execution events."""
    stage = request.get("current_stage") or "1-source-analysis"
    agent_name, agent_instruction = STAGE_AGENTS.get(stage, STAGE_AGENTS["1-source-analysis"])
    runtime = await resolve_llm_runtime(db, user_id)
    context = request.get("schema_context") or {}
    skills = [skill.lstrip("/") for skill in request.get("skills") or []]
    user_prompt = request.get("prompt", "")
    master_prompt = (
        "You are the SilverCraft Master Orchestrator. Decide what the current data-modeling stage needs, "
        "delegate to the named specialist, preserve user intent, and require HITL when assumptions affect the model. "
        f"Current stage: {stage}. Specialist: {agent_name}. Active skills: {', '.join(skills) or 'standard modeling'}. "
        f"Project context: {context}. User request: {user_prompt}"
    )
    master_brief = await _chat_completion(runtime, "Return a concise delegation brief only.", master_prompt)
    specialist_prompt = (
        f"You are {agent_name}. {agent_instruction}\n"
        "Return a structured, editable modeling artifact in Markdown with: Findings, Proposed Output, Assumptions, and HITL Question. "
        "Do not claim to have inspected a source that was not provided.\n\n"
        f"Master delegation brief:\n{master_brief}\n\nUser request:\n{user_prompt}"
    )
    output = await _chat_completion(runtime, specialist_prompt, user_prompt)
    event = {"agent_name": agent_name, "stage": stage, "status": "completed", "started_at": datetime.utcnow(), "completed_at": datetime.utcnow(), "summary": output[:500]}
    if request.get("project_id") or request.get("workflow_id"):
        await db["agent_runs"].insert_one({**event, "project_id": request.get("project_id"), "workflow_id": request.get("workflow_id"), "chat_id": request.get("chat_id"), "created_by": user_id, "master_brief": master_brief, "output": output})
    return {"reply": output, "stage": stage, "source": "master-orchestrator", "agent_events": [event], "artifact": {"title": agent_name, "stage": stage, "content": output, "requires_hitl": True}}
