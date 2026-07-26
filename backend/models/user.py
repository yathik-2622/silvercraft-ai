from pydantic import BaseModel, Field, EmailStr, BeforeValidator
from typing import Optional, List, Annotated
from datetime import datetime
from bson import ObjectId

# Helper for Pydantic to handle MongoDB ObjectIds safely in v2
PyObjectId = Annotated[str, BeforeValidator(str)]

class UserModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    email: EmailStr
    hashed_password: str
    full_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str

class Token(BaseModel):
    access_token: str
    token_type: str
