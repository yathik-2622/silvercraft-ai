"""
skill_normalizer_extract — native tool backing app/agents/skill_normalizer.py.
Constrained-extraction LLM call: maps free-form skill description text into
the exact Task/Workflow Skill schema, without paraphrasing or inventing
content. Anything it can't find goes to `missing_fields`, never fabricated.
"""
from app.llm.client import ADM_chat_completion_json

ADM_SKILL_SCHEMA_FIELDS = [
    "skill_id", "kind", "title", "purpose", "prompt", "tools",
    "expected_output", "stage", "modeling_style",
]

ADM_EXTRACTION_SYSTEM_PROMPT = """You are a constrained extraction engine for the ADM Skill schema.
Given a free-form skill description, extract ONLY fields that are explicitly present
or directly and unambiguously implied by the text. Do NOT invent, guess, or embellish
any field. If a required field is not present in the text, omit it entirely — do not
fill it with a placeholder or best guess.

Required schema fields: skill_id, kind (workflow|task|utility), title, purpose, prompt,
tools (list of tool names), expected_output, stage (1-4 or null), modeling_style.

Return STRICT JSON with two top-level keys:
  "extracted": {<only the fields you found>}
  "missing_fields": [<names of required fields you could not find>]
No other text, no markdown fences.
"""


async def ADM_extract_skill_from_text(raw_text: str) -> dict:
    messages = [
        {"role": "system", "content": ADM_EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": raw_text},
    ]
    result = await ADM_chat_completion_json(messages, temperature=0.0)
    result.setdefault("extracted", {})
    result.setdefault("missing_fields", [])

    required = {"skill_id", "kind", "title", "purpose", "prompt"}
    found = set(result["extracted"].keys())
    for field in required - found:
        if field not in result["missing_fields"]:
            result["missing_fields"].append(field)

    return result