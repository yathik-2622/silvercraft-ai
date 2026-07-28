"""
Git Push — Push model artifacts (DDL, STTM, JSON model) to a GitHub repository.

Endpoint:
  POST /projects/{project_id}/push-to-github

The user provides:
  - repo_name: "owner/repo" or just "repo" (uses authenticated user as owner)
  - branch: target branch (default: main)
  - commit_message: optional custom message
  - github_token: personal access token (optional if GITHUB_TOKEN set in .env)
  - artifacts: list of artifact types to include ["ddl", "sttm", "json_model", "erd"]

Files created/updated in the repository:
  silvercraft/
    models/
      <project_name>/
        physical_model.sql    ← DDL
        sttm.csv              ← Source-to-Target Mapping
        logical_model.json    ← Full logical model
        conceptual_model.json ← Conceptual entities
        source_analysis.json  ← Source profiling output
        README.md             ← Auto-generated model summary
"""

from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.routes.auth import get_current_user
from api.routes.projects import _get_authorized_project
from database import get_db
from middleware.error_handler import ADMException
from models.user import UserModel
from config import settings

router = APIRouter()

GITHUB_API = "https://api.github.com"


class GitPushRequest(BaseModel):
    repo_name: str                          # "owner/repo" or just "repo"
    branch: str = "main"
    commit_message: str = ""
    github_token: Optional[str] = None     # per-request token; falls back to GITHUB_TOKEN env
    artifacts: List[str] = ["ddl", "sttm", "json_model"]  # which to include
    # Optional: target directory inside the repo
    target_dir: str = "silvercraft/models"
    # Session to read artifacts from (latest approved session if not specified)
    session_id: Optional[str] = None


class GitPushResponse(BaseModel):
    status: str
    repo_url: str
    commit_sha: Optional[str] = None
    files_pushed: List[str] = []
    branch: str
    message: str


# ─── GitHub API helpers ───────────────────────────────────────────────────────

async def _gh(method: str, path: str, token: str, **kwargs) -> Dict[str, Any]:
    """Make an authenticated GitHub API call."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await getattr(client, method)(f"{GITHUB_API}{path}", headers=headers, **kwargs)
    if resp.status_code == 401:
        raise ADMException("AUTH_REQUIRED", "GitHub token is invalid or expired.")
    if resp.status_code == 403:
        raise ADMException("FORBIDDEN_ROLE", "GitHub token does not have write permission to this repository.")
    if resp.status_code == 404:
        raise ADMException("NOT_FOUND", f"GitHub repository not found: {path}")
    if resp.status_code >= 400:
        raise ADMException("AGENT_TOOL_FAILURE", f"GitHub API error {resp.status_code}: {resp.text[:200]}")
    return resp.json() if resp.content else {}


async def _resolve_repo(repo_name: str, token: str) -> str:
    """Resolve 'repo' → 'owner/repo' using the authenticated user."""
    if "/" in repo_name:
        return repo_name
    user = await _gh("get", "/user", token)
    return f"{user['login']}/{repo_name}"


async def _ensure_repo(full_repo: str, token: str) -> None:
    """Verify the repo exists; create it if it doesn't (private by default)."""
    try:
        await _gh("get", f"/repos/{full_repo}", token)
    except ADMException as exc:
        if exc.code == "NOT_FOUND":
            # Create the repo
            owner, name = full_repo.split("/", 1)
            await _gh("post", "/user/repos", token, json={
                "name": name,
                "description": "ADM Agent Studio — generated data models",
                "private": True,
                "auto_init": True,
            })
        else:
            raise


async def _get_file_sha(full_repo: str, path: str, branch: str, token: str) -> Optional[str]:
    """Get current SHA of a file (needed to update it in-place)."""
    try:
        data = await _gh("get", f"/repos/{full_repo}/contents/{path}", token, params={"ref": branch})
        return data.get("sha")
    except ADMException:
        return None


async def _push_file(full_repo: str, path: str, content: str, message: str, branch: str, token: str) -> str:
    """Create or update a file in the repo. Returns the commit SHA."""
    encoded = base64.b64encode(content.encode("utf-8")).decode()
    sha = await _get_file_sha(full_repo, path, branch, token)
    payload: Dict[str, Any] = {
        "message": message,
        "content": encoded,
        "branch": branch,
    }
    if sha:
        payload["sha"] = sha
    result = await _gh("put", f"/repos/{full_repo}/contents/{path}", token, json=payload)
    return result.get("commit", {}).get("sha", "")


