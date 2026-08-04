"""
profiling_stats — native tool, TDS §8 / §3.3.

Running aggregates (null count, distinct count) computed incrementally per
chunk. Distinct count falls back to an approximate algorithm above the
configured size threshold, bounding memory regardless of file size. We use
a simple bit-pattern HyperLogLog implementation (no external dependency)
so this works fully offline/local.
"""
import hashlib
import math

from app.config import ADM_get_settings
from app.core.privacy import ADM_mark_value_derived_flagged, ADM_strip_forbidden_fields


class ADM_HyperLogLog:
    """Minimal HLL for approximate distinct counts above the size threshold."""

    def __init__(self, b: int = 12):
        self.b = b
        self.m = 1 << b
        self.registers = [0] * self.m
        self.alpha = 0.7213 / (1 + 1.079 / self.m)

    def ADM_add(self, value: str) -> None:
        h = int(hashlib.sha1(value.encode("utf-8")).hexdigest(), 16)
        idx = h & (self.m - 1)
        w = h >> self.b
        rank = (w & -w).bit_length()
        self.registers[idx] = max(self.registers[idx], rank)

    def ADM_estimate(self) -> int:
        z = sum(2.0 ** -r for r in self.registers)
        raw = self.alpha * self.m * self.m / z if z else 0
        return int(raw)


def ADM_compute_running_null_pct(null_count: int, total_count: int) -> float:
    if total_count == 0:
        return 0.0
    return round(100.0 * null_count / total_count, 4)


def ADM_compute_distinct_count(values_iter, exact_threshold: int | None = None) -> tuple[int, bool]:
    """
    Streams `values_iter` once. Uses an exact set below the threshold,
    switches to HyperLogLog above it. Returns (count, is_approximate).
    """
    settings = ADM_get_settings()
    threshold = exact_threshold or settings.DISTINCT_COUNT_APPROX_THRESHOLD

    exact_set: set = set()
    hll = ADM_HyperLogLog()
    approximate = False
    seen = 0

    for v in values_iter:
        seen += 1
        key = str(v)
        if not approximate:
            exact_set.add(key)
            if len(exact_set) > threshold:
                approximate = True
                for x in exact_set:
                    hll.ADM_add(x)
                exact_set = set()
        else:
            hll.ADM_add(key)

    if approximate:
        return hll.ADM_estimate(), True
    return len(exact_set), False


def ADM_build_column_stat_summary(
    column_name: str,
    dtype: str,
    null_count: int,
    total_count: int,
    distinct_count: int,
    is_approximate: bool,
    min_value=None,
    max_value=None,
) -> dict:
    stat = {
        "column_name": column_name,
        "dtype": dtype,
        "null_pct": ADM_compute_running_null_pct(null_count, total_count),
        "distinct_count": distinct_count,
        "distinct_count_approximate": is_approximate,
    }
    if min_value is not None:
        stat["min_value"] = min_value
    if max_value is not None:
        stat["max_value"] = max_value
    stat = ADM_mark_value_derived_flagged(stat)
    return ADM_strip_forbidden_fields(stat)