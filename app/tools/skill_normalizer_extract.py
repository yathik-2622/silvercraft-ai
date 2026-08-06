"""
skill_normalizer_extract — native tool backing app/agents/skill_normalizer.py.
Constrained-DRAFTING LLM call: maps a free-form skill description into a
COMPLETE, usable Task/Workflow/Utility Skill definition.

Phase 6 policy change from the original "never invent, omit if absent"
extraction philosophy: the user-facing goal is that creating a skill from
an uploaded doc should never require filling in more than the skill's
identity (skill_id, title) — everything else (purpose/prompt/expected_
output/tools/modeling_style/stage/kind) must be drafted using reasonable
professional judgment from the source text, not left blank for the human
to type in. Only skill_id/title may land in missing_fields now.

Workflow-aware: when the source text describes a multi-step process
(profiling, then classification, then DDL generation, etc.), the LLM also
drafts `task_list` — one entry per step, matched against the existing
task-skill catalog (passed in by the caller) wherever a step clearly
corresponds to a real skill, rather than inventing a duplicate. This is
what was missing before: a workflow-shaped source document used to
produce a skill with kind="workflow" but an empty task_list.
"""
import logging

from app.llm.client import ADM_chat_completion_json

logger = logging.getLogger(__name__)

ADM_SKILL_SCHEMA_FIELDS = [
    "skill_id", "kind", "title", "purpose", "prompt", "tools",
    "expected_output", "stage", "modeling_style", "task_list",
]

ADM_EXTRACTION_SYSTEM_PROMPT = """You are a drafting engine for the ADM Skill schema. Given a free-form skill
description, produce a COMPLETE, usable skill definition — draft reasonable, professional content for any field
the source text doesn't spell out verbatim (purpose, prompt, expected_output, tools, modeling_style, stage, kind),
using sound judgment about what the described skill is clearly for. Do not leave a field blank just because it
wasn't stated explicitly; only leave a field out if the text gives you nothing at all to work with.

The ONLY fields allowed in missing_fields are "skill_id" and "title" — these identify the skill and only the
user asking for it can reasonably supply them. Every other field must be drafted, never left missing.

Schema fields: skill_id, kind (workflow|task|utility — default to "task" for a single described action, "workflow"
for an explicit multi-step process, "utility" for a generic reusable helper with no fixed stage), title, purpose,
prompt, tools (list of tool names, [] if none apply), expected_output, stage (1-4, or null if not modeling-stage-specific),
modeling_style (default "canonical" unless the text says otherwise).

If kind is "workflow" (the text describes multiple ordered steps), ALSO produce:
  "task_list": [{"task_id": "<short_snake_case_id_for_this_step>", "skill_id": "<matching existing skill_id from
  the reference catalog below when a step clearly corresponds to one, otherwise a new short snake_case id — never
  invent a new id for a step that already has a real equivalent in the catalog>", "name": "<the matched catalog
  skill's real title, copied verbatim, when skill_id matched an existing entry — otherwise a short human-readable
  label you draft for the new step, e.g. 'Profile Source'>"}, ...]
one entry per described step, in the order described. Omit task_list entirely for kind task/utility.

Return STRICT JSON with two top-level keys:
  "extracted": {<every field you drafted or found, including task_list for workflows>}
  "missing_fields": [<"skill_id" and/or "title", only if genuinely absent from the text>]
No other text, no markdown fences.
"""


def ADM_build_task_catalog_block(task_catalog: list[dict] | None) -> str:
    """Formats the existing kind=task skill catalog as prompt reference
    context, so the LLM matches a workflow step to a real skill_id instead
    of inventing a duplicate. Pure function, unit-tested independently of
    the LLM call."""
    if not task_catalog:
        return ""
    lines = "\n".join(f"- {t['skill_id']}: {t.get('title', '')} — {t.get('purpose', '')}" for t in task_catalog)
    return f"\n\nExisting task skills (reference for task_list.skill_id matching):\n{lines}"


async def ADM_extract_skill_from_text(raw_text: str, task_catalog: list[dict] | None = None) -> dict:
    system_prompt = ADM_EXTRACTION_SYSTEM_PROMPT + ADM_build_task_catalog_block(task_catalog)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": raw_text},
    ]
    result = await ADM_chat_completion_json(messages, temperature=0.1)
    result.setdefault("extracted", {})
    result.setdefault("missing_fields", [])

    # Only skill_id/title are allowed to be "required" now — drop anything
    # else the LLM (incorrectly) reported missing, and cap missing_fields
    # to that same identity-only set even if it invents another name.
    required = {"skill_id", "title"}
    found = set(result["extracted"].keys())
    result["missing_fields"] = [f for f in result["missing_fields"] if f in required]
    for field in required - found:
        if field not in result["missing_fields"]:
            result["missing_fields"].append(field)

    task_list = result["extracted"].get("task_list")
    if task_list is not None and not isinstance(task_list, list):
        logger.warning("ADM_extract_skill_from_text: dropping non-list task_list from LLM response: %r", task_list)
        result["extracted"].pop("task_list", None)

    logger.info(
        "ADM_extract_skill_from_text: kind=%s missing_fields=%s task_list_len=%s",
        result["extracted"].get("kind"), result["missing_fields"],
        len(result["extracted"]["task_list"]) if isinstance(result["extracted"].get("task_list"), list) else None,
    )
    return result
