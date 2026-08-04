"""
Basic smoke tests. Run with: pytest
These only check the app wires up and pure-python tools behave — they do
not require Mongo/Redis/LLM to be running (those are exercised via the
live demo, not CI-less unit tests).
"""
from fastapi.testclient import TestClient

from app.main import app
from app.core.hitl import ADM_get_hitl_for_skill, ADM_confidence_gate_passes
from app.tools.ddl_generator import ADM_generate_create_table_ddl
from app.tools.merge_results import ADM_merge_task_partitions
from app.tools.diff_tool import ADM_dict_diff


def test_health_endpoint():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_hitl_gate_table_lookup():
    gate = ADM_get_hitl_for_skill("derive_keys")
    assert gate["mode"].value == "mandatory"
    assert gate["stage"] == 3


def test_hitl_gate_table_default_for_unknown_skill():
    gate = ADM_get_hitl_for_skill("not_a_real_skill")
    assert gate["stage"] is None


def test_confidence_gate_threshold():
    assert ADM_confidence_gate_passes(0.9) is True
    assert ADM_confidence_gate_passes(0.5) is False


def test_ddl_generation():
    table = {
        "table_name": "customer",
        "columns": [
            {"name": "customer_id", "dtype": "INT", "nullable": False},
            {"name": "name", "dtype": "VARCHAR(100)", "nullable": True},
        ],
        "primary_key": ["customer_id"],
        "foreign_keys": [],
    }
    ddl = ADM_generate_create_table_ddl(table)
    assert "CREATE TABLE customer" in ddl
    assert "PRIMARY KEY (customer_id)" in ddl


def test_merge_task_partitions_conservative_confidence():
    merged = ADM_merge_task_partitions([
        {"output": {"a": [1, 2]}, "confidence": 0.9},
        {"output": {"a": [3], "b": {"x": 1}}, "confidence": 0.6},
    ])
    assert merged["confidence"] == 0.6
    assert merged["output"]["a"] == [1, 2, 3]
    assert merged["output"]["b"] == {"x": 1}


def test_dict_diff():
    diff = ADM_dict_diff({"a": 1, "b": 2}, {"a": 1, "b": 3, "c": 4})
    assert diff["changed"] == {"b": {"before": 2, "after": 3}}
    assert diff["added"] == {"c": 4}
    assert diff["removed"] == {}