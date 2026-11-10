"""Phenotypic Features tab — HPO-coded terms, the Diagnosis × Phenotype
explorer, and onset-over-time views."""

from __future__ import annotations

import math

from .utils import (
    first_diagnosis_label,
    iso_to_years,
    median_of,
    sorted_entries,
    subject_id,
    subject_sex,
)

NO_DX = "No diagnosis"


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
                    "onsets": [],
                },
            )
            entry["count"] += 1
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
            "has_onset": bool(h["onsets"]),
        }
        for h in rows
    ]
    top30 = table[:30]  # most frequent first → drawn at the top of the horizontal bar chart

    return {
        "table": table,
        "chart": {"labels": [h["label"] for h in top30], "counts": [h["count"] for h in top30]},
        "any_onset": any(h["has_onset"] for h in table),
    }


# ── Diagnosis × Phenotype explorer ─────────────────────────────────────────

def _term_dx_pairs(packets: list) -> tuple[dict, dict, dict]:
    """Index the cohort for the explorer.

    Returns
      term_individuals  {term_label: set(individual_id)}
      dx_individuals    {dx_label:   set(individual_id)}
      pair_individuals  {(term_label, dx_label): set(individual_id)}

    Every count downstream is a set size, so an individual listing a term
    twice, or the same diagnosis twice, counts once.  Individuals without
    any interpretation diagnosis are grouped under ``NO_DX``.
    """
    term_ind: dict = {}
    dx_ind: dict = {}
    pair_ind: dict = {}
    for p in packets:
        pid = subject_id(p)
        dxs = {
            ((i.get("diagnosis") or {}).get("disease") or {}).get("label")
            for i in p.get("interpretations") or []
        }
        dxs.discard(None)
        if not dxs:
            dxs = {NO_DX}
        for d in dxs:
            dx_ind.setdefault(d, set()).add(pid)
        terms = {
            (pf.get("type") or {}).get("label") or (pf.get("type") or {}).get("id")
            for pf in p.get("phenotypicFeatures") or []
            if not pf.get("excluded") and (pf.get("type") or {}).get("id")
        }
        for t in terms:
            term_ind.setdefault(t, set()).add(pid)
            for d in dxs:
                pair_ind.setdefault((t, d), set()).add(pid)
    return term_ind, dx_ind, pair_ind


def explorer(packets: list, view: str = "dx-per-term", top_n: int = 15,
             diagnosis: str | None = None) -> dict:
    """Data for the Diagnosis × Phenotype explorer.  All counts are unique individuals.

    view      — "dx-per-term" : top-N terms in the cohort, each split by diagnosis
                "term-per-dx" : top-N terms *within one diagnosis* (``diagnosis``;
                                defaults to the most frequent one)
                "heatmap"     : top-N terms × top-N diagnoses
    top_n     — 0 means "all"
    """
    term_ind, dx_ind, pair_ind = _term_dx_pairs(packets)
    if not term_ind:
        return {"view": view, "empty": True}

    term_totals = {t: len(s) for t, s in term_ind.items()}
    dx_totals = {d: len(s) for d, s in dx_ind.items()}
    dx_sorted = sorted_entries(dx_totals)
    dx_options = [{"label": d, "n": c} for d, c in dx_sorted]

    def pair(t: str, d: str) -> int:
        return len(pair_ind.get((t, d), ()))

    if view == "term-per-dx":
        if diagnosis not in dx_totals:
            diagnosis = dx_sorted[0][0]
        n_dx = dx_totals[diagnosis]
        within = sorted_entries({t: pair(t, diagnosis) for t in term_ind if pair(t, diagnosis)})
        within = within[: top_n or len(within)]
        return {
            "view": view,
            "empty": False,
            "diagnosis": diagnosis,
            "n_dx": n_dx,
            "dx_options": dx_options,
            "terms": [
                {"label": t, "n": c, "pct": c / n_dx * 100 if n_dx else 0.0}
                for t, c in within
            ],
        }

    top_terms = [t for t, _ in sorted_entries(term_totals)[: top_n or len(term_totals)]]

    if view == "heatmap":
        top_dx = [d for d, _ in dx_sorted[: top_n or len(dx_sorted)]]
        matrix = [[pair(t, d) for d in top_dx] for t in top_terms]
        # colour = share of that diagnosis' individuals showing the term
        pct = [
            [(pair(t, d) / dx_totals[d] * 100) if dx_totals[d] else 0.0 for d in top_dx]
            for t in top_terms
        ]
        return {
            "view": view,
            "empty": False,
            "terms": top_terms,
            "diagnoses": top_dx,
            "dx_totals": [dx_totals[d] for d in top_dx],
            "matrix": matrix,
            "pct": pct,
            "dx_options": dx_options,
        }

    # dx-per-term (default): x = top terms, stacks = diagnoses
    secondary = [d for d, _ in dx_sorted if any(pair(t, d) for t in top_terms)]
    datasets = [{"label": d, "data": [pair(t, d) for t in top_terms]} for d in secondary]
    return {
        "view": "dx-per-term",
        "empty": False,
        "primary_keys": top_terms,
        "primary_totals": [term_totals[t] for t in top_terms],
        "datasets": datasets,
        "dx_options": dx_options,
    }


