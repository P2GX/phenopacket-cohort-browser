# Changelog

All notable changes to the Cohort Browser are documented here.
This file is shown to users on the **About** tab of the deployed site.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).

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