# ─── Artifact serialization helpers ──────────────────────────────────────────

def _ddl_content(g4_payload: Dict[str, Any], project_name: str) -> str:
    """Extract DDL from G4 gate output."""
    ddl_parts = [f"-- DDL generated by ADM Agent Studio 2.0"]
    ddl_parts.append(f"-- Project: {project_name}")
    ddl_parts.append(f"-- Generated at: {datetime.utcnow().isoformat()}")
    ddl_parts.append("")

    physical_tables = g4_payload.get("physical_tables", g4_payload.get("physicalTables", []))
    if isinstance(physical_tables, list):
        for table in physical_tables:
            if isinstance(table, dict):
                if "ddl" in table:
                    ddl_parts.append(table["ddl"])
                elif "name" in table or "tableName" in table:
                    name = table.get("tableName") or table.get("name", "unknown_table")
                    ddl_parts.append(f"-- Table: {name}")
                    ddl_parts.append(f"-- (DDL not yet generated — run physical modeling stage)")
                ddl_parts.append("")

    if len(ddl_parts) <= 4:
        ddl_parts.append("-- No physical tables found. Run through the full pipeline first.")

    return "\n".join(ddl_parts)


def _sttm_csv(g4_payload: Dict[str, Any]) -> str:
    """Serialize STTM rows to CSV."""
    rows = g4_payload.get("sttm_rows", g4_payload.get("sttmRows", []))
    if not rows:
        return "src_table,src_col,tgt_table,tgt_col,transformation_rule,dq_check,load_type\n# No STTM data yet\n"
    header = "src_table,src_col,tgt_table,tgt_col,transformation_rule,dq_check,load_type"
    lines = [header]
    for row in rows:
        if isinstance(row, dict):
            vals = [
                str(row.get("src_table", "")),
                str(row.get("src_col", row.get("src_column", ""))),
                str(row.get("tgt_table", "")),
                str(row.get("tgt_col", row.get("tgt_column", ""))),
                str(row.get("transformation_rule", row.get("rule", ""))).replace(",", ";"),
                str(row.get("dq_check", "")),
                str(row.get("load_type", "Full Load")),
            ]
            lines.append(",".join(vals))
    return "\n".join(lines) + "\n"


def _readme_content(project_name: str, layer: str, domain: str, all_gates: Dict[str, Any]) -> str:
    g1 = all_gates.get("G1", {})
    g2 = all_gates.get("G2", {})
    g3 = all_gates.get("G3", {})
    g4 = all_gates.get("G4", {})

    table_count = len(g1.get("tables", {}))
    concept_count = len(g2.get("concepts", {}))
    entity_count = len(g3.get("entities", {}))
    table_count_phys = len(g4.get("physical_tables", g4.get("physicalTables", [])))

    return f"""# {project_name} — Data Model

> Generated by [ADM Agent Studio 2.0](https://github.com/silvercraft-ai) · {datetime.utcnow().strftime("%Y-%m-%d")}

## Overview
| Property | Value |
|---|---|
| Project | {project_name} |
| Layer | {layer.capitalize()} |
| Domain | {domain or 'Not specified'} |

## Pipeline Summary
| Stage | Status | Count |
|---|---|---|
| G1 Source Analysis | ✅ | {table_count} tables |
| G2 Conceptual Modeling | {'✅' if concept_count else '⏳'} | {concept_count} concepts |
| G3 Logical Modeling | {'✅' if entity_count else '⏳'} | {entity_count} entities |
| G4 Physical Modeling | {'✅' if table_count_phys else '⏳'} | {table_count_phys} physical tables |

## Files
| File | Description |
|---|---|
| `physical_model.sql` | DDL for all physical tables |
| `sttm.csv` | Source-to-target mapping |
| `logical_model.json` | Full logical model (entities, attributes, keys, relationships) |
| `conceptual_model.json` | Business concepts and relationships |
| `source_analysis.json` | Source profiling output |

---
*Pushed from ADM Agent Studio 2.0 · Not for direct editing — use the Studio canvas.*
"""


# ─── Main endpoint ────────────────────────────────────────────────────────────

