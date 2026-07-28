from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from models.user import PyObjectId

class ChatMessage(BaseModel):
    role: str # "user" or "agent"
    content: str
    metadata: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ChatModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    chat_id: str
    user_id: str
    project_id: str
    title: str
    metadata: Dict[str, Any] = {}
    
    messages: List[ChatMessage] = []
    artifacts: List[Dict[str, Any]] = []

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

class ChatCreate(BaseModel):
    chat_id: str
    title: str
    metadata: Optional[Dict[str, Any]] = {}

class ChatUpdate(BaseModel):
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    id: str
    chat_id: str
    user_id: str
    project_id: str
    title: str
    metadata: Dict[str, Any] = {}
    messages: List[ChatMessage] = []
    artifacts: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime
