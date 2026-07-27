from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
import io
import json
import zipfile
import csv
import re
from pathlib import Path
from xml.etree import ElementTree
from bson import ObjectId
from database import get_db
from models.project import ProjectModel, ProjectCreate, ProjectUpdate, ProjectResponse, ProjectHistoryEntry, ProjectTeamMemberUpdate
from models.user import UserModel
from api.routes.auth import get_current_user
from core.security import get_password_hash
from core.audit import record_audit_event

router = APIRouter()

class ArtifactExportRequest(BaseModel):
    project_name: str
    chat_title: str = "Modeling Run"
    format: str
    payload: Dict[str, Any] = {}

class KnowledgeGraphPushRequest(BaseModel):
    domain: str
    sub_domain: str = ""
    chat_id: str = "current"
    payload: Dict[str, Any] = {}

class ProjectFileResponse(BaseModel):
    id: str
    project_id: str
    category: str
    filename: str
    content_type: str
    size: int
    uploaded_at: datetime
    parser: str = "raw"
    parsed_preview: Dict[str, Any] = {}


# Store raw uploads on the local filesystem for now; object storage can replace this root later.
LOCAL_UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "storage" / "projects"


def _parse_uploaded_file(filename: str, content_type: str, raw: bytes) -> tuple[str, dict[str, Any]]:
    """Parse supported source formats into a bounded preview without losing the raw file."""
    suffix = Path(filename or "").suffix.lower()
    if suffix == ".csv" or "csv" in content_type:
        rows = list(csv.DictReader(raw.decode("utf-8-sig", errors="replace").splitlines()))[:50]
        return "csv", {"columns": list(rows[0].keys()) if rows else [], "rows": rows, "row_count_preview": len(rows)}
    if suffix == ".json" or "json" in content_type:
        value = json.loads(raw.decode("utf-8-sig", errors="replace"))
        rows = value if isinstance(value, list) else [value]
        return "json", {"rows": rows[:50], "row_count_preview": min(len(rows), 50)}
    if suffix == ".xlsx":
        # Read the first worksheet using the XLSX XML package, avoiding a binary blob in MongoDB.
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            shared = []
            if "xl/sharedStrings.xml" in archive.namelist():
                root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
                shared = ["".join(node.itertext()) for node in root]
            sheet = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
            rows = []
            for row in sheet.findall(".//{*}row")[:51]:
                values = []
                for cell in row.findall("{*}c"):
                    value = cell.find("{*}v")
                    text = value.text if value is not None else ""
                    if cell.get("t") == "s" and text.isdigit() and int(text) < len(shared):
                        text = shared[int(text)]
                    values.append(text)
                rows.append(values)
        return "xlsx", {"columns": rows[0] if rows else [], "rows": rows[1:51], "row_count_preview": max(len(rows) - 1, 0)}
    if suffix in {".doc", ".docx"}:
        text = ""
        if suffix == ".docx":
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                document = ElementTree.fromstring(archive.read("word/document.xml"))
                text = " ".join("".join(node.itertext()) for node in document.findall(".//{*}p"))
        else:
            text = raw.decode("utf-8", errors="replace")
        return "document", {"text_preview": text[:10000]}
    if suffix == ".txt" or content_type.startswith("text/"):
        return "text", {"text_preview": raw.decode("utf-8", errors="replace")[:10000]}
    raise HTTPException(status_code=415, detail=f"Unsupported upload format: {suffix or content_type}")

def _to_response(p: dict) -> ProjectResponse:
    p = dict(p)
    p["id"] = str(p.pop("_id"))
    return ProjectResponse(**p)

def _project_card(p: dict, user_id: str) -> dict:
    response = _to_response(p).model_dump()
    response["access_role"] = "owner" if p.get("owner_id") == user_id else "collaborator"
    response["member_count"] = len(p.get("shared_with", []) or [])
    return response

async def _get_authorized_project(project_id: str, user_id: str, db):
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    project = await db["projects"].find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["owner_id"] != user_id and user_id not in project.get("shared_with", []):
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return oid, project

