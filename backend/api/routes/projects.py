from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
import io
import json
import zipfile
from bson import ObjectId
from database import get_db
from models.project import ProjectModel, ProjectCreate, ProjectUpdate, ProjectResponse, ProjectHistoryEntry, ProjectTeamMemberUpdate
from models.user import UserModel
from api.routes.auth import get_current_user

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

def _to_response(p: dict) -> ProjectResponse:
    p = dict(p)
    p["id"] = str(p.pop("_id"))
    return ProjectResponse(**p)

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
    new_project = ProjectModel(name=project.name, description=project.description, owner_id=str(current_user.id))
    result = await db["projects"].insert_one(new_project.model_dump(by_alias=True, exclude={"id"}))
    created = await db["projects"].find_one({"_id": result.inserted_id})
    return _to_response(created)

@router.get("/", response_model=List[ProjectResponse])
async def list_projects(current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    cursor = db["projects"].find({"$or": [{"owner_id": user_id}, {"shared_with": user_id}]})
    projects = await cursor.to_list(length=200)
    return [_to_response(p) for p in projects]

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
    update_data["updated_at"] = datetime.utcnow()
    if "canvas_state" in update_data and project.get("canvas_state"):
        history_entry = ProjectHistoryEntry(state=project["canvas_state"], saved_by=user_id)
        await db["projects"].update_one({"_id": oid}, {"$push": {"history": history_entry.model_dump()}})
    await db["projects"].update_one({"_id": oid}, {"$set": update_data})
    updated = await db["projects"].find_one({"_id": oid})
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
        raise HTTPException(status_code=404, detail="No registered user found for that email")
    member_id = str(member["_id"])
    if member_id == str(current_user.id):
        raise HTTPException(status_code=400, detail="Project owner is already a member")
    await db["projects"].update_one(
        {"_id": oid},
        {"$addToSet": {"shared_with": member_id}, "$set": {"updated_at": datetime.utcnow()}},
    )
    updated = await db["projects"].find_one({"_id": oid})
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
        doc = {
            "project_id": str(oid),
            "category": category,
            "filename": upload.filename,
            "content_type": upload.content_type or "application/octet-stream",
            "size": len(raw),
            "content": raw.decode("utf-8", errors="replace"),
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
        ))
    return saved
