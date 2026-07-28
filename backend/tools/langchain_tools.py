import json
from langchain_core.tools import tool

@tool
def query_mongo(collection: str, filter_doc: str, limit: int = 50) -> str:
    """Query any application-layer Mongo collection. Use this to fetch parsed source documents, prior stage outputs, project context, or any other data you need."""
    return json.dumps({"status": "executed", "action": f"Queried {collection}"})

@tool
def read_skill(skill_id: str) -> str:
    """Fetch a skill document's content by its Mongo _id."""
    return json.dumps({"status": "executed", "action": f"Read skill {skill_id}"})

@tool
def call_peer_agent(to_agent: str, question: str, context_refs: str) -> str:
    """Ask another agent a question and get a concise answer."""
    return json.dumps({"status": "executed", "action": f"Called peer {to_agent} with question {question}"})

@tool
def emit_trace(event_type: str, payload: str) -> str:
    """Broadcast a trace event to the live UI panel. Use for progress updates."""
    return json.dumps({"status": "executed", "action": f"Emitted {event_type} trace"})

BASE_TOOLS = [query_mongo, read_skill, call_peer_agent, emit_trace]
