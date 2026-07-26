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
    print(f"✅ Connected to MongoDB: {settings.MONGODB_DB_NAME}")

async def close_mongo_connection():
    if _db.client:
        _db.client.close()
        print("MongoDB connection closed.")

def get_db():
    return _db.db
