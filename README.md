<p align="center">
  <img src="logo.png" alt="Phenopacket Cohort Browser" width="640">
</p>

A privacy-preserving cohort explorer for [GA4GH phenopackets](https://phenopacket-schema.readthedocs.io/).
Drop phenopacket JSON files into the page and browse demographics, diagnoses,
genes, phenotypic features, diseases, measurements and individual patients —
**all statistics run inside the browser; no data is ever uploaded.**

The descriptive statistics are plain **Python** (`app/py/cohort_stats/`),
executed in the browser through [Pyodide](https://pyodide.org) (Python
compiled to WebAssembly). Edit a Python function, push to `main`, and the
live site updates automatically.

## Quick start (local)

```bash
git clone <this repo>
cd phenopacket-cohort-browser
python3 -m http.server 8000 --directory app
# open http://localhost:8000 and click "Load example cohort"
```

Run the tests:

```bash
pip install pytest ruff
pytest            # unit tests for every statistics function
ruff check .      # lint
```

## Repository layout

```
app/                     ← everything that gets deployed (the website)
  index.html             app shell (dropzone, header, nav)
  css/app.css            all styling (identical to the original viewer)
  js/
    app.js               bootstrap: file loading, Python startup
    config.js            ⚠️ set REPO_URL + site name here
    core/
      pybridge.js        JS ↔ Python (Pyodide) bridge
      registry.js        tab registry — add tabs here-ish (see below)
      tables.js          generic sortable/searchable/paginated table
      charts.js          Chart.js helpers (donut, hbar, histogram, palette)
      format.js          age/number formatting
    tabs/                one file per tab (rendering only, no statistics)
  py/cohort_stats/       ★ THE STATISTICS — plain Python, edit freely
    demographics.py … measurements.py
    __init__.py          compute registry + interactive API
  py/manifest.json       list of Python files the browser loads
  examples/              40 synthetic phenopackets (no real data)
  vendor/chart.umd.min.js
  version.json           version shown in the app — bump on release
  sw.js                  offline support (caches app + Python runtime)
tests/                   pytest suite for cohort_stats
tools/
  make_example_cohort.py regenerate the synthetic example data
  build_offline.py       build the fully-offline zip bundle
.github/workflows/
  ci.yml                 lint + tests on every push / PR
  deploy.yml             tests → deploy app/ to GitHub Pages on push to main
  offline-bundle.yml     attach offline zip to GitHub releases
CHANGELOG.md             version history — shown to users on the About tab
```

## How to change a statistic

Everything numerical lives in `app/py/cohort_stats/`. For example, the
median is currently the *upper* median (`sorted[n // 2]`, matching the
original viewer). To switch to an interpolated median, edit `median_of()`
in `utils.py` — every tab picks it up. Add a test in `tests/`, push, done.

## How to add a new tab

1. **Python** — create `app/py/cohort_stats/mytab.py`:

   ```python
   def compute(packets: list) -> dict:
       return {"n": len(packets)}
   ```

   Register it in `TAB_COMPUTES` in `app/py/cohort_stats/__init__.py`
   and add `"cohort_stats/mytab.py"` to `app/py/manifest.json`.

2. **JS** — create `app/js/tabs/mytab.js` (copy `diseases.js`, the smallest
   example) and register it in `app/js/tabs/index.js`.

3. Add a line to `CHANGELOG.md`, bump `app/version.json`, push to `main`.

Interactive controls (dropdowns that recompute) call Python through
`callApi('my_function', {...})` — register the function in `API` in
`__init__.py` (see the Gene × Diagnosis explorer for a worked example).

## Releases & version history

- Update `CHANGELOG.md` (users see it on the **About** tab) and
  `app/version.json` with every meaningful change.
- For a tagged release: `git tag v0.2.0 && git push --tags`, then create a
  GitHub release — CI attaches the offline bundle automatically.

## Privacy & offline use

- **Nothing is uploaded, ever.** Files are read with the browser's File API
  and analysed by Python-in-WebAssembly locally. The GitHub Pages server
  only serves the static app code. Hosting the viewer publicly does **not**
  put any patient data online.
- **Offline after first visit** — the service worker caches the app and the
  Python runtime, so the site keeps working without a connection.
- **Fully air-gapped use** — download `cohort-explorer-offline.zip` from the
  latest GitHub release (or run `python tools/build_offline.py`). It bundles
  the Python runtime and starts with a double-click; no internet required.

## License

MIT — see `LICENSE`.
