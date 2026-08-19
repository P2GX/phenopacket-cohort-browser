"""Diagnoses tab — diseases as recorded in the *interpretations* block."""

from __future__ import annotations

from .utils import iso_to_years, median_of


def compute(packets: list) -> dict:
    """One row per unique disease found in ``interpretations[].diagnosis``.

    ``count`` is the number of interpretation records naming the disease
    (a patient with two interpretations of the same disease counts twice —
    same as the original viewer).  Onset ages are pulled from the packet's
    ``diseases`` block where the term id matches.
    """
    n = len(packets)
    dx_map: dict = {}

    for p in packets:
        for interp in p.get("interpretations") or []:
            disease = (interp.get("diagnosis") or {}).get("disease")
            if not disease or not disease.get("id"):
                continue
            key = disease["id"]
            entry = dx_map.setdefault(
                key,
                {"id": key, "label": disease.get("label") or "—", "count": 0, "onsets": []},
            )
            entry["count"] += 1
            for dis in p.get("diseases") or []:
                if (dis.get("term") or {}).get("id") == key:
                    yr = iso_to_years(((dis.get("onset") or {}).get("age") or {}).get("iso8601duration"))
                    if yr is not None:
                        entry["onsets"].append(yr)

    rows = sorted(dx_map.values(), key=lambda d: d["count"], reverse=True)
    table = [
        {
            "id": d["id"],
            "label": d["label"],
            "count": d["count"],
            "pct": (d["count"] / n * 100) if n else 0.0,
            "median_onset": median_of(sorted(d["onsets"])),
        }
        for d in rows
    ]
    top30 = table[:30][::-1]  # reversed → smallest at top, like the original chart

    return {
        "table": table,
        "chart": {"labels": [d["label"] for d in top30], "counts": [d["count"] for d in top30]},
        "n_unique": len(table),
    }
