"""
SkillCuratorAgent — ADM_2.0_AGENT_ARCHITECTURE_V2.md §4.5
Cross-cutting, leaf agent using pure LangGraph architecture.
"""

from __future__ import annotations
import json
from typing import Any, Dict, List, Optional
from langchain_core.messages import HumanMessage
from subagents.base_agent import BaseAgent

SYSTEM_PROMPT = """You are the SkillCuratorAgent — a specialist in creating and improving reusable rule documents called "skills".
A skill is a structured Markdown document that modeling agents apply as constraints during their work.

Tasks you handle:
1. TASK—create: Create a new skill from a user description.
2. TASK—enhance: Propose diff-style additions to an existing skill. NEVER silently rewrite.
3. TASK—match: Given a modeling scenario, find and rank the best matching skills from the library.

For TASK—create:
Return JSON: {"name": "...", "title": "...", "description": "...", "stage_binding": "...", "content_md": "...full markdown..."}

For TASK—enhance:
Return JSON: {"original_content": "...", "proposed_content": "...", "diff_summary": "...", "thinking": [...]}

For TASK—match:
Return JSON: {"ranked_skills": [{"skill_id": "...", "name": "...", "relevance_score": 0.95, "reason": "..."}]}
"""

class SkillCuratorAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="SkillCuratorAgent", system_prompt=SYSTEM_PROMPT)

async def run_skill_curator_agent(
    task: str,            # "create" | "enhance" | "match"
    instruction: str,
    payload: Dict[str, Any],
    db,
    session_id: str = "",
    trace_id: str = "",
) -> Dict[str, Any]:
    """Run SkillCuratorAgent for a given task using LangGraph."""
    agent = SkillCuratorAgent()
    
    # Build prompt
    user_prompt = f"TASK—{task}\n\nInstruction: {instruction}\n\n"
    if task == "enhance":
        user_prompt += f"Existing skill content:\n{payload.get('existing_content', '')}\n\n"
        user_prompt += f"Edge cases to add: {json.dumps(payload.get('edge_cases', []))}\n\n"
    elif task == "match":
        user_prompt += f"Modeling scenario: {payload.get('scenario', '')}\n\n"
        user_prompt += f"Available skills:\n{payload.get('skill_library', '[]')}\n\n"
    elif task == "create":
        user_prompt += f"Examples: {json.dumps(payload.get('examples', []))}\n\n"

    user_prompt += "Return valid JSON matching the schema in your system prompt."

    try:
        # Run agent
        result = await agent.invoke({
            "messages": [HumanMessage(content=user_prompt)],
            "session_id": session_id,
            "trace_id": trace_id
        })
        
        # Parse JSON from last message
        messages = result.get("messages", [])
        if messages and hasattr(messages[-1], "content"):
            parsed = json.loads(messages[-1].content)
            return parsed
        else:
            return {"error": "Failed to generate structured response"}
    except Exception as exc:
        return {"error": str(exc)}
