"""Phenotypic Features tab — HPO-coded terms, plus onset-over-time views."""

from __future__ import annotations

import math

from .utils import (
    counter,
    first_diagnosis_label,
    iso_to_years,
    median_of,
    sorted_entries,
    subject_id,
    subject_sex,
)


def compute(packets: list) -> dict:
    """One row per HPO term (excluded features are skipped).

    ``count`` is the number of feature records naming the term — a patient
    listing the same term twice counts twice (same as the original viewer).
    """
    n = len(packets)
    hpo_map: dict = {}

    for p in packets:
        for pf in p.get("phenotypicFeatures") or []:
            term = pf.get("type") or {}
            if not term.get("id") or pf.get("excluded"):
                continue
            entry = hpo_map.setdefault(
                term["id"],
                {
                    "id": term["id"],
                    "label": term.get("label") or "—",
                    "count": 0,
                    "severities": [],
                    "onsets": [],
                },
            )
            entry["count"] += 1
            severity = (pf.get("severity") or {}).get("label")
            if severity:
                entry["severities"].append(severity)
            yr = iso_to_years(((pf.get("onset") or {}).get("age") or {}).get("iso8601duration"))
            if yr is not None:
                entry["onsets"].append(yr)

    rows = sorted(hpo_map.values(), key=lambda h: h["count"], reverse=True)
    table = [
        {
            "id": h["id"],
            "label": h["label"],
            "count": h["count"],
            "pct": (h["count"] / n * 100) if n else 0.0,
            "median_onset": median_of(sorted(h["onsets"])),
            "top_severity": sorted_entries(counter(h["severities"]))[0][0]
            if h["severities"] else None,
            "has_onset": bool(h["onsets"]),
        }
        for h in rows
    ]
    top30 = table[:30][::-1]

    return {
        "table": table,
        "chart": {"labels": [h["label"] for h in top30], "counts": [h["count"] for h in top30]},
        "any_onset": any(h["has_onset"] for h in table),
    }


def over_time(packets: list, term_id: str, group_by: str = "cohort") -> dict:
    """Onset-age records for one HPO term, grouped for the over-time chart.

    group_by — "cohort" | "sex" | "diagnosis"

    Returns per group: raw sorted ages (scatter), 5-year histogram bins and
    ECDF points, so the front end can render any of the three modes.
    """
    records = []
    for p in packets:
        sex = subject_sex(p)
        diag = first_diagnosis_label(p)
        for pf in p.get("phenotypicFeatures") or []:
            if pf.get("excluded") or (pf.get("type") or {}).get("id") != term_id:
                continue
            yr = iso_to_years(((pf.get("onset") or {}).get("age") or {}).get("iso8601duration"))
            if yr is None:
                continue
            records.append({"age": yr, "sex": sex, "diag": diag, "patient_id": subject_id(p)})

    if not records:
        return {"empty": True}

    groups: dict = {}
    for r in records:
        key = r["sex"] if group_by == "sex" else r["diag"] if group_by == "diagnosis" else "Cohort"
        groups.setdefault(key, []).append(r["age"])

    # Shared 5-year histogram bins across groups (stacked histogram)
    all_ages = [r["age"] for r in records]
    mn = math.floor(min(all_ages) / 5) * 5
    mx = math.ceil(max(all_ages) / 5) * 5
    if mx <= mn:
        mx = mn + 5
    labels = [f"{b}–{b + 4}" for b in range(int(mn), int(mx), 5)]

    out_groups = []
    for name, ages in groups.items():
        ages_sorted = sorted(ages)
        bins = [0] * len(labels)
        for a in ages:
            i = min(int((a - mn) / 5), len(bins) - 1)
            bins[i] += 1
        ecdf = [
            {"x": a, "y": (i + 1) / len(ages_sorted) * 100}
            for i, a in enumerate(ages_sorted)
        ]
        out_groups.append({"name": name, "n": len(ages), "ages": ages_sorted,
                           "bins": bins, "ecdf": ecdf})

    return {
        "empty": False,
        "n_records": len(records),
        "n_patients": len({r["patient_id"] for r in records}),
        "hist_labels": labels,
        "groups": out_groups,
    }
