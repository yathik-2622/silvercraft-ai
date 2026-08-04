"""
Shared LangGraph checkpointer, backed by your live MongoDB cluster (same
connection as everything else — MONGO_URI). Uses `langgraph-checkpoint-
mongodb`'s MongoDBSaver: it wraps a synchronous pymongo.MongoClient, but
DOES implement working async methods (aput/aget_tuple/alist), inherited
from BaseCheckpointSaver's default executor-wrapped behavior — verified
directly against the installed package before writing this, not assumed.
That makes it safe to use with `.ainvoke()` in this fully-async codebase.

One instance, opened once, reused process-wide — same pattern as
ADM_get_mongo_client() in app/db/mongo_client.py.
"""
from contextlib import ExitStack
from functools import lru_cache

from langgraph.checkpoint.mongodb.saver import MongoDBSaver

from app.config import ADM_get_settings

_ADM_checkpointer_stack = ExitStack()


@lru_cache
def ADM_get_solution_agent_checkpointer() -> MongoDBSaver:
    """
    Separate logical DB name (not the operational `adm2` DB) so LangGraph's
    own checkpoint/writes collections don't mix with the TDS's named
    collections — this IS the `agent_checkpoints` concept from the TDS,
    just using LangGraph's own schema for it rather than a hand-rolled one.
    """
    settings = ADM_get_settings()
    saver = _ADM_checkpointer_stack.enter_context(
        MongoDBSaver.from_conn_string(
            settings.MONGO_URI,
            db_name=f"{settings.MONGO_DB_NAME}_agent_checkpoints",
        )
    )
    return saver
