from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from models.user import PyObjectId

class AgentModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    description: str
    agent_type: str = "local"           # local | remote
    remote_uri: Optional[str] = None    # A2A remote endpoint
    default_skills: List[str] = []
    framework: str = "langgraph"
    system_prompt: str = ""
    model_name: str = "gpt-4o"
    tools: List[str] = []
    tags: List[str] = []
    template_id: Optional[str] = None
    hitl_enabled: bool = False
    a2a_enabled: bool = False
    is_system: bool = False
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True, "protected_namespaces": ()}

class AgentCreate(BaseModel):
    name: str
    description: str
    agent_type: str = "local"
    remote_uri: Optional[str] = None
    default_skills: List[str] = []
    framework: str = "langgraph"
    system_prompt: str = ""
    model_name: str = "gpt-4o"
    tools: List[str] = []
    tags: List[str] = []
    template_id: Optional[str] = None
    hitl_enabled: bool = False
    a2a_enabled: bool = False

    model_config = {"protected_namespaces": ()}

class AgentResponse(BaseModel):
    id: str
    name: str
    description: str
    agent_type: str
    remote_uri: Optional[str] = None
    default_skills: List[str] = []
    framework: str = "langgraph"
    system_prompt: str = ""
    model_name: str = "gpt-4o"
    tools: List[str] = []
    tags: List[str] = []
    template_id: Optional[str] = None
    hitl_enabled: bool = False
    a2a_enabled: bool = False
    is_system: bool = False
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"protected_namespaces": ()}
