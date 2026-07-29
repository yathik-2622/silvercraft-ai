"""
Typed ProjectContext — output of IntakeAgent, consumed by all stage-owner agents.
Per ADM_2.0_BUILD_SPEC.md §3.1.

This is the central "task pointer" that flows through the pipeline — agents fetch
their own data via query_mongo using refs from this context.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


SourceType = Literal["file", "db"]
ModelingStyle = Literal["kimball", "data_vault", "3nf", "one_big_table"]
WorkflowMode = Literal["default", "custom"]


class SourceRef(BaseModel):
    """What the SourceIntelligenceAgent will read."""
    source_type: SourceType = "file"
    # File source (local filesystem)
    file_paths: List[str] = []       # e.g. ["/home/yathik/ADM_2.O/silvercraft-ai/uploads/project_id/20260729_file.csv"]
    # DB source
    connection_id: Optional[str] = None # db_connections._id
    selected_tables: List[str] = []     # empty = all tables in schema


class ProjectContext(BaseModel):
    """
    The canonical typed context flowing from IntakeAgent to all stage-owner agents.
    Per BUILD_SPEC §3.1.
    """
    # Session / tracing
    session_id: str
    project_id: str
    trace_id: str = ""

    # Source
    source_ref: SourceRef = Field(default_factory=SourceRef)

    # Project config
    existing_model_ref: Optional[str] = None   # Enterprise model to map against (Step 3.8)
    target_dialect: str = "snowflake"          # DDL output dialect
    layer: str = "foundation"                  # foundation | product

    # Skill bindings (auto-populated from project.active_skill_bindings)
    naming_convention_skill_ref: Optional[str] = None
    modeling_style_skill_ref: Optional[str] = None
    stage_skill_refs: Dict[str, List[str]] = {
        "source_analysis": [],
        "conceptual": [],
        "logical": [],
        "physical": [],
    }

    # Modeling
    modeling_style: ModelingStyle = "kimball"  # inferred by IntakeAgent from prompt
    workflow_mode: WorkflowMode = "default"

    # Optional custom pipeline DAG (workflow_mode=custom)
    custom_dag: Optional[Dict[str, Any]] = None

    # Intake metadata
    user_instruction: str = ""          # Original user prompt / instruction
    missing_inputs: List[str] = []      # Slots still unfilled (intake still running)
    intake_complete: bool = False       # True once all required slots are filled

    # Gate state refs (added as pipeline progresses)
    gate_refs: Dict[str, str] = {}     # {"G1": "gate_doc_id", ...}
