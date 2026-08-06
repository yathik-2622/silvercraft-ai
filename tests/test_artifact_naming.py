"""
Unit tests for app/core/artifact_naming.py — the Phase 7 human-readable
filename convention for local_blob_storage (replaces bare
f"{contract_id}.sql"). Run with: pytest

Pure functions, no DB/LLM call needed.
"""
from app.core.artifact_naming import ADM_build_artifact_filename, ADM_slugify


def test_slugify_lowercases_and_replaces_non_alnum():
    assert ADM_slugify("Retail & E-Commerce!") == "retail_e_commerce"


def test_slugify_collapses_repeated_separators():
    assert ADM_slugify("a   b---c") == "a_b_c"


def test_slugify_strips_leading_trailing_separators():
    assert ADM_slugify("__weird__name__") == "weird_name"


def test_slugify_truncates_long_input():
    long_name = "a" * 100
    result = ADM_slugify(long_name, max_len=40)
    assert len(result) <= 40


def test_slugify_empty_or_none_like_input_never_raises():
    assert ADM_slugify("") == "untitled"
    assert ADM_slugify("   ") == "untitled"
    assert ADM_slugify("!!!") == "untitled"


def test_slugify_handles_emoji_and_special_characters_safely():
    result = ADM_slugify("Project 🚀 Alpha™")
    assert result  # never empty
    assert all(c.isalnum() or c == "_" for c in result)


def test_build_artifact_filename_basic_shape():
    name = ADM_build_artifact_filename("jane_doe", "Retail Lakehouse", "Canonical Model Chat", "ddl", "sql")
    assert name == "jane_doe_retail_lakehouse_canonical_model_chat_ddl.sql"


def test_build_artifact_filename_strips_leading_dot_from_extension():
    name = ADM_build_artifact_filename("u", "p", "c", "ddl", ".sql")
    assert name.endswith(".sql")
    assert not name.endswith("..sql")


def test_same_inputs_produce_the_same_filename():
    a = ADM_build_artifact_filename("jane", "Retail", "Chat One", "ddl", "sql")
    b = ADM_build_artifact_filename("jane", "Retail", "Chat One", "ddl", "sql")
    assert a == b


def test_different_project_or_chat_produces_a_different_filename():
    a = ADM_build_artifact_filename("jane", "Retail", "Chat One", "ddl", "sql")
    b = ADM_build_artifact_filename("jane", "Retail", "Chat Two", "ddl", "sql")
    assert a != b


def test_disambiguator_only_applied_when_supplied():
    without = ADM_build_artifact_filename("jane", "Retail", "Chat", "ddl", "sql")
    with_dis = ADM_build_artifact_filename("jane", "Retail", "Chat", "ddl", "sql", disambiguator="a1b2c3")
    assert without != with_dis
    assert with_dis.startswith(without.replace(".sql", ""))
    assert "a1b2c3" in with_dis


def test_two_contracts_with_identical_project_chat_type_get_different_names_via_disambiguator():
    """Real collision scenario: two different contracts for the same
    owner/project/chat/artifact_type combination must not silently
    overwrite each other on disk — the caller detects the collision and
    supplies a disambiguator (see ADM_generate_provenance_and_artifacts)."""
    first = ADM_build_artifact_filename("jane", "Retail", "Onboarding Chat", "ddl", "sql")
    second = ADM_build_artifact_filename("jane", "Retail", "Onboarding Chat", "ddl", "sql", disambiguator="04be0f")
    assert first != second


def test_very_long_names_truncate_sensibly_and_stay_readable():
    name = ADM_build_artifact_filename(
        "a_very_long_username_that_goes_on_and_on",
        "An Extremely Long Project Name That Nobody Would Actually Type",
        "An Equally Long Chat Title Describing The Entire Modeling Session In Detail",
        "ddl", "sql",
    )
    assert len(name) < 200  # filesystem-friendly, not a wall of text
    assert name.endswith(".sql")
