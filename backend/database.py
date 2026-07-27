from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

class _DB:
    client: AsyncIOMotorClient = None
    db = None

_db = _DB()

async def connect_to_mongo():
    _db.client = AsyncIOMotorClient(settings.MONGODB_URI)
    _db.db = _db.client[settings.MONGODB_DB_NAME]
    # Quick ping to verify connection
    await _db.client.admin.command("ping")
    # These indexes match the dashboard and chat-history query patterns.
    await _db.db["projects"].create_index("owner_id")
    await _db.db["projects"].create_index("shared_with")
    await _db.db["chats"].create_index([("project_id", 1), ("updated_at", -1)])
    await _db.db["workflows"].create_index([("project_id", 1), ("updated_at", -1)])
    await _db.db["hitl_decisions"].create_index([("workflow_id", 1), ("decided_at", -1)])
    await _db.db["agent_runs"].create_index([("project_id", 1), ("created_at", -1)])
    await _db.db["artifacts"].create_index([("chat_id", 1), ("created_at", -1)])
    await _db.db["artifacts"].create_index("project_id")
    print(f"Connected to MongoDB: {settings.MONGODB_DB_NAME}")

async def close_mongo_connection():
    if _db.client:
        _db.client.close()
        print("MongoDB connection closed.")

def get_db():
    return _db.db
