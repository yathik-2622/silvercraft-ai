"""Safe JSON conversion for values read from MongoDB."""

from datetime import date, datetime
from typing import Any

from bson import ObjectId


def mongo_json(value: Any) -> Any:
    """Recursively convert Mongo-only values before returning an API response."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): mongo_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [mongo_json(item) for item in value]
    return value
