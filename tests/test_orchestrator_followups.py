"""
Unit tests for follow-up-question parsing. Run with: pytest

No live LLM call needed — ADM_parse_follow_up_questions is a pure function
over whatever ADM_chat_completion_json_for_user happened to return.
"""
from app.graphs.orchestrator_graph import ADM_parse_follow_up_questions


def test_extracts_list_of_strings():
    result = {"questions": ["What is 3NF?", "How do I add a skill?"]}
    assert ADM_parse_follow_up_questions(result) == ["What is 3NF?", "How do I add a skill?"]


def test_caps_at_four():
    result = {"questions": [f"Q{i}" for i in range(10)]}
    assert ADM_parse_follow_up_questions(result) == ["Q0", "Q1", "Q2", "Q3"]


def test_drops_non_string_entries():
    result = {"questions": ["Real question", 42, None, {"nested": "object"}, "Another real one"]}
    assert ADM_parse_follow_up_questions(result) == ["Real question", "Another real one"]


def test_missing_questions_key_returns_empty():
    assert ADM_parse_follow_up_questions({}) == []


def test_questions_not_a_list_returns_empty():
    assert ADM_parse_follow_up_questions({"questions": "not a list"}) == []


def test_non_dict_input_returns_empty():
    assert ADM_parse_follow_up_questions([]) == []  # type: ignore[arg-type]
    assert ADM_parse_follow_up_questions(None) == []  # type: ignore[arg-type]


def test_empty_list_returns_empty():
    assert ADM_parse_follow_up_questions({"questions": []}) == []
