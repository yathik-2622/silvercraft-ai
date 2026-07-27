from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from models.user import PyObjectId

class CanvasState(BaseModel):
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    viewport: Dict[str, Any] = {"x": 0, "y": 0, "zoom": 1}

class ProjectHistoryEntry(BaseModel):
    state: CanvasState
    saved_at: datetime = Field(default_factory=datetime.utcnow)
    saved_by: str

class ProjectModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    name: str
    description: Optional[str] = None
    owner_id: str
    shared_with: List[str] = []
    canvas_state: CanvasState = Field(default_factory=CanvasState)

    # Project configuration
    domain: str = ""
    sub_domain: str = ""
    layer: str = "foundation"
    execution_flow: str = "custom"
    workflow_mode: str = "orchestrator"
    collaborators: List[str] = []
    source_connects: Dict[str, Any] = {}
    naming_rules: str = "snake_case"
    llm_provider: str = "gemini"
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None

    history: List[ProjectHistoryEntry] = []
    ui_preferences: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    domain: str = ""
    sub_domain: str = ""
    layer: str = "foundation"
    execution_flow: str = "custom"
    workflow_mode: str = "orchestrator"
    collaborators: List[str] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    domain: Optional[str] = None
    sub_domain: Optional[str] = None
    layer: Optional[str] = None
    execution_flow: Optional[str] = None
    workflow_mode: Optional[str] = None
    collaborators: Optional[List[str]] = None
    canvas_state: Optional[CanvasState] = None
    source_connects: Optional[Dict[str, Any]] = None
    naming_rules: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    ui_preferences: Optional[Dict[str, Any]] = None

class ProjectTeamMemberUpdate(BaseModel):
    email: str

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    shared_with: List[str] = []
    canvas_state: CanvasState = Field(default_factory=CanvasState)
    domain: str = ""
    sub_domain: str = ""
    layer: str = "foundation"
    execution_flow: str = "custom"
    workflow_mode: str = "orchestrator"
    collaborators: List[str] = []
    source_connects: Dict[str, Any] = {}
    naming_rules: str = "snake_case"
    llm_provider: str = "gemini"
    llm_base_url: Optional[str] = None
    ui_preferences: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime
