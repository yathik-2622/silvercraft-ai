#!/usr/bin/env python
"""
promote_admin.py — a one-off operational utility, NOT a seed script.

The distinction matters: seed.py was removed because it was the only way
business content (skills, KB docs) got into the system — that's now a real
admin UI + API (app/api/routes_admin.py). This script does something
different in kind: it flips a boolean on an already-registered user, once,
because there is deliberately no public API that can set is_admin=True
(ADM_require_admin in app/core/auth.py would be pointless otherwise).

Usage:
    python scripts/promote_admin.py <username>
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.collections import ADM_COLLECTION_USERS
from app.db.mongo_client import ADM_get_db


async def ADM_promote_admin(username: str) -> None:
    db = ADM_get_db()
    result = await db[ADM_COLLECTION_USERS].update_one(
        {"username": username}, {"$set": {"is_admin": True}}
    )
    if result.matched_count == 0:
        print(f"No user found with username '{username}'. Register the user first, then re-run this.")
        sys.exit(1)
    print(f"'{username}' is now an admin. They'll need to log in again for a fresh check (is_admin is read live per-request, not cached in the JWT).")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/promote_admin.py <username>")
        sys.exit(1)
    asyncio.run(ADM_promote_admin(sys.argv[1]))
