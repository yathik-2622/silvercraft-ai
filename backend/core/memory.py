"""
Conversation Memory & Entity Extraction — Phase 8
Extracts long-term facts, preferences, and entities from user chats to persist across sessions.
"""

from __future__ import annotations

import json
from typing import Dict, Any, List
from datetime import datetime

from config import settings
from database import get_db
from core.logging import get_logger

logger = get_logger(__name__)

try:
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, SystemMessage
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False


_MEMORY_SYSTEM_PROMPT = """
You are an entity and directive extraction engine for SilverCraft AI.
Analyze the user's message and extract any long-term preferences, directives, or important data modeling facts.
Examples: "Always use SCD Type 2 for dimension tables", "The source system is Oracle 19c", "Do not use camelCase".

Return a JSON object with a single key "entities" containing a list of strings representing the extracted facts.
If there are no meaningful long-term facts, return {"entities": []}.
Do not include conversational filler.
"""

async def extract_and_store_memory(project_id: str, message: str, user_id: str) -> List[str]:
    """
    Extracts facts from a message and stores them in the memory_entities MongoDB collection.
    """
    if not LANGCHAIN_AVAILABLE or not settings.LLM_API_KEY:
        return []

    try:
        llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
            temperature=0.1,
            model_kwargs={"response_format": {"type": "json_object"}}
        )

        response = await llm.ainvoke([
            SystemMessage(content=_MEMORY_SYSTEM_PROMPT),
            HumanMessage(content=message)
        ])

        try:
            data = json.loads(response.content)
            entities = data.get("entities", [])
        except json.JSONDecodeError:
            entities = []

        if not entities:
            return []

        # Store in Mongo
        db = get_db()
        docs = [
            {
                "project_id": project_id,
                "entity": entity,
                "source_message": message,
                "extracted_by": user_id,
                "extracted_at": datetime.utcnow()
            }
            for entity in entities
        ]
        if docs:
            await db["memory_entities"].insert_many(docs)

        return entities

    except Exception as e:
        logger.error("Failed to extract memory", exc_info=True)
        return []


async def get_project_memories(project_id: str, limit: int = 20) -> List[str]:
    """Retrieves the most recent memory entities for a project."""
    db = get_db()
    cursor = db["memory_entities"].find({"project_id": project_id}).sort("extracted_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [doc["entity"] for doc in docs]
