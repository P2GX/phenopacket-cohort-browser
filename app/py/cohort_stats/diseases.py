"""Diseases tab — the ``diseases`` block (may differ from interpretations)."""

from __future__ import annotations

from .utils import iso_to_years, median_of


def compute(packets: list) -> dict:
    n = len(packets)
    dis_map: dict = {}

    for p in packets:
        for d in p.get("diseases") or []:
            term = d.get("term") or {}
            if not term.get("id"):
                continue
            entry = dis_map.setdefault(
                term["id"],
                {"id": term["id"], "label": term.get("label") or "—", "count": 0, "onsets": []},
            )
            entry["count"] += 1
            yr = iso_to_years(((d.get("onset") or {}).get("age") or {}).get("iso8601duration"))
            if yr is not None:
                entry["onsets"].append(yr)

    rows = sorted(dis_map.values(), key=lambda d: d["count"], reverse=True)
    table = [
        {
            "id": d["id"],
            "label": d["label"],
            "count": d["count"],
            "pct": (d["count"] / n * 100) if n else 0.0,
            "median_onset": median_of(sorted(d["onsets"])),
            "min_onset": min(d["onsets"]) if d["onsets"] else None,
        }
        for d in rows
    ]
    top30 = table[:30][::-1]

    return {
        "table": table,
        "chart": {"labels": [d["label"] for d in top30], "counts": [d["count"] for d in top30]},
    }
