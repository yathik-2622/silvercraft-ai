"""Centralized persistence for user and system activity audit events."""

from datetime import datetime
from typing import Any, Optional


async def record_audit_event(
    db,
    *,
    user_id: Optional[str],
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    project_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    """Write an immutable event so every important workflow action is traceable."""
    await db["audit_events"].insert_one({
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "project_id": project_id,
        "payload": payload or {},
        "created_at": datetime.utcnow(),
    })