def _artifact_markdown(req: ArtifactExportRequest) -> str:
    payload = req.payload or {}
    return "\n".join([
        f"# {req.project_name} - {req.chat_title}",
        "",
        "## Source Tables",
        json.dumps(payload.get("sourceTables", []), indent=2, default=str),
        "",
        "## Conceptual Model",
        json.dumps({"concepts": payload.get("concepts", []), "relationships": payload.get("conceptRelationships", [])}, indent=2, default=str),
        "",
        "## Logical Model",
        json.dumps({"entities": payload.get("logicalEntities", []), "relationships": payload.get("logicalRelationships", [])}, indent=2, default=str),
        "",
        "## Physical Model & STTM",
        json.dumps({"tables": payload.get("physicalTables", []), "sttm": payload.get("sttmRows", [])}, indent=2, default=str),
    ])

def _pdf_bytes(text: str) -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    lines = escaped.splitlines()[:45]
    content = "BT /F1 10 Tf 40 780 Td " + " T* ".join(f"({line[:95]})" for line in lines) + " ET"
    objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
        "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
        f"5 0 obj << /Length {len(content.encode('latin-1', 'ignore'))} >> stream\n{content}\nendstream endobj",
    ]
    body = "%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(body.encode("latin-1")))
        body += obj + "\n"
    xref_pos = len(body.encode("latin-1"))
    body += f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n"
    body += "".join(f"{offset:010d} 00000 n \n" for offset in offsets[1:])
    body += f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF"
    return body.encode("latin-1", "ignore")

def _docx_bytes(text: str) -> bytes:
    xml_text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    paragraphs = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in xml_text.splitlines())
    document_xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{paragraphs}</w:body></w:document>'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        docx.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        docx.writestr("word/document.xml", document_xml)
    buffer.seek(0)
    return buffer.read()

