#!/usr/bin/env python3
"""Generate a small SYNTHETIC example cohort of phenopackets.

Entirely fabricated data — no real patients. Used for the "Load example
cohort" button, the e2e test, and as fixtures for pytest.

Run from the repo root:  python tools/make_example_cohort.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "examples"

DISEASES = [
    ("MONDO:0007959", "common variable immunodeficiency"),
    ("MONDO:0010481", "X-linked agammaglobulinemia"),
    ("MONDO:0018613", "severe combined immunodeficiency"),
    ("MONDO:0009459", "chronic granulomatous disease"),
    ("MONDO:0018396", "Wiskott-Aldrich syndrome"),
    ("MONDO:0011073", "hyper-IgM syndrome"),
]

GENES = [
    ("HGNC:12765", "BTK"), ("HGNC:11189", "TNFRSF13B"), ("HGNC:6010", "IL2RG"),
    ("HGNC:2732", "CYBB"), ("HGNC:12731", "WAS"), ("HGNC:11919", "CD40LG"),
    ("HGNC:9840", "RAG1"), ("HGNC:29851", "NFKB1"),
]

HPO = [
    ("HP:0002205", "Recurrent respiratory infections"),
    ("HP:0002721", "Immunodeficiency"),
    ("HP:0012649", "Increased inflammatory response"),
    ("HP:0002090", "Pneumonia"),
    ("HP:0000964", "Eczema"),
    ("HP:0001873", "Thrombocytopenia"),
    ("HP:0002715", "Abnormality of the immune system"),
    ("HP:0004313", "Decreased circulating antibody concentration"),
    ("HP:0100806", "Sepsis"),
    ("HP:0002960", "Autoimmunity"),
]

ASSAYS = [
    ("LOINC:2472-9", "IgG [Mass/volume] in Serum", "mg/dL", 200, 1600),
    ("LOINC:2458-8", "IgA [Mass/volume] in Serum", "mg/dL", 10, 400),
    ("LOINC:2464-6", "IgM [Mass/volume] in Serum", "mg/dL", 20, 250),
    ("LOINC:8124-0", "CD19 cells [#/volume] in Blood", "cells/uL", 5, 500),
    ("LOINC:8122-4", "CD4 cells [#/volume] in Blood", "cells/uL", 100, 1500),
    ("LOINC:26474-7", "Lymphocytes [#/volume] in Blood", "10*3/uL", 0.4, 4.5),
]

ACMG = ["PATHOGENIC", "PATHOGENIC", "LIKELY_PATHOGENIC", "UNCERTAIN_SIGNIFICANCE"]
STATUS = ["CAUSATIVE", "CAUSATIVE", "CONTRIBUTORY", "CANDIDATE"]
SEVERITIES = ["Mild", "Moderate", "Severe"]

# GENO ids that actually match their zygosity labels
ZYGOSITY = [
    ("GENO:0000136", "homozygous"),
    ("GENO:0000135", "heterozygous"),
    ("GENO:0000134", "hemizygous"),
]


def progress_status(rng: random.Random, acmg: str, status: str) -> str:
    """Interpretation progress that is consistent with its variant.

    A pathogenic / likely-pathogenic *causative* variant means the case is
    SOLVED; a VUS or a mere candidate can only be IN_PROGRESS or UNSOLVED.
    """
    if acmg in ("PATHOGENIC", "LIKELY_PATHOGENIC") and status == "CAUSATIVE":
        return "SOLVED"
    if acmg in ("PATHOGENIC", "LIKELY_PATHOGENIC") and status == "CONTRIBUTORY":
        return rng.choice(["SOLVED", "IN_PROGRESS"])
    return rng.choice(["IN_PROGRESS", "UNSOLVED"])


def make_hgvs(rng: random.Random) -> str:
    ref = rng.choice("ACGT")
    alt = rng.choice([b for b in "ACGT" if b != ref])  # never ref>ref
    return (f"NM_0000{rng.randint(10, 99)}.{rng.randint(1, 9)}:"
            f"c.{rng.randint(1, 3000)}{ref}>{alt}")


def make_variant_pool(rng: random.Random, n_per_gene: int = 3) -> dict:
    """A few recurrent variants per gene, so the cohort contains individuals
    sharing the same variant (the Gene × Variant table then shows
    frequencies > 1 instead of a flat list of singletons)."""
    return {sym: [make_hgvs(rng) for _ in range(n_per_gene)] for _, sym in GENES}


def make_packet(rng: random.Random, i: int, variant_pool: dict) -> dict:
    disease = rng.choice(DISEASES)
    gene = rng.choice(GENES)
    # ~70 % of individuals carry one of the gene's recurrent variants
    hgvs = rng.choice(variant_pool[gene[1]]) if rng.random() < 0.7 else make_hgvs(rng)
    zygosity_id, zygosity_label = rng.choice(ZYGOSITY)
    acmg = rng.choice(ACMG)
    status = rng.choice(STATUS)
    deceased = rng.random() < 0.08
    sex = rng.choice(["MALE", "FEMALE", "MALE", "FEMALE", "UNKNOWN"])
    birth_year = rng.randint(1955, 2020)
    dob = f"{birth_year:04d}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
    age_enc_y = min(rng.randint(1, 60), 2025 - birth_year)
    age_enc_m = rng.randint(0, 11)

    features = []
    for hpo_id, hpo_label in rng.sample(HPO, rng.randint(2, 6)):
        feature = {"type": {"id": hpo_id, "label": hpo_label}}
        if rng.random() < 0.15:
            feature["excluded"] = True
        else:
            if rng.random() < 0.7:
                onset = max(0, rng.randint(0, age_enc_y))
                feature["onset"] = {"age": {"iso8601duration": f"P{onset}Y{rng.randint(0, 11)}M"}}
            if rng.random() < 0.5:
                feature["severity"] = {
                    "id": "HP:0012825", "label": rng.choice(SEVERITIES)
                }
        features.append(feature)

    measurements = []
    for assay_id, assay_label, unit, lo, hi in rng.sample(ASSAYS, rng.randint(2, 5)):
        for _ in range(rng.randint(1, 4)):
            age_at = rng.randint(0, age_enc_y)
            measurements.append({
                "assay": {"id": assay_id, "label": assay_label},
                "value": {"quantity": {
                    "unit": {"id": f"UCUM:{unit}", "label": unit},
                    "value": round(rng.uniform(lo, hi), 2),
                }},
                "timeObserved": {"age": {"iso8601duration": f"P{age_at}Y{rng.randint(0, 11)}M"}},
            })

    onset_years = rng.randint(0, max(1, age_enc_y - 1))
    vital_status = {"status": "ALIVE"}
    if deceased:
        # the last encounter is the time of death
        vital_status = {
            "status": "DECEASED",
            "timeOfDeath": {"age": {"iso8601duration": f"P{age_enc_y}Y{age_enc_m}M"}},
        }
    packet = {
        "id": f"example-{i:03d}",
        "subject": {
            "id": f"PAT-{i:04d}",
            "sex": sex,
            "dateOfBirth": dob,
            "timeAtLastEncounter": {"age": {"iso8601duration": f"P{age_enc_y}Y{age_enc_m}M"}},
            "vitalStatus": vital_status,
        },
        "phenotypicFeatures": features,
        "diseases": [{
            "term": {"id": disease[0], "label": disease[1]},
            "onset": {"age": {"iso8601duration": f"P{onset_years}Y"}},
        }],
        "interpretations": [{
            "id": f"interp-{i:03d}",
            "progressStatus": progress_status(rng, acmg, status),
            "diagnosis": {
                "disease": {"id": disease[0], "label": disease[1]},
                "genomicInterpretations": [{
                    "subjectOrBiosampleId": f"PAT-{i:04d}",
                    "interpretationStatus": status,
                    "variantInterpretation": {
                        "acmgPathogenicityClassification": acmg,
                        "variationDescriptor": {
                            "geneContext": {"valueId": gene[0], "symbol": gene[1]},
                            "expressions": [{"syntax": "hgvs.c", "value": hgvs}],
                            "allelicState": {"id": zygosity_id, "label": zygosity_label},
                        },
                    },
                }],
            },
        }],
        "measurements": measurements,
        "metaData": {
            "created": "2026-01-01T00:00:00Z",
            "createdBy": "make_example_cohort.py (synthetic data)",
            "phenopacketSchemaVersion": "2.0.0",
        },
    }
    return packet


def main() -> None:
    rng = random.Random(42)  # deterministic
    variant_pool = make_variant_pool(rng)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("example-*.json"):
        old.unlink()
    names = []
    for i in range(1, 41):
        packet = make_packet(rng, i, variant_pool)
        name = f"example-{i:03d}.json"
        (OUT / name).write_text(json.dumps(packet, indent=2))
        names.append(name)
    (OUT / "manifest.json").write_text(json.dumps(names, indent=2))
    print(f"Wrote {len(names)} synthetic phenopackets to {OUT}")


if __name__ == "__main__":
    main()
