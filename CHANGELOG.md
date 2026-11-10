# Changelog

All notable changes to the Cohort Browser are documented here.
This file is shown to users on the **About** tab of the deployed site.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

First round of reviewer feedback.

### Added

- **Phenotypic Features: Diagnosis × Phenotype explorer** with three views: diagnoses within each of the top-N features (stacked bars), the top-N features within one chosen diagnosis (share of that diagnosis' individuals), and a feature × diagnosis heatmap (colour = share within diagnosis, number = individuals).
- **Phenotypic Features over time:** the cumulative (ECDF) curve now uses the whole cohort (or the whole sex / diagnosis group) as 100 % by default, so it plateaus at the share of individuals that have the feature; a checkbox switches back to the classic ECDF of individuals with the feature.
- **Individual Browser:** list rows show *Living (current age)* or *Deceased (age at death)* instead of the ambiguous age at last encounter; the detail panel gains the matching age row.

### Changed

- "Patients" is now "Individuals" throughout the interface.
- Horizontal top-N bar charts (diagnoses, genes, HPO terms, diseases) list the most frequent entry at the top, matching the tables below them.
- **Genes tab renamed to Genetic Variation.** All its counts are unique individuals: the ambiguous *Records* column (Gene Summary) and the *by records* explorer option are gone, and the stat card now shows *Unique Variants*.
- **Gene × Variant table** lists each unique gene + HGVS + zygosity combination once, with the number of individuals carrying it (and the diagnoses, ACMG class and status seen with it), instead of one row per genomic interpretation.
- Phenotypic Features table: the mostly empty *Most Common Severity* column was removed.
- Demographics: *Median Age at Encounter* is now labelled *Median Age at Last Encounter*.
- Individual Browser: phenotypic features are listed one per row with their onset (like the diseases list), sorted by onset, excluded features at the bottom; measurements are in chronological order.
- Example cohort: interpretation progress is now consistent with its variant (no more UNSOLVED cases with a pathogenic causative variant), zygosity GENO ids match their labels, synthetic HGVS strings never read `X>X`, recurrent variants appear in several individuals, and deceased individuals carry a time of death.

### Fixed

- Measurements: the 5–95th-percentile band of the value-distribution box plots started at the 25th percentile, so its left half was missing.

### Removed

- `prototype_html_file/` (the original single-file viewer the modular app was ported from) and the stale "update this URL" note in `config.js`.

## [0.1.1] — 2026-08-20

### Added

- Installable app: open the site once, then "Install" (Chrome/Edge) or "Add to Dock" (Safari) — the browser becomes a normal app icon and works fully offline (the whole app, including the Python runtime and the example cohort, is pre-cached on first visit).
- Opening `index.html` directly from disk now shows friendly start instructions instead of a dead "engine starting…" screen.
- Content-Security-Policy: the browser itself blocks any network request to anything except the site's own origin — loaded data cannot be transmitted anywhere.
- Fonts are self-hosted: the site makes zero third-party requests of any kind.
- Vendored Pyodide runtime and Chart.js (no CDN dependency).

### Fixed

- Python engine probe can no longer be wedged by a stale cached 404, and works offline.
- Offline bundle zip preserves execute permissions on its start scripts.

## [0.1.0] — 2026-08-19

### Added

- First modular release, ported from the original single-file HTML viewer.
- All seven original tabs: Demographics, Diagnoses, Genes (incl. Gene × Diagnosis brwoser), Phenotypic Features (incl. onset-over-time), Diseases, Measurements (incl. box plots, per-assay distributions, measurements-over-time) and Patient Browser.
- Statistics engine rewritten in Python (`app/py/cohort_stats/`), executed in the browser via Pyodide — data still never leaves the user's machine.
- About tab with version history (this file) and privacy notes.
- "Load example cohort" button with 40 fully synthetic phenopackets.
- Offline support after first visit (service worker caches the app and the Python runtime).
- Test suite (pytest) covering every statistics function; CI runs it on every push.
- Automatic deployment to GitHub Pages on every push to `main`.
- Content-Security-Policy: the browser itself now blocks any network request to anything except the site's own origin (`connect-src 'self'`, `form-action 'none'`) — a browser-enforced guarantee that loaded data cannot be transmitted anywhere.
- Fonts are now self-hosted (no more Google Fonts request): the site makes zero third-party requests of any kind.

### Changed

- Unique-diagnosis count in the header now ignores interpretations without a disease id (previously these could inflate the count by one).
- Histograms no longer break when every value falls on a single bin boundary.
