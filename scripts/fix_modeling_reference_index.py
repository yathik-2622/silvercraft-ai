#!/usr/bin/env python
"""
fix_modeling_reference_index.py — one-off utility, not a seed script.

Drops the `modeling_reference` collection so its unique index on
`chunk_id` can rebuild clean, per SETUP_AND_TESTING.md §14. Only needed
once, on a cluster that already hit the DuplicateKeyError from documents
predating the chunk-level schema redesign. Safe to run — the collection
only ever holds regenerable KB content (re-uploadable via
POST /admin/kb/upload).

Reads MONGO_URI from .env the same way the app does — no connection
string needs to be typed or pasted anywhere.

Usage:
    python scripts/fix_modeling_reference_index.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient

from app.config import ADM_get_settings


def ADM_fix_modeling_reference_index() -> None:
    settings = ADM_get_settings()
    client = MongoClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]

    count = db["modeling_reference"].count_documents({})
    db["modeling_reference"].drop()
    print(f"Dropped 'modeling_reference' ({count} document(s) removed).")
    print("Restart uvicorn — ADM_ensure_indexes() will rebuild the index clean on an empty collection.")
    client.close()


if __name__ == "__main__":
    ADM_fix_modeling_reference_index()