@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(project: ProjectCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    collaborator_ids, collaborator_emails = await _resolve_collaborators(project.collaborators, current_user.email, db)
    new_project = ProjectModel(
        name=project.name,
        description=project.description,
        owner_id=str(current_user.id),
        domain=project.domain,
        sub_domain=project.sub_domain,
        layer=project.layer,
        execution_flow=project.execution_flow,
        workflow_mode=project.workflow_mode,
        target_dialect=project.target_dialect,
        collaborators=collaborator_emails,
        shared_with=collaborator_ids,
    )
    result = await db["projects"].insert_one(new_project.model_dump(by_alias=True, exclude={"id"}))
    created = await db["projects"].find_one({"_id": result.inserted_id})
    await record_audit_event(db, user_id=str(current_user.id), action="project.created", resource_type="project", resource_id=str(result.inserted_id), project_id=str(result.inserted_id), payload={"workflow_mode": project.workflow_mode})
    return _to_response(created)

async def _resolve_collaborators(collaborators: list[str], owner_email: str, db):
    collaborator_ids: list[str] = []
    collaborator_emails: list[str] = []
    for raw_email in collaborators or []:
        email = raw_email.strip().lower()
        if not email or email == owner_email:
            continue
        member = await db["users"].find_one({"email": email})
        if not member:
            member_doc = UserModel(
                email=email,
                hashed_password=get_password_hash("changeme"),
                full_name=email.split("@")[0].replace(".", " ").replace("_", " ").title(),
            )
            result = await db["users"].insert_one(member_doc.model_dump(by_alias=True, exclude={"id"}))
            member = await db["users"].find_one({"_id": result.inserted_id})
        collaborator_ids.append(str(member["_id"]))
        collaborator_emails.append(email)
    return list(dict.fromkeys(collaborator_ids)), list(dict.fromkeys(collaborator_emails))

@router.get("/", response_model=List[ProjectResponse])
async def list_projects(current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    cursor = db["projects"].find({"$or": [{"owner_id": user_id}, {"shared_with": user_id}]})
    projects = await cursor.to_list(length=200)
    return [_to_response(p) for p in projects]

@router.get("/grouped")
async def list_grouped_projects(current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    cursor = db["projects"].find({"$or": [{"owner_id": user_id}, {"shared_with": user_id}]}).sort("updated_at", -1)
    projects = await cursor.to_list(length=500)
    owned = [_project_card(p, user_id) for p in projects if p.get("owner_id") == user_id]
    collaborated = [_project_card(p, user_id) for p in projects if p.get("owner_id") != user_id]
    return {
        "owned_projects": owned,
        "collaborator_projects": collaborated,
        "counts": {
            "owned": len(owned),
            "collaborator": len(collaborated),
            "total": len(owned) + len(collaborated),
        },
    }

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    project = await db["projects"].find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    user_id = str(current_user.id)
    if project["owner_id"] != user_id and user_id not in project.get("shared_with", []):
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return _to_response(project)

@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project_update: ProjectUpdate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    project = await db["projects"].find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    user_id = str(current_user.id)
    if project["owner_id"] != user_id and user_id not in project.get("shared_with", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = project_update.model_dump(exclude_unset=True)
    if "collaborators" in update_data:
        collaborator_ids, collaborator_emails = await _resolve_collaborators(update_data["collaborators"], current_user.email, db)
        update_data["collaborators"] = collaborator_emails
        update_data["shared_with"] = collaborator_ids
    update_data["updated_at"] = datetime.utcnow()
    if "canvas_state" in update_data and project.get("canvas_state"):
        history_entry = ProjectHistoryEntry(state=project["canvas_state"], saved_by=user_id)
        await db["projects"].update_one({"_id": oid}, {"$push": {"history": history_entry.model_dump()}})
    await db["projects"].update_one({"_id": oid}, {"$set": update_data})
    updated = await db["projects"].find_one({"_id": oid})
    await record_audit_event(db, user_id=user_id, action="project.updated", resource_type="project", resource_id=project_id, project_id=project_id, payload={"fields": list(update_data.keys())})
    return _to_response(updated)

@router.post("/{project_id}/team-members", response_model=ProjectResponse)
async def add_team_member(project_id: str, payload: ProjectTeamMemberUpdate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    project = await db["projects"].find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["owner_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the project owner can manage team members")
    member = await db["users"].find_one({"email": payload.email})
    if not member:
        member_doc = UserModel(
            email=payload.email.strip().lower(),
            hashed_password=get_password_hash("changeme"),
            full_name=payload.email.split("@")[0].replace(".", " ").replace("_", " ").title(),
        )
        result = await db["users"].insert_one(member_doc.model_dump(by_alias=True, exclude={"id"}))
        member = await db["users"].find_one({"_id": result.inserted_id})
    member_id = str(member["_id"])
    if member_id == str(current_user.id):
        raise HTTPException(status_code=400, detail="Project owner is already a member")
    await db["projects"].update_one(
        {"_id": oid},
        {"$addToSet": {"shared_with": member_id, "collaborators": payload.email.strip().lower()}, "$set": {"updated_at": datetime.utcnow()}},
    )
    updated = await db["projects"].find_one({"_id": oid})
    await record_audit_event(db, user_id=str(current_user.id), action="project.member_added", resource_type="project", resource_id=project_id, project_id=project_id, payload={"member_id": member_id})
    return _to_response(updated)

@router.delete("/{project_id}/team-members/{member_id}", response_model=ProjectResponse)
async def remove_team_member(project_id: str, member_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    project = await db["projects"].find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["owner_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the project owner can manage team members")
    await db["projects"].update_one(
        {"_id": oid},
        {"$pull": {"shared_with": member_id}, "$set": {"updated_at": datetime.utcnow()}},
    )
    updated = await db["projects"].find_one({"_id": oid})
    await record_audit_event(db, user_id=str(current_user.id), action="project.member_removed", resource_type="project", resource_id=project_id, project_id=project_id, payload={"member_id": member_id})
    return _to_response(updated)

@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    project = await db["projects"].find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["owner_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the project owner can delete it")
    await db["projects"].delete_one({"_id": oid})
    await record_audit_event(db, user_id=str(current_user.id), action="project.deleted", resource_type="project", resource_id=project_id, project_id=project_id)

@router.post("/{project_id}/export/{export_format}")
async def export_project_artifacts(project_id: str, export_format: str, req: ArtifactExportRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    await _get_authorized_project(project_id, str(current_user.id), db)
    fmt = export_format.lower()
    markdown = _artifact_markdown(req)
    if fmt == "md":
        data = markdown.encode("utf-8")
        media_type = "text/markdown"
    elif fmt == "pdf":
        data = _pdf_bytes(markdown)
        media_type = "application/pdf"
    elif fmt == "docx":
        data = _docx_bytes(markdown)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        raise HTTPException(status_code=400, detail="Supported export formats: pdf, docx, md")
    filename = f"{req.project_name.replace(' ', '_')}_{req.chat_title.replace(' ', '_')}.{fmt}"
    return StreamingResponse(io.BytesIO(data), media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})

@router.post("/{project_id}/knowledge-graph")
async def push_project_knowledge_graph(project_id: str, req: KnowledgeGraphPushRequest, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    oid, _ = await _get_authorized_project(project_id, str(current_user.id), db)
    payload = req.payload or {}
    nodes = [
        {"type": "domain", "key": req.domain, "label": req.domain},
        {"type": "sub_domain", "key": req.sub_domain or req.domain, "label": req.sub_domain or req.domain},
    ]
    edges = [{"source": req.domain, "target": req.sub_domain or req.domain, "type": "HAS_SUB_DOMAIN"}]
    for collection_key, node_type in [
        ("concepts", "concept"),
        ("logicalEntities", "logical_entity"),
        ("physicalTables", "physical_table"),
        ("sourceTables", "source_table"),
    ]:
        for item in payload.get(collection_key, []):
            key = item.get("id") or item.get("name") or item.get("tableName") or item.get("table_name")
            label = item.get("name") or item.get("tableName") or key
            if key:
                nodes.append({"type": node_type, "key": str(key), "label": str(label), "properties": item})
                edges.append({"source": req.sub_domain or req.domain, "target": str(key), "type": "CONTAINS"})
    doc = {
        "project_id": str(oid),
        "chat_id": req.chat_id,
        "domain": req.domain,
        "sub_domain": req.sub_domain,
        "nodes": nodes,
        "edges": edges,
        "created_by": str(current_user.id),
        "created_at": datetime.utcnow(),
    }
    result = await db["knowledge_graph_runs"].insert_one(doc)
    await record_audit_event(db, user_id=str(current_user.id), action="knowledge_graph.push_requested", resource_type="knowledge_graph_run", resource_id=str(result.inserted_id), project_id=project_id, payload={"nodes": len(nodes), "edges": len(edges)})
    return {"id": str(result.inserted_id), "nodes": len(nodes), "edges": len(edges)}

@router.post("/{project_id}/files", response_model=List[ProjectFileResponse])
async def upload_project_files(
    project_id: str,
    category: str = Form(...),
    files: List[UploadFile] = File(...),
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db),
):
    oid, _ = await _get_authorized_project(project_id, str(current_user.id), db)
    saved = []
    for upload in files:
        raw = await upload.read()
        parser, parsed_preview = _parse_uploaded_file(upload.filename or "", upload.content_type or "", raw)
        project_dir = LOCAL_UPLOAD_ROOT / str(oid)
        project_dir.mkdir(parents=True, exist_ok=True)
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", upload.filename or "uploaded-file")
        stored_path = project_dir / safe_name
        stored_path.write_bytes(raw)
        doc = {
            "project_id": str(oid),
            "category": category,
            "filename": upload.filename,
            "content_type": upload.content_type or "application/octet-stream",
            "size": len(raw),
            "storage_path": str(stored_path),
            "parser": parser,
            "parsed_preview": parsed_preview,
            "uploaded_by": str(current_user.id),
            "uploaded_at": datetime.utcnow(),
        }
        result = await db["project_files"].insert_one(doc)
        saved.append(ProjectFileResponse(
            id=str(result.inserted_id),
            project_id=str(oid),
            category=category,
            filename=upload.filename or "uploaded-file",
            content_type=doc["content_type"],
            size=doc["size"],
            uploaded_at=doc["uploaded_at"],
            parser=parser,
            parsed_preview=parsed_preview,
        ))
        await record_audit_event(db, user_id=str(current_user.id), action="project_file.uploaded", resource_type="project_file", resource_id=str(result.inserted_id), project_id=str(oid), payload={"category": category, "filename": upload.filename, "parser": parser})
    return saved
