"""
Unit tests for ADM__require_provider_key (app/core/runtime_settings.py) and
its wiring into ADM__format_llm_error (app/celery_app/tasks.py).

Real bug this covers: a batch of user_settings documents saved before the
SETTINGS_ENCRYPTION_KEY was regenerated no longer decrypt (Fernet silently
returns "" on a bad token — see ADM_decrypt_secret) — confirmed live by
attempting to decrypt every stored provider key in the dev database: 17 of
18 documents failed. Every one of those users' next non-gateway BYOK chat
message would previously fail with an opaque "HTTP 401" that looks
identical to "your key is wrong", even though (from their side) nothing
about their saved key had changed. ADM__require_provider_key turns that
into an early, actionable error instead. Run with: pytest
"""
import pytest

from app.core.runtime_settings import ADM__require_provider_key, ADM_MissingProviderKeyError
from app.celery_app.tasks import ADM__format_llm_error


def _runtime(provider: str, api_key: str, label: str | None = None) -> dict:
    return {"provider": provider, "provider_label": label or provider, "api_key": api_key, "base_url": "", "default_model": "x"}


def test_raises_for_openrouter_with_no_key():
    with pytest.raises(ADM_MissingProviderKeyError):
        ADM__require_provider_key(_runtime("openrouter", "", "OpenRouter"))


def test_raises_for_groq_with_no_key():
    with pytest.raises(ADM_MissingProviderKeyError):
        ADM__require_provider_key(_runtime("groq", "", "Groq"))


def test_raises_for_nvidia_with_no_key():
    with pytest.raises(ADM_MissingProviderKeyError):
        ADM__require_provider_key(_runtime("nvidia", "", "NVIDIA"))


def test_does_not_raise_when_a_key_is_present():
    ADM__require_provider_key(_runtime("openrouter", "sk-real-key", "OpenRouter"))  # no raise


def test_does_not_raise_for_gateway_even_with_no_key():
    # "gateway" never reads user-configured state at all (see
    # ADM__provider_api_key) — an empty key here would mean the platform's
    # own LLM_API_KEY is unset, a deployment config issue, not a per-user one.
    ADM__require_provider_key(_runtime("gateway", ""))


def test_does_not_raise_for_custom_even_with_no_user_key():
    # "custom" always falls back to the platform key (see
    # ADM__provider_api_key) — it can never actually reach this function
    # with an empty api_key, but confirm the guard doesn't wrongly fire if
    # it somehow did.
    ADM__require_provider_key(_runtime("custom", "sk-platform-fallback"))


def test_error_message_names_the_provider_and_tells_user_what_to_do():
    with pytest.raises(ADM_MissingProviderKeyError) as exc_info:
        ADM__require_provider_key(_runtime("groq", "", "Groq"))
    message = str(exc_info.value)
    assert "Groq" in message
    assert "Settings" in message


def test_format_llm_error_surfaces_the_missing_key_message_verbatim():
    try:
        ADM__require_provider_key(_runtime("nvidia", "", "NVIDIA"))
    except ADM_MissingProviderKeyError as exc:
        formatted = ADM__format_llm_error(exc)
        assert formatted == str(exc)
        assert "NVIDIA" in formatted
    else:
        pytest.fail("expected ADM_MissingProviderKeyError")


def test_format_llm_error_still_handles_a_real_provider_status_code():
    class FakeApiError(Exception):
        status_code = 401

    formatted = ADM__format_llm_error(FakeApiError("unauthorized"))
    assert "HTTP 401" in formatted
    assert "Settings" in formatted
