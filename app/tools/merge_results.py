"""
merge_results — Utility Skill / native tool, TDS §5 row 6e. Merges
partitioned TaskWorker outputs (from LangGraph `Send` fan-out) back into
one task result before HITL review.
"""
from typing import Any


def ADM_merge_task_partitions(partitions: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Each partition = {"output": {...}, "confidence": float}. Merge outputs
    (dict-union, list concat for known list fields) and take the min
    confidence across partitions (conservative — a weak partition should
    pull the merged confidence down, not get diluted by strong ones).
    """
    if not partitions:
        return {"output": {}, "confidence": 0.0}
    if len(partitions) == 1:
        return partitions[0]

    merged_output: dict[str, Any] = {}
    for part in partitions:
        for k, v in part.get("output", {}).items():
            if k not in merged_output:
                merged_output[k] = v
            elif isinstance(v, list) and isinstance(merged_output[k], list):
                merged_output[k] = merged_output[k] + v
            elif isinstance(v, dict) and isinstance(merged_output[k], dict):
                merged_output[k] = {**merged_output[k], **v}
            # scalar collision: keep first-seen, don't silently overwrite

    confidences = [p.get("confidence", 1.0) for p in partitions]
    return {"output": merged_output, "confidence": min(confidences)}