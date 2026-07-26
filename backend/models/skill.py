from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from models.user import PyObjectId

class SkillModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    description: str
    content: str                         # Markdown skill instructions
    created_by: Optional[str] = None     # None = global / built-in
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

class SkillCreate(BaseModel):
    name: str
    description: str
    content: str

class SkillResponse(BaseModel):
    id: str
    name: str
    description: str
    content: str
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
