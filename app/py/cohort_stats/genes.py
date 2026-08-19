"""Genes tab — HGNC-annotated genomic interpretations.

Includes the Gene × Diagnosis explorer (stacked bars / heatmap), which is
recomputed on demand when the user changes a dropdown.
"""

from __future__ import annotations

from .utils import counter, sorted_entries

PATHOGENIC_CLASSES = {"PATHOGENIC", "LIKELY_PATHOGENIC"}


def collect_gene_rows(packets: list) -> list:
    """Flatten every genomic interpretation into one record.

    This is the single source of truth for everything on the Genes tab —
    the stat cards, both tables and the explorer all derive from it.
    """
    rows = []
    for p in packets:
        sex = (p.get("subject") or {}).get("sex") or "UNKNOWN"
        patient_id = (p.get("subject") or {}).get("id") or p.get("id")
        for interp in p.get("interpretations") or []:
            dx = interp.get("diagnosis") or {}
            for gi in dx.get("genomicInterpretations") or []:
                vi = gi.get("variantInterpretation") or {}
                vd = vi.get("variationDescriptor") or {}
                gene = vd.get("geneContext") or gi.get("gene") or {}
                if not gene.get("symbol"):
                    continue
                expressions = vd.get("expressions") or []
                rows.append(
                    {
                        "gene": gene["symbol"],
                        "hgnc_id": gene.get("valueId") or "—",
                        "disease": (dx.get("disease") or {}).get("label") or "—",
                        "disease_id": (dx.get("disease") or {}).get("id") or "—",
                        "acmg": vi.get("acmgPathogenicityClassification") or "—",
                        "status": gi.get("interpretationStatus") or "—",
                        "hgvs": (expressions[0].get("value") if expressions else None) or "—",
                        "allelic": (vd.get("allelicState") or {}).get("label") or "—",
                        "sex": sex,
                        "patient_id": patient_id,
                    }
                )
    return rows


def compute(packets: list) -> dict:
    n = len(packets)
    rows = collect_gene_rows(packets)

    unique_genes = len({r["gene"] for r in rows})
    unique_dx = len({r["disease_id"] for r in rows})
    unique_patients = len({r["patient_id"] for r in rows})
    path_count = sum(1 for r in rows if r["acmg"] in PATHOGENIC_CLASSES)

    gene_counts = counter(r["gene"] for r in rows)
    top20 = sorted_entries(gene_counts)[:20][::-1]

    acmg_counts = counter(r["acmg"] for r in rows)

    # One summary row per gene
    summary_map: dict = {}
    for r in rows:
        g = summary_map.setdefault(
            r["gene"],
            {
                "gene": r["gene"],
                "hgnc_id": r["hgnc_id"],
                "patients": set(),
                "diseases": set(),
                "acmg_counts": {},
                "records": 0,
            },
        )
        g["patients"].add(r["patient_id"])
        g["diseases"].add(r["disease"])
        g["acmg_counts"][r["acmg"]] = g["acmg_counts"].get(r["acmg"], 0) + 1
        g["records"] += 1

    gene_summary = sorted(
        (
            {
                "gene": g["gene"],
                "hgnc_id": g["hgnc_id"],
                "n_patients": len(g["patients"]),
                "pct_patients": (len(g["patients"]) / n * 100) if n else 0.0,
                "n_diseases": len(g["diseases"]),
                "diseases": " · ".join(sorted(g["diseases"])),
                "records": g["records"],
                "top_acmg": sorted_entries(g["acmg_counts"])[0][0] if g["acmg_counts"] else "—",
                "acmg_break": ", ".join(
                    f"{k.replace('_', ' ')}:{v}" for k, v in sorted_entries(g["acmg_counts"])
                ),
            }
            for g in summary_map.values()
        ),
        key=lambda g: g["n_patients"],
        reverse=True,
    )

    return {
        "stats": {
            "unique_genes": unique_genes,
            "unique_patients": unique_patients,
            "records": len(rows),
            "linked_dx": unique_dx,
            "path_count": path_count,
        },
        "top20": {"labels": [e[0] for e in top20], "counts": [e[1] for e in top20]},
        "acmg_counts": acmg_counts,
        "gene_summary": gene_summary,
        "rows": rows,
    }


# ── Gene × Diagnosis explorer ──────────────────────────────────────────────

def _count(rows: list, metric: str) -> int:
    if metric == "patients":
        return len({r["patient_id"] for r in rows})
    return len(rows)


def explorer(packets: list, view: str = "gene-per-dx", top_n: int = 15,
             metric: str = "patients") -> dict:
    """Data for the Gene × Diagnosis explorer.

    view   — "gene-per-dx" | "dx-per-gene" | "heatmap"
    top_n  — 0 means "all"
    metric — "patients" (unique) | "records"
    """
    rows = collect_gene_rows(packets)
    if not rows:
        return {"view": view, "empty": True}

    all_genes = list(dict.fromkeys(r["gene"] for r in rows))
    all_dx = list(dict.fromkeys(r["disease"] for r in rows))

    by_gene: dict = {}
    by_dx: dict = {}
    for r in rows:
        by_gene.setdefault(r["gene"], []).append(r)
        by_dx.setdefault(r["disease"], []).append(r)

    gene_totals = {g: _count(by_gene[g], metric) for g in all_genes}
    dx_totals = {d: _count(by_dx[d], metric) for d in all_dx}

    if view == "heatmap":
        top_genes = [g for g, _ in sorted_entries(gene_totals)[: top_n or len(all_genes)]]
        top_dx = [d for d, _ in sorted_entries(dx_totals)[: top_n or len(all_dx)]]
        matrix = [
            [
                _count([r for r in by_gene[g] if r["disease"] == d], metric)
                for d in top_dx
            ]
            for g in top_genes
        ]
        max_val = max((v for row in matrix for v in row), default=0) or 1
        return {
            "view": view,
            "empty": False,
            "genes": top_genes,
            "diagnoses": top_dx,
            "matrix": matrix,
            "max": max_val,
            "metric": metric,
        }

    if view == "gene-per-dx":
        primary = [d for d, _ in sorted_entries(dx_totals)[: top_n or len(all_dx)]]
        secondary = list(dict.fromkeys(
            r["gene"] for r in rows if r["disease"] in set(primary)
        ))
        secondary.sort(key=lambda s: gene_totals.get(s, 0), reverse=True)
        datasets = [
            {
                "label": s,
                "data": [
                    _count([r for r in by_dx[pk] if r["gene"] == s], metric)
                    for pk in primary
                ],
            }
            for s in secondary
        ]
    else:  # dx-per-gene
        primary = [g for g, _ in sorted_entries(gene_totals)[: top_n or len(all_genes)]]
        secondary = list(dict.fromkeys(
            r["disease"] for r in rows if r["gene"] in set(primary)
        ))
        secondary.sort(key=lambda s: dx_totals.get(s, 0), reverse=True)
        datasets = [
            {
                "label": s,
                "data": [
                    _count([r for r in by_gene[pk] if r["disease"] == s], metric)
                    for pk in primary
                ],
            }
            for s in secondary
        ]

    return {
        "view": view,
        "empty": False,
        "primary_keys": primary,
        "datasets": datasets,
        "metric": metric,
    }