# ── Onset over time ────────────────────────────────────────────────────────

def _group_sizes(packets: list, group_by: str) -> dict:
    """How many individuals fall in each group — the ECDF denominator when
    the user asks for "100% = whole cohort"."""
    sizes: dict = {}
    for p in packets:
        key = (
            subject_sex(p) if group_by == "sex"
            else first_diagnosis_label(p) if group_by == "diagnosis"
            else "Cohort"
        )
        sizes[key] = sizes.get(key, 0) + 1
    return sizes


def over_time(packets: list, term_id: str, group_by: str = "cohort",
              ecdf_base: str = "cohort") -> dict:
    """Onset-age records for one HPO term, grouped for the over-time chart.

    group_by  — "cohort" | "sex" | "diagnosis"
    ecdf_base — "cohort": the ECDF's 100 % is every individual in the group
                          (the curve plateaus at the share of the group that
                          has the feature with an onset recorded);
                "term":   100 % is the individuals who have this feature with
                          an onset recorded (classic ECDF, always reaches 100 %).

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

    sizes = _group_sizes(packets, group_by)

    # Shared 5-year histogram bins across groups (stacked histogram)
    all_ages = [r["age"] for r in records]
    mn = math.floor(min(all_ages) / 5) * 5
    mx = math.ceil(max(all_ages) / 5) * 5
    if mx <= mn:
        mx = mn + 5
    labels = [f"{b}–{b + 4}" for b in range(int(mn), int(mx), 5)]
    x_max = max(all_ages)

    out_groups = []
    for name, ages in groups.items():
        ages_sorted = sorted(ages)
        bins = [0] * len(labels)
        for a in ages:
            i = min(int((a - mn) / 5), len(bins) - 1)
            bins[i] += 1
        denom = sizes.get(name, len(ages_sorted)) if ecdf_base == "cohort" else len(ages_sorted)
        ecdf = [{"x": a, "y": (i + 1) / denom * 100} for i, a in enumerate(ages_sorted)]
        if ecdf and ecdf[-1]["x"] < x_max:
            # extend the step flat to the right edge so plateaus are visible
            ecdf.append({"x": x_max, "y": ecdf[-1]["y"]})
        out_groups.append({
            "name": name, "n": len(ages), "group_size": sizes.get(name, len(ages)),
            "ages": ages_sorted, "bins": bins, "ecdf": ecdf,
        })

    return {
        "empty": False,
        "n_records": len(records),
        "n_patients": len({r["patient_id"] for r in records}),
        "ecdf_base": ecdf_base,
        "hist_labels": labels,
        "groups": out_groups,
    }
