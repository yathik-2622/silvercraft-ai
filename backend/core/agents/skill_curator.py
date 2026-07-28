"""
SkillCuratorAgent — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4.5

Cross-cutting, leaf agent (no outbound peer calls).
Tasks:
  TASK—create:  Create a new skill from user description or an example conversation
  TASK—enhance: Propose additions as a diff — never a silent rewrite
  TASK—match:   Given a modeling task, find the most relevant skill from the library

Timeout: 30s (short — it handles only skill documents, not modeling artifacts)
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from core.agents.base_agent import AgentState, llm_call, tool_emit_trace, tool_query_mongo
from core.runtime_settings import resolve_llm_runtime

SYSTEM_PROMPT = """You are the SkillCuratorAgent — a specialist in creating and improving reusable rule documents called "skills".
A skill is a structured Markdown document that modeling agents apply as constraints during their work.

Tasks you handle:
1. TASK—create: Create a new skill from a user description.
2. TASK—enhance: Propose diff-style additions to an existing skill. NEVER silently rewrite.
3. TASK—match: Given a modeling scenario, find and rank the best matching skills from the library.

Skill Markdown format:
---
name: kebab-case-name
title: Human Readable Title
description: One sentence description
stage_binding: source_analysis | conceptual | logical | physical | cross_cutting
---

## Rules
- Rule 1: ...
- Rule 2: ...

## Examples
...

## Edge Cases
...

For TASK—create:
Return JSON: {"name": "...", "title": "...", "description": "...", "stage_binding": "...", "content_md": "...full markdown..."}

For TASK—enhance:
Return JSON: {"original_content": "...", "proposed_content": "...", "diff_summary": "...", "thinking": [...]}

For TASK—match:
Return JSON: {"ranked_skills": [{"skill_id": "...", "name": "...", "relevance_score": 0.95, "reason": "..."}]}
"""


async def run_skill_curator_agent(
    task: str,            # "create" | "enhance" | "match"
    instruction: str,
    payload: Dict[str, Any],
    db,
    session_id: str = "",
    trace_id: str = "",
) -> Dict[str, Any]:
    """Run SkillCuratorAgent for a given task."""
    runtime = resolve_llm_runtime(None)

    await tool_emit_trace(session_id, "started", {"agent": "SkillCuratorAgent", "task": task}, trace_id)

    # Load skill library for match task
    skill_library = ""
    if task == "match" and db:
        skills = await tool_query_mongo("skills", {}, db, limit=100)
        skill_library = json.dumps(
            [{"id": s.get("id", ""), "name": s.get("name", ""), "stage_binding": s.get("stage_binding", ""), "description": s.get("description", "")} for s in skills],
            indent=2,
        )

    user_prompt = f"TASK—{task}\n\nInstruction: {instruction}\n\n"
    if task == "enhance":
        user_prompt += f"Existing skill content:\n{payload.get('existing_content', '')}\n\n"
        user_prompt += f"Edge cases to add: {json.dumps(payload.get('edge_cases', []))}\n\n"
    elif task == "match":
        user_prompt += f"Modeling scenario: {payload.get('scenario', '')}\n\n"
        user_prompt += f"Available skills:\n{skill_library}\n\n"
    elif task == "create":
        user_prompt += f"Examples: {json.dumps(payload.get('examples', []))}\n\n"

    user_prompt += "Return valid JSON matching the schema in your system prompt."

    await tool_emit_trace(session_id, "thinking", {"step": "curator", "label": f"Running TASK—{task}"})

    try:
        raw = await llm_call(runtime, SYSTEM_PROMPT, user_prompt, response_format="json")
        result = json.loads(raw)
    except Exception as exc:
        result = {"error": str(exc)}

    await tool_emit_trace(session_id, "completed", {"agent": "SkillCuratorAgent", "task": task}, trace_id)
    return result