@router.post("/{project_id}/push-to-github", response_model=GitPushResponse)
async def push_to_github(
    project_id: str,
    body: GitPushRequest,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Push model artifacts to a GitHub repository.
    User provides repo_name and optional github_token.
    Creates the repo if it doesn't exist.
    Updates files atomically (each file is a separate commit).
    """
    oid, project = await _get_authorized_project(project_id, str(current_user.id), db)

    # Resolve GitHub token
    token = body.github_token or settings.GITHUB_TOKEN
    if not token:
        raise ADMException(
            "VALIDATION_ERROR",
            "No GitHub token provided. Supply github_token in the request body, "
            "or set GITHUB_TOKEN in the backend .env file.",
        )

    # Resolve repo name
    full_repo = await _resolve_repo(body.repo_name, token)
    await _ensure_repo(full_repo, token)

    # Get project metadata
    project_name = project.get("name", "unnamed-project")
    layer = project.get("layer", "foundation")
    domain = project.get("domain", "")
    safe_name = project_name.lower().replace(" ", "_").replace("/", "_")
    target_dir = f"{body.target_dir.rstrip('/')}/{safe_name}"

    # Get gate outputs
    session_id = body.session_id
    if not session_id:
        # Find the most recent session for this project
        latest_chat = await db["chats"].find_one(
            {"project_id": project_id},
            sort=[("updated_at", -1)],
        )
        session_id = str(latest_chat["_id"]) if latest_chat else None

    all_gates: Dict[str, Dict] = {}
    if session_id:
        gate_docs = await db["session_gates"].find({"session_id": session_id}).to_list(length=10)
        all_gates = {g["gate"]: g.get("output_payload", {}) for g in gate_docs}

    g4_payload = all_gates.get("G4", {})
    commit_message = body.commit_message or f"ADM Agent Studio: update {project_name} model [{datetime.utcnow().strftime('%Y-%m-%d %H:%M')}]"

    files_pushed: List[str] = []
    last_sha = ""

    # Push each requested artifact type
    if "ddl" in body.artifacts:
        path = f"{target_dir}/physical_model.sql"
        last_sha = await _push_file(full_repo, path, _ddl_content(g4_payload, project_name), commit_message, body.branch, token)
        files_pushed.append(path)

    if "sttm" in body.artifacts:
        path = f"{target_dir}/sttm.csv"
        last_sha = await _push_file(full_repo, path, _sttm_csv(g4_payload), commit_message, body.branch, token)
        files_pushed.append(path)

    if "json_model" in body.artifacts:
        path = f"{target_dir}/logical_model.json"
        last_sha = await _push_file(full_repo, path, json.dumps(all_gates.get("G3", {}), indent=2, default=str), commit_message, body.branch, token)
        files_pushed.append(path)

        path = f"{target_dir}/conceptual_model.json"
        last_sha = await _push_file(full_repo, path, json.dumps(all_gates.get("G2", {}), indent=2, default=str), commit_message, body.branch, token)
        files_pushed.append(path)

        path = f"{target_dir}/source_analysis.json"
        last_sha = await _push_file(full_repo, path, json.dumps(all_gates.get("G1", {}), indent=2, default=str), commit_message, body.branch, token)
        files_pushed.append(path)

    # Always push README
    path = f"{target_dir}/README.md"
    last_sha = await _push_file(full_repo, path, _readme_content(project_name, layer, domain, all_gates), commit_message, body.branch, token)
    files_pushed.append(path)

    # Log push
    await db["git_push_logs"].insert_one({
        "project_id": project_id,
        "session_id": session_id,
        "repo": full_repo,
        "branch": body.branch,
        "commit_sha": last_sha,
        "files_pushed": files_pushed,
        "pushed_by": str(current_user.id),
        "pushed_at": datetime.utcnow(),
    })

    return GitPushResponse(
        status="success",
        repo_url=f"https://github.com/{full_repo}/tree/{body.branch}/{target_dir}",
        commit_sha=last_sha,
        files_pushed=files_pushed,
        branch=body.branch,
        message=f"Successfully pushed {len(files_pushed)} file(s) to github.com/{full_repo}",
    )


@router.get("/{project_id}/git-push-logs")
async def list_git_push_logs(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    """Get history of all GitHub pushes for this project."""
    await _get_authorized_project(project_id, str(current_user.id), db)
    logs = await db["git_push_logs"].find({"project_id": project_id}).sort("pushed_at", -1).to_list(length=50)
    return [
        {**{k: v for k, v in log.items() if k != "_id"}, "id": str(log["_id"])}
        for log in logs
    ]
