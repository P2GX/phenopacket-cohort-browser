"""Demographics tab — subject-level descriptive statistics.

Edit anything here and the Demographics tab updates on the next deploy.
The function returns plain dicts/lists; the JS side only draws them.
"""

from __future__ import annotations

import datetime as _dt

from .utils import (
    counter,
    encounter_age_years,
    make_histogram,
    mean_of,
    median_of,
)


def _birth_year(packet: dict) -> int | None:
    dob = (packet.get("subject") or {}).get("dateOfBirth")
    if not dob:
        return None
    try:
        return int(str(dob)[:4])
    except (ValueError, TypeError):
        return None


def _current_age_years(packet: dict, today: _dt.date) -> float | None:
    dob = (packet.get("subject") or {}).get("dateOfBirth")
    if not dob:
        return None
    try:
        d = _dt.date.fromisoformat(str(dob)[:10])
    except ValueError:
        return None
    return (today - d).days / 365.25


def compute(packets: list) -> dict:
    """All numbers shown on the Demographics tab."""
    today = _dt.date.today()
    n = len(packets)

    sex_counts = counter(
        (p.get("subject") or {}).get("sex") or "UNKNOWN" for p in packets
    )
    vital_counts = counter(
        ((p.get("subject") or {}).get("vitalStatus") or {}).get("status") or "UNKNOWN"
        for p in packets
    )

    ages_encounter = sorted(
        a for a in (encounter_age_years(p) for p in packets) if a is not None
    )
    birth_years = [y for y in (_birth_year(p) for p in packets) if y is not None]
    current_ages = sorted(
        a for a in (_current_age_years(p, today) for p in packets) if a is not None
    )

    def _summary(sorted_vals: list) -> dict:
        return {
            "n": len(sorted_vals),
            "pct": (len(sorted_vals) / n * 100) if n else 0.0,
            "min": sorted_vals[0] if sorted_vals else None,
            "median": median_of(sorted_vals),
            "mean": mean_of(sorted_vals),
            "max": sorted_vals[-1] if sorted_vals else None,
        }

    return {
        "n_patients": n,
        "sex_counts": sex_counts,
        "vital_counts": vital_counts,
        "alive": vital_counts.get("ALIVE", 0),
        "deceased": vital_counts.get("DECEASED", 0) or vital_counts.get("DEAD", 0),
        "earliest_birth_year": min(birth_years) if birth_years else None,
        "yob_hist": make_histogram(birth_years, 1),
        "age_encounter_hist": make_histogram(ages_encounter, 5),
        "current_age_hist": make_histogram(current_ages, 5),
        "encounter_summary": _summary(ages_encounter),
        "current_summary": _summary(current_ages),
    }
