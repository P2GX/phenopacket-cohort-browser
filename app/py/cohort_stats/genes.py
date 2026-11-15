"""Genetic Variation tab — HGNC-annotated genomic interpretations.

Includes the Gene × Diagnosis explorer (stacked bars / heatmap), which is
recomputed on demand when the user changes a dropdown.

All counts on this tab are *unique individuals*.  A "record" (one genomic
interpretation) is only used internally; it differs from an individual only
when the same person carries the same gene in several interpretations, which
is rare enough that exposing it in the UI caused more confusion than insight.
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


def collect_variant_rows(rows: list, n_cohort: int) -> list:
    """Collapse genomic-interpretation records into unique variants.

    A variant is identified by (gene, HGVS expression, zygosity).  Each row
    carries how many individuals in the cohort carry that exact combination,
    plus the diseases / ACMG classes / interpretation statuses seen with it.
    """
    var_map: dict = {}
    for r in rows:
        key = (r["gene"], r["hgvs"], r["allelic"])
        v = var_map.setdefault(
            key,
            {
                "gene": r["gene"],
                "hgnc_id": r["hgnc_id"],
                "hgvs": r["hgvs"],
                "allelic": r["allelic"],
                "patients": set(),
                "diseases": set(),
                "acmg_counts": {},
                "status_counts": {},
            },
        )
        v["patients"].add(r["patient_id"])
        v["diseases"].add(r["disease"])
        v["acmg_counts"][r["acmg"]] = v["acmg_counts"].get(r["acmg"], 0) + 1
        v["status_counts"][r["status"]] = v["status_counts"].get(r["status"], 0) + 1

    def _top(counts: dict) -> str:
        return sorted_entries(counts)[0][0] if counts else "—"

    return sorted(
        (
            {
                "gene": v["gene"],
                "hgnc_id": v["hgnc_id"],
                "hgvs": v["hgvs"],
                "allelic": v["allelic"],
                "n_individuals": len(v["patients"]),
                "pct_individuals": (len(v["patients"]) / n_cohort * 100) if n_cohort else 0.0,
                "diseases": " · ".join(sorted(v["diseases"])),
                "acmg": _top(v["acmg_counts"]),
                # > 1 means the same variant was classified differently somewhere
                "n_acmg_classes": len(v["acmg_counts"]),
                "status": _top(v["status_counts"]),
            }
            for v in var_map.values()
        ),
        key=lambda v: (-v["n_individuals"], v["gene"], v["hgvs"]),
    )


def compute(packets: list) -> dict:
    n = len(packets)
    rows = collect_gene_rows(packets)

    unique_genes = len({r["gene"] for r in rows})
    unique_dx = len({r["disease_id"] for r in rows})
    unique_patients = len({r["patient_id"] for r in rows})
    path_count = sum(1 for r in rows if r["acmg"] in PATHOGENIC_CLASSES)

    # Top genes by number of unique individuals (not records)
    gene_patients: dict = {}
    for r in rows:
        gene_patients.setdefault(r["gene"], set()).add(r["patient_id"])
    gene_counts = {g: len(s) for g, s in gene_patients.items()}
    top20 = sorted_entries(gene_counts)[:20]  # most frequent first → top of the chart

    acmg_counts = counter(r["acmg"] for r in rows)
    variants = collect_variant_rows(rows, n)

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
            },
        )
        g["patients"].add(r["patient_id"])
        g["diseases"].add(r["disease"])
        g["acmg_counts"][r["acmg"]] = g["acmg_counts"].get(r["acmg"], 0) + 1

    gene_summary = sorted(
        (
            {
                "gene": g["gene"],
                "hgnc_id": g["hgnc_id"],
                "n_patients": len(g["patients"]),
                "pct_patients": (len(g["patients"]) / n * 100) if n else 0.0,
                "n_diseases": len(g["diseases"]),
                "diseases": " · ".join(sorted(g["diseases"])),
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
            "unique_variants": len(variants),
            "linked_dx": unique_dx,
            "path_count": path_count,
        },
        "top20": {"labels": [e[0] for e in top20], "counts": [e[1] for e in top20]},
        "acmg_counts": acmg_counts,
        "gene_summary": gene_summary,
        "variants": variants,
    }


# ── Gene × Diagnosis explorer ──────────────────────────────────────────────

def _count(rows: list) -> int:
    """Unique individuals among a set of records."""
    return len({r["patient_id"] for r in rows})


def explorer(packets: list, view: str = "gene-per-dx", top_n: int = 15) -> dict:
    """Data for the Gene × Diagnosis explorer.  All counts are unique individuals.

    view   — "gene-per-dx" | "dx-per-gene" | "heatmap"
    top_n  — 0 means "all"
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

    gene_totals = {g: _count(by_gene[g]) for g in all_genes}
    dx_totals = {d: _count(by_dx[d]) for d in all_dx}

    if view == "heatmap":
        top_genes = [g for g, _ in sorted_entries(gene_totals)[: top_n or len(all_genes)]]
        top_dx = [d for d, _ in sorted_entries(dx_totals)[: top_n or len(all_dx)]]
        matrix = [
            [_count([r for r in by_gene[g] if r["disease"] == d]) for d in top_dx]
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
                "data": [_count([r for r in by_dx[pk] if r["gene"] == s]) for pk in primary],
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
                "data": [_count([r for r in by_gene[pk] if r["disease"] == s]) for pk in primary],
            }
            for s in secondary
        ]

    return {
        "view": view,
        "empty": False,
        "primary_keys": primary,
        "datasets": datasets,
    }
