from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime
from bson import ObjectId
from db.core import get_db
from models.chat import ChatModel, ChatCreate, ChatUpdate, ChatResponse
from models.user import UserModel
from api.routes.auth import get_current_user
from core.serialization import mongo_json

router = APIRouter()

def _to_response(c: dict) -> ChatResponse:
    c = mongo_json(dict(c))
    c["id"] = str(c.pop("_id"))
    return ChatResponse(**c)

async def _get_authorized_project(project_id: str, user_id: str, db):
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    project = await db["projects"].find_one({"_id": oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    is_owner = project.get("user_id") == user_id
    is_member = any(m.get("user_id") == user_id for m in project.get("members", []))
    if not is_owner and not is_member:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return oid, project

@router.post("/{project_id}/chats", response_model=ChatResponse, status_code=201)
async def create_chat(project_id: str, chat: ChatCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    # Ensure they have access to project
    await _get_authorized_project(project_id, user_id, db)
    
    new_chat = ChatModel(
        chat_id=chat.chat_id,
        user_id=user_id,
        project_id=project_id,
        title=chat.title,
        metadata=chat.metadata or {}
    )
    result = await db["chats"].insert_one(new_chat.model_dump(by_alias=True, exclude={"id"}))
    created = await db["chats"].find_one({"_id": result.inserted_id})
    return _to_response(created)

@router.get("/{project_id}/chats", response_model=List[ChatResponse])
async def list_chats(project_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    await _get_authorized_project(project_id, user_id, db)
    
    cursor = db["chats"].find({"project_id": project_id})
    chats = await cursor.to_list(length=200)
    return [_to_response(c) for c in chats]

@router.get("/{project_id}/chats/{chat_id}", response_model=ChatResponse)
async def get_chat(project_id: str, chat_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    await _get_authorized_project(project_id, user_id, db)
    
    chat = await db["chats"].find_one({"chat_id": chat_id, "project_id": project_id})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return _to_response(chat)

@router.put("/{project_id}/chats/{chat_id}", response_model=ChatResponse)
async def update_chat(project_id: str, chat_id: str, chat_update: ChatUpdate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    await _get_authorized_project(project_id, user_id, db)
    
    chat = await db["chats"].find_one({"chat_id": chat_id, "project_id": project_id})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Only owner can update
    if chat.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Only chat owner can update")
        
    update_data = chat_update.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    
    await db["chats"].update_one({"_id": chat["_id"]}, {"$set": update_data})
    updated = await db["chats"].find_one({"_id": chat["_id"]})
    return _to_response(updated)

@router.delete("/{project_id}/chats/{chat_id}", status_code=204)
async def delete_chat(project_id: str, chat_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    await _get_authorized_project(project_id, user_id, db)
    
    chat = await db["chats"].find_one({"chat_id": chat_id, "project_id": project_id})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Only owner can delete
    if chat.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Only chat owner can delete")
        
    await db["chats"].delete_one({"_id": chat["_id"]})
