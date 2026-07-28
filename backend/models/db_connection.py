"""
DB Connection model — ADM_2.0_BUILD_SPEC.md §4.2 db_connections collection + §4.6.

Credentials are stored as secret-manager references (never raw) — per BUILD_SPEC §5.3.
For local dev, credentials are encrypted using Fernet (AES-128-CBC) before storage.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from models.user import PyObjectId


class DBConnectionModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    project_id: str
    created_by: str

    # Connection metadata
    dialect: str                # snowflake | postgres | sqlserver | bigquery | mysql | ...
    display_name: str = ""      # User-assigned friendly name

    # Credential storage — BUILD_SPEC §5.3
    # host_ref is a secret-manager pointer (or encrypted blob for local dev).
    # NEVER the raw host/password.
    host_ref: str = ""          # secret-manager pointer or encrypted cred blob
    database_name: str = ""
    schema_name: str = "public"
    port: Optional[int] = None
    ssl_required: bool = True

    # ADM modeling context
    existing_model_ref: Optional[str] = None   # Enterprise model to map against (Step 3.8)
    target_dialect: str = "snowflake"          # Output DDL dialect
    naming_skill_ref: Optional[str] = None     # Overrides project default

    # Connection test status
    last_tested_at: Optional[datetime] = None
    last_test_status: str = "untested"         # untested | ok | failed
    last_test_error: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}


class DBConnectionCreate(BaseModel):
    """Intake form fields — BUILD_SPEC §4.6 modal fields."""
    display_name: str = ""
    dialect: str
    host: str                   # Will be encrypted before storage
    port: Optional[int] = None
    username: str = ""          # Will be encrypted
    password: str = ""          # Will be encrypted
    database_name: str = ""
    schema_name: str = "public"
    ssl_required: bool = True
    existing_model_ref: Optional[str] = None
    target_dialect: str = "snowflake"
    naming_skill_ref: Optional[str] = None


class DBConnectionResponse(BaseModel):
    id: str
    project_id: str
    created_by: str
    dialect: str
    display_name: str = ""
    database_name: str = ""
    schema_name: str = "public"
    port: Optional[int] = None
    ssl_required: bool = True
    existing_model_ref: Optional[str] = None
    target_dialect: str = "snowflake"
    naming_skill_ref: Optional[str] = None
    last_tested_at: Optional[datetime] = None
    last_test_status: str = "untested"
    last_test_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TableListResponse(BaseModel):
    """Response for GET /db-connections/{id}/tables."""
    connection_id: str
    dialect: str
    database_name: str
    schema_name: str
    tables: list[Dict[str, Any]]    # [{name, row_count?, column_count?}]
