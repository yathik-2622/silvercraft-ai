from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime
from models.user import PyObjectId

class WorkflowStep(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    order: int
    skills: List[str] = []
    custom_prompt: Optional[str] = None
    a2a_enabled: bool = False
    remote_uri: Optional[str] = None

class WorkflowModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    project_id: str
    name: str
    workflow_type: str = "default"       # default | diy | orchestrator
    description: str = ""
    steps: List[WorkflowStep] = []
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    input_config: Dict[str, Any] = {}
    orchestrator_state: Dict[str, Any] = {}
    status: str = "draft"
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

class WorkflowCreate(BaseModel):
    project_id: str
    name: str
    workflow_type: str = "default"
    description: str = ""
    steps: List[WorkflowStep] = []
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    input_config: Dict[str, Any] = {}
    orchestrator_state: Dict[str, Any] = {}
    status: str = "draft"
    created_by: Optional[str] = None

class WorkflowResponse(BaseModel):
    id: str
    project_id: str
    name: str
    workflow_type: str
    description: str = ""
    steps: List[WorkflowStep] = []
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    input_config: Dict[str, Any] = {}
    orchestrator_state: Dict[str, Any] = {}
    status: str = "draft"
    created_by: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
