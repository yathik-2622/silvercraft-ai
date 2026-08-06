#!/usr/bin/env python
"""
backfill_has_business_standards.py — one-off migration.

Business Standards used to be admin-upload-only; `ADM_Project.
has_business_standards` is a new denormalized flag (set going forward by
app/api/routes_projects.py's PUT/PATCH /{project_id}/business-standards
routes) so the dashboard can render the chip without an N+1 lookup. Any
project that already had a business_standards document uploaded via the
old admin-only path predates this flag and would otherwise show
has_business_standards=False until next edited — this sets it true for
every project_id already present in the business_standards collection.

Usage:
    python scripts/backfill_has_business_standards.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.collections import ADM_COLLECTION_BUSINESS_STANDARDS, ADM_COLLECTION_PROJECTS
from app.db.mongo_client import ADM_get_db


async def ADM_backfill() -> None:
    db = ADM_get_db()
    project_ids = await db[ADM_COLLECTION_BUSINESS_STANDARDS].distinct("project_id")
    if not project_ids:
        print("No business_standards documents found — nothing to backfill.")
        return
    result = await db[ADM_COLLECTION_PROJECTS].update_many(
        {"project_id": {"$in": project_ids}}, {"$set": {"has_business_standards": True}},
    )
    print(f"Found {len(project_ids)} project(s) with business standards; "
          f"matched {result.matched_count}, updated {result.modified_count} project document(s).")


if __name__ == "__main__":
    asyncio.run(ADM_backfill())
