"""Shared helpers for cohort statistics.

Every function here is deliberately dependency-free (Python stdlib only) so the
package runs unchanged in CPython (pytest, scripts) and in the browser via
Pyodide without loading any wheels.

NOTE ON SEMANTICS: several helpers intentionally reproduce the exact behaviour
of the original single-file viewer (e.g. the median is the *upper* median,
``sorted[len // 2]``, and percentiles use ``sorted[floor(n * q)]``).  If you
want textbook interpolated quantiles, change them here — every tab picks the
change up automatically.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Iterable
from typing import Any

# ── ISO-8601 durations ─────────────────────────────────────────────────────

_ISO_RE = re.compile(r"P(?:(\d+)Y)?(?:(\d+)M)?")


def iso_to_years(iso: str | None) -> float | None:
    """Convert an ISO-8601 duration like ``P12Y6M`` to decimal years.

    Mirrors the original viewer: only the year and month components are read;
    ``None``/empty input or a string without a parsable ``P…`` prefix → None.
    """
    if not iso:
        return None
    m = _ISO_RE.search(iso)
    if not m:
        return None
    years = int(m.group(1) or 0)
    months = int(m.group(2) or 0)
    return years + months / 12


# ── Descriptive statistics (original-viewer semantics) ─────────────────────

def median_of(sorted_vals: list) -> float | None:
    """Upper median: ``sorted[len // 2]`` — matches the original viewer."""
    if not sorted_vals:
        return None
    return sorted_vals[len(sorted_vals) // 2]


def mean_of(vals: Iterable[float]) -> float | None:
    vals = list(vals)
    if not vals:
        return None
    return sum(vals) / len(vals)


def percentile(sorted_vals: list, q: float) -> float | None:
    """``sorted[floor(n * q)]`` — matches the original viewer's percentiles."""
    if not sorted_vals:
        return None
    idx = min(int(math.floor(len(sorted_vals) * q)), len(sorted_vals) - 1)
    return sorted_vals[idx]


def counter(values: Iterable) -> dict:
    """Counting helper; insertion-ordered like the original JS object."""
    return dict(Counter(values))


def sorted_entries(mapping: dict) -> list:
    """[(key, count), …] sorted by count descending."""
    return sorted(mapping.items(), key=lambda kv: kv[1], reverse=True)


def make_histogram(values: list, bin_size: float) -> dict:
    """Fixed-width histogram identical to the original ``makeHistogram``.

    Returns ``{"labels": [...], "bins": [...]}``.  Labels are ``"a–b"`` ranges
    (or the plain start value when ``bin_size == 1``).
    """
    if not values:
        return {"labels": [], "bins": []}
    mn = math.floor(min(values) / bin_size) * bin_size
    mx = math.ceil(max(values) / bin_size) * bin_size
    if mx <= mn:  # all values sit on a single bin boundary
        mx = mn + bin_size
    bins: list = []
    labels: list = []
    b = mn
    while b < mx:
        bins.append(0)
        labels.append(str(int(b)) if bin_size == 1 else f"{int(b)}–{int(b + bin_size - 1)}")
        b += bin_size
    for v in values:
        i = min(int((v - mn) / bin_size), len(bins) - 1)
        bins[i] += 1
    return {"labels": labels, "bins": bins}


# ── JSON hygiene ───────────────────────────────────────────────────────────

def sanitize(obj: Any) -> Any:
    """Recursively replace non-finite floats with None so the payload is
    always valid JSON for the browser's ``JSON.parse``."""
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v) for v in obj]
    return obj


# ── Phenopacket field accessors ────────────────────────────────────────────

def subject_id(packet: dict) -> str | None:
    return (packet.get("subject") or {}).get("id") or packet.get("id")


def subject_sex(packet: dict) -> str:
    return (packet.get("subject") or {}).get("sex") or "UNKNOWN"


def first_diagnosis_label(packet: dict) -> str:
    """Label of the first interpretation's disease — used for grouping."""
    for interp in packet.get("interpretations") or []:
        disease = ((interp.get("diagnosis") or {}).get("disease")) or {}
        if disease.get("label"):
            return disease["label"]
        break
    return "Unknown"


def encounter_age_years(packet: dict) -> float | None:
    tale = ((packet.get("subject") or {}).get("timeAtLastEncounter") or {})
    return iso_to_years((tale.get("age") or {}).get("iso8601duration"))
