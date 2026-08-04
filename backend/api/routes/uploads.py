from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from typing import List, Any
from datetime import datetime
import io
import logging
import pandas as pd
from db.core import get_db
from models.user import UserModel
from api.routes.auth import get_current_user
from langchain_community.document_loaders import PyPDFLoader
import pdfplumber
import tempfile
import os

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {'.csv', '.json', '.pdf', '.docx', '.doc', '.txt', '.md', '.py', '.xlsx', '.xls', '.tsv'}
SUPPORTED_CONTENT_TYPES = {'text/csv', 'application/json', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'application/octet-stream', 'text/markdown', 'text/x-python', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'}

router = APIRouter()

@router.post("/")
async def upload_files(
    project_id: str = Form(...),
    chat_id: str = Form(...),
    files: List[UploadFile] = File(...),
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db)
):
    user_id = str(current_user.id)
    chunks_to_store = []

    logger.info("[upload] project_id=%s chat_id=%s user=%s files=%d", project_id, chat_id, user_id, len(files))

    for upload in files:
        filename = upload.filename or "unknown"
        ext = "." + filename.split(".")[-1].lower() if "." in filename else ""
        content_type = upload.content_type or "application/octet-stream"

        if ext not in SUPPORTED_EXTENSIONS and content_type not in SUPPORTED_CONTENT_TYPES:
            logger.warning("[upload] project_id=%s rejected unsupported file=%s ext=%s content_type=%s", project_id, filename, ext, content_type)
            continue

        raw_bytes = await upload.read()
        logger.info("[upload] project_id=%s parsing file=%s size=%d", project_id, filename, len(raw_bytes))

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name

        try:
            if ext == ".pdf":
                loader = PyPDFLoader(tmp_path)
                docs = loader.load()
                for i, doc in enumerate(docs):
                    chunks_to_store.append({
                        "project_id": project_id,
                        "chat_id": chat_id,
                        "user_id": user_id,
                        "filename": filename,
                        "type": "text",
                        "content": doc.page_content,
                        "metadata": doc.metadata,
                        "uploaded_at": datetime.utcnow()
                    })

                with pdfplumber.open(tmp_path) as pdf:
                    for i, page in enumerate(pdf.pages):
                        tables = page.extract_tables()
                        for j, table in enumerate(tables):
                            chunks_to_store.append({
                                "project_id": project_id,
                                "chat_id": chat_id,
                                "user_id": user_id,
                                "filename": filename,
                                "type": "table",
                                "content": str(table),
                                "metadata": {"page": i, "table_index": j},
                                "uploaded_at": datetime.utcnow()
                            })

            elif ext in [".csv", ".xls", ".xlsx"]:
                if ext == ".csv":
                    df = pd.read_csv(io.BytesIO(raw_bytes))
                else:
                    df = pd.read_excel(io.BytesIO(raw_bytes))

                chunks_to_store.append({
                    "project_id": project_id,
                    "chat_id": chat_id,
                    "user_id": user_id,
                    "filename": filename,
                    "type": "dataframe",
                    "content": df.to_json(orient="records"),
                    "metadata": {"columns": list(df.columns)},
                    "uploaded_at": datetime.utcnow()
                })
            else:
                chunks_to_store.append({
                    "project_id": project_id,
                    "chat_id": chat_id,
                    "user_id": user_id,
                    "filename": filename,
                    "type": "text",
                    "content": raw_bytes.decode('utf-8', errors='ignore'),
                    "metadata": {},
                    "uploaded_at": datetime.utcnow()
                })
        finally:
            os.remove(tmp_path)

    if chunks_to_store:
        await db["file_chunks"].insert_many(chunks_to_store)
        await db["chats"].update_one(
            {"chat_id": chat_id, "project_id": project_id},
            {"$push": {"artifacts": {"$each": [{"filename": f.filename, "type": f.content_type} for f in files]}}}
        )
        logger.info("[upload] project_id=%s stored %d chunks", project_id, len(chunks_to_store))

    return {"message": f"Successfully parsed and stored {len(chunks_to_store)} chunks."}
