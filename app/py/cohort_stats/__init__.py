"""cohort_stats — descriptive statistics for phenopacket cohorts.

This package is the *only* place statistics live.  It runs in two worlds:

* in the browser via Pyodide (the live site — data never leaves the user's
  machine), and
* in CPython for pytest / scripts / notebooks.

HOW TO ADD A NEW TAB
────────────────────
1. Create ``cohort_stats/mytab.py`` with a ``compute(packets) -> dict``.
2. Register it in ``TAB_COMPUTES`` below.
3. Create ``app/js/tabs/mytab.js`` that renders the dict (copy an existing
   tab as a template) and add one import line in ``app/js/tabs/index.js``.
4. Add the new file to ``app/py/manifest.json``.
That's it — push to main and the deployed site picks it up.

Interactive controls (dropdowns etc.) call back into Python through the
``API`` registry via ``api(fn_name, args_json)``.
"""

from __future__ import annotations

import json

from . import demographics, diagnoses, diseases, genes, measurements, phenotypes
from .utils import encounter_age_years, median_of, sanitize

__version__ = "0.1.0"

# ── Cohort state (loaded once per session) ─────────────────────────────────

_PACKETS: list = []


def load_cohort(packets_json: str) -> str:
    """Parse and store the cohort. Accepts a JSON array of phenopackets.

    Returns header-bar stats as JSON.
    """
    global _PACKETS
    parsed = json.loads(packets_json)
    if not isinstance(parsed, list):
        raise ValueError("Expected a JSON array of phenopackets")
    _PACKETS = parsed
    return json.dumps(sanitize(header_stats(_PACKETS)))


def get_packets() -> list:
    return _PACKETS


# ── Header pills ───────────────────────────────────────────────────────────

def header_stats(packets: list) -> dict:
    ages = sorted(
        a for a in (encounter_age_years(p) for p in packets) if a is not None
    )
    unique_dx = {
        ((i.get("diagnosis") or {}).get("disease") or {}).get("id")
        for p in packets
        for i in (p.get("interpretations") or [])
    }
    unique_dx.discard(None)
    return {
        "n_patients": len(packets),
        "median_age": median_of(ages),
        "n_unique_dx": len(unique_dx),
    }


# ── Per-tab compute registry ───────────────────────────────────────────────

TAB_COMPUTES = {
    "demographics": demographics.compute,
    "diagnoses": diagnoses.compute,
    "genes": genes.compute,
    "phenotypes": phenotypes.compute,
    "diseases": diseases.compute,
    "measurements": measurements.compute,
}


def compute_all(packets: list | None = None) -> dict:
    """Run every registered tab computation. Used by the front end and tests."""
    packets = _PACKETS if packets is None else packets
    result = {name: fn(packets) for name, fn in TAB_COMPUTES.items()}
    result["header"] = header_stats(packets)
    return result


# ── Interactive API (called from JS when a dropdown changes) ───────────────

API = {
    "gene_dx_explorer": lambda **kw: genes.explorer(_PACKETS, **kw),
    "pheno_over_time": lambda **kw: phenotypes.over_time(_PACKETS, **kw),
    "meas_over_time": lambda **kw: measurements.over_time(_PACKETS, **kw),
    "assay_detail": lambda **kw: measurements.assay_detail(_PACKETS, **kw),
}


def api(fn_name: str, args_json: str = "{}") -> str:
    """Generic JSON-in / JSON-out dispatcher used by the JS bridge."""
    fn = API[fn_name]
    return json.dumps(sanitize(fn(**json.loads(args_json))))


def compute_all_json() -> str:
    return json.dumps(sanitize(compute_all()))
