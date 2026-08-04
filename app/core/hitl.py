"""
The Canonical/3NF first-cut HITL gate table from TDS §5, verbatim, as code.
This is the single source of truth the planner and TaskWorker consult —
nothing infers a HITL mode; it's always looked up here.
"""
from app.models.schemas import ADM_HitlMode

ADM_HITL_GATE_TABLE: dict[str, dict] = {
    "discover_relationships": {
        "stage": 1, "mode": ADM_HitlMode.mandatory,
        "reason": "Identity resolution must never silently auto-merge",
    },
    "classify_sensitivity": {
        "stage": 1, "mode": ADM_HitlMode.confidence_gated,
        "reason": "Correctable, not catastrophic",
    },
    "profile_source": {
        "stage": 1, "mode": ADM_HitlMode.auto,
        "reason": "Mechanical, low-risk",
    },
    "build_data_dictionary": {
        "stage": 1, "mode": ADM_HitlMode.auto,
        "reason": "Mechanical, low-risk",
    },
    "cluster_subject_areas": {
        "stage": 1, "mode": ADM_HitlMode.auto,
        "reason": "Mechanical, low-risk",
    },
    "generate_conceptual_entities": {
        "stage": 2, "mode": ADM_HitlMode.auto,
        "reason": "Reviewed implicitly at Stage 3",
    },
    "generate_conceptual_relationships": {
        "stage": 2, "mode": ADM_HitlMode.confidence_gated,
        "reason": "Judgment call, correctable downstream",
    },
    "classify_entity_role": {
        "stage": 3, "mode": ADM_HitlMode.confidence_gated,
        "reason": "Correctable",
    },
    "derive_keys": {
        "stage": 3, "mode": ADM_HitlMode.mandatory,
        "reason": "Irreversible downstream impact",
    },
    "resolve_relationships": {
        "stage": 3, "mode": ADM_HitlMode.auto,
        "reason": "Mechanical once keys are set",
    },
    "generate_ddl": {
        "stage": 4, "mode": ADM_HitlMode.mandatory,
        "reason": "Final structural output",
    },
    "generate_sttm": {
        "stage": 4, "mode": ADM_HitlMode.confidence_gated,
        "reason": "Documentation artifact",
    },
}

# 3NF has no historization/SCD step (confirmed against the golden test kit, TDS §5 footnote).
ADM_STAGE_ORDER = [1, 2, 3, 4]


def ADM_get_hitl_for_skill(skill_id: str) -> dict:
    return ADM_HITL_GATE_TABLE.get(
        skill_id,
        {"stage": None, "mode": ADM_HitlMode.confidence_gated, "reason": "Default: no table entry"},
    )


def ADM_confidence_gate_passes(confidence: float, threshold: float = 0.8) -> bool:
    """A confidence_gated task auto-approves above threshold; else escalates like mandatory."""
    return confidence >= threshold