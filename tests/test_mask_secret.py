"""
Unit tests for app/core/runtime_settings.py::ADM__mask_secret — fixed to
always produce a bounded-length mask regardless of the raw key's length
(a long provider key previously produced a mask whose asterisk run scaled
1:1 with key length, overflowing the Settings page's card width — visible
live as a stray line of dots stretching the whole card). Run with: pytest
"""
from app.core.runtime_settings import ADM__mask_secret


def test_empty_value_masks_to_empty_string():
    assert ADM__mask_secret("") == ""


def test_short_value_masks_to_all_dots_same_length():
    assert ADM__mask_secret("abcd1234") == "•" * 8


def test_long_value_masks_to_fixed_width_regardless_of_length():
    short_key = "sk-" + "a" * 20
    long_key = "sk-" + "a" * 300  # a real-world long provider key
    masked_short = ADM__mask_secret(short_key)
    masked_long = ADM__mask_secret(long_key)
    assert len(masked_short) == len(masked_long)
    assert masked_short == f"{short_key[:4]}{'•' * 6}{short_key[-4:]}"
    assert masked_long == f"{long_key[:4]}{'•' * 6}{long_key[-4:]}"
    # The whole point of the fix: no mask should ever scale with key length.
    assert len(masked_long) < 20


def test_masked_value_never_contains_the_raw_middle_of_the_key():
    key = "sk-supersecretmiddlepart-abcd"
    masked = ADM__mask_secret(key)
    assert "supersecretmiddlepart" not in masked
