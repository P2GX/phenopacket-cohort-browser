"""Measurements tab — LOINC-coded quantitative assays.

Covers the assay overview table, box-plot summaries, the per-assay
distribution detail and the measurements-over-time chart.
"""

from __future__ import annotations

import datetime as _dt
import math

from .utils import (
    first_diagnosis_label,
    iso_to_years,
    mean_of,
    median_of,
    percentile,
    subject_sex,
)


def _epoch_ms(timestamp: str):
    """Parse an ISO timestamp/date to epoch milliseconds (None on failure)."""
    if not timestamp:
        return None
    text = str(timestamp).replace("Z", "+00:00")
    try:
        d = _dt.datetime.fromisoformat(text)
    except ValueError:
        try:
            d = _dt.datetime.fromisoformat(text[:10])
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=_dt.timezone.utc)
    return d.timestamp() * 1000


def collect_records(packets: list) -> list:
    """Flatten every measurement with a numeric quantity into one record."""
    records = []
    for p in packets:
        sid = (p.get("subject") or {}).get("id") or p.get("id") or "—"
        sex = subject_sex(p)
        diagnosis = first_diagnosis_label(p)
        for m in p.get("measurements") or []:
            assay = m.get("assay") or {}
            quantity = ((m.get("value") or {}).get("quantity")) or {}
            val = quantity.get("value")
            if val is None:
                continue
            try:
                val = float(val)
            except (TypeError, ValueError):
                continue

            time_observed = m.get("timeObserved") or {}
            time_age = (time_observed.get("age") or {}).get("iso8601duration")
            time_date = time_observed.get("timestamp") or time_observed.get("date")

            time_val = None
            time_type = None
            if time_age:
                time_val = iso_to_years(time_age)
                time_type = "age"
            elif time_date:
                time_val = _epoch_ms(time_date)
                time_type = "date" if time_val is not None else None

            records.append(
                {
                    "subject_id": sid,
                    "assay_id": assay.get("id") or "—",
                    "assay_label": assay.get("label") or assay.get("id") or "—",
                    "val": val,
                    "unit": ((quantity.get("unit") or {}).get("label")) or "",
                    "unit_id": ((quantity.get("unit") or {}).get("id")) or "",
                    "time_iso_age": time_age,
                    "time_date": str(time_date)[:10] if time_date else None,
                    "time_val": time_val,
                    "time_type": time_type,
                    "sex": sex,
                    "diagnosis": diagnosis,
                }
            )
    return records


def _assay_summaries(records: list) -> list:
    assay_map: dict = {}
    for r in records:
        a = assay_map.setdefault(
            r["assay_id"],
            {"id": r["assay_id"], "label": r["assay_label"], "unit": r["unit"],
             "vals": [], "patients": set()},
        )
        a["vals"].append(r["val"])
        a["patients"].add(r["subject_id"])

    summaries = []
    for a in assay_map.values():
        s = sorted(a["vals"])
        summaries.append(
            {
                "id": a["id"],
                "label": a["label"],
                "unit": a["unit"],
                "n_records": len(s),
                "n_patients": len(a["patients"]),
                "min": s[0],
                "p05": percentile(s, 0.05),
                "p25": percentile(s, 0.25),
                "median": median_of(s),
                "p75": percentile(s, 0.75),
                "p95": percentile(s, 0.95),
                "max": s[-1],
                "mean": mean_of(s),
            }
        )
    summaries.sort(key=lambda a: a["n_records"], reverse=True)
    return summaries


def compute(packets: list) -> dict:
    n = len(packets)
    records = collect_records(packets)
    summaries = _assay_summaries(records)
    patients_with = len({r["subject_id"] for r in records})

    return {
        "stats": {
            "records": len(records),
            "patients_with": patients_with,
            "unique_assays": len(summaries),
            "avg_per_patient": len(records) / max(patients_with, 1),
        },
        "assays": [
            {**a, "pct_patients": (a["n_patients"] / n * 100) if n else 0.0}
            for a in summaries
        ],
        "records": records,
        "any_time": any(r["time_val"] is not None for r in records),
    }


def assay_detail(packets: list, assay_id: str) -> dict:
    """Histogram (Sturges' rule, clamped 8–30 bins) + summary for one assay."""
    records = [r for r in collect_records(packets) if r["assay_id"] == assay_id]
    if not records:
        return {"empty": True}

    vals = sorted(r["val"] for r in records)
    n = len(vals)
    lo, hi = vals[0], vals[-1]
    value_range = (hi - lo) or 1
    n_bins = min(max(math.ceil(math.log2(n) + 1), 8), 30)
    bin_w = value_range / n_bins
    bins = [0] * n_bins
    for v in vals:
        bins[min(int((v - lo) / bin_w), n_bins - 1)] += 1

    return {
        "empty": False,
        "id": assay_id,
        "label": records[0]["assay_label"],
        "unit": records[0]["unit"],
        "n_records": n,
        "n_patients": len({r["subject_id"] for r in records}),
        "bins": bins,
        "bin_labels": [round(lo + i * bin_w, 2) for i in range(n_bins)],
        "bin_width": bin_w,
        "summary": {
            "min": lo,
            "p05": percentile(vals, 0.05),
            "p25": percentile(vals, 0.25),
            "median": median_of(vals),
            "mean": mean_of(vals),
            "p75": percentile(vals, 0.75),
            "p95": percentile(vals, 0.95),
            "max": hi,
        },
    }


def over_time(packets: list, assay_id: str, group_by: str = "cohort") -> dict:
    """Time-stamped values for one assay, grouped, plus binned median lines.

    group_by — "cohort" | "sex" | "diagnosis"
    """
    records = sorted(
        (r for r in collect_records(packets)
         if r["assay_id"] == assay_id and r["time_val"] is not None),
        key=lambda r: r["time_val"],
    )
    if not records:
        return {"empty": True}

    groups: dict = {}
    for r in records:
        key = (r["sex"] if group_by == "sex"
               else r["diagnosis"] if group_by == "diagnosis" else "Cohort")
        groups.setdefault(key, []).append(r)

    out_groups = []
    for name, recs in groups.items():
        pts = [{"x": r["time_val"], "y": r["val"]} for r in recs]

        xs = [p["x"] for p in pts]
        x_min, x_max = min(xs), max(xs)
        span = (x_max - x_min) or 1
        bin_w = span / min(15, len(pts))
        bins: dict = {}
        for p in pts:
            bins.setdefault(int((p["x"] - x_min) / bin_w), []).append(p["y"])
        median_line = [
            {"x": x_min + (b + 0.5) * bin_w, "y": median_of(sorted(ys))}
            for b, ys in sorted(bins.items())
        ]
        out_groups.append({"name": name, "points": pts, "median_line": median_line})

    return {
        "empty": False,
        "n_records": len(records),
        "n_patients": len({r["subject_id"] for r in records}),
        "time_type": records[0]["time_type"],
        "unit": records[0]["unit"],
        "label": records[0]["assay_label"],
        "groups": out_groups,
    }
