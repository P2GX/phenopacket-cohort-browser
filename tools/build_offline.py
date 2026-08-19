#!/usr/bin/env python3
"""Build a fully self-contained OFFLINE bundle of the Cohort Explorer.

The result (dist/cohort-explorer-offline.zip) contains the whole site plus a
vendored Pyodide runtime, so it runs on a machine with no internet access at
all — e.g. inside a hospital network. Browsers won't run WebAssembly from
file:// URLs, so the bundle ships tiny start scripts that serve it locally
(they only need any Python 3 — no packages).

Usage:  python tools/build_offline.py
"""

from __future__ import annotations

import io
import shutil
import tarfile
import urllib.request
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
APP = REPO / "app"
DIST = REPO / "dist"
STAGE = DIST / "cohort-explorer-offline"

# Keep in sync with PYODIDE_VERSION in app/js/core/pybridge.js
PYODIDE_VERSION = "314.0.5"

# Files the runtime needs from the pyodide npm package
PYODIDE_FILES = None  # None = take everything in the package's root


def fetch_pyodide(dest: Path) -> None:
    """Download the pyodide npm tarball and unpack the runtime files."""
    url = f"https://registry.npmjs.org/pyodide/-/pyodide-{PYODIDE_VERSION}.tgz"
    print(f"Downloading Pyodide {PYODIDE_VERSION} …")
    data = urllib.request.urlopen(url, timeout=300).read()
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            rel = Path(member.name)
            if rel.parts[0] == "package":
                rel = Path(*rel.parts[1:])
            if rel.name in {"package.json", "README.md", "LICENSE"} or rel.suffix in {".ts", ".map"}:
                continue
            if len(rel.parts) != 1:
                continue  # runtime files live flat in the package root
            out = dest / rel.name
            fh = tar.extractfile(member)
            out.write_bytes(fh.read())
    print(f"  → {sum(1 for _ in dest.iterdir())} files, "
          f"{sum(f.stat().st_size for f in dest.iterdir()) / 1e6:.1f} MB")


SERVE_PY = '''#!/usr/bin/env python3
"""Serve the offline Cohort Explorer at http://localhost:8321/ (no internet needed)."""
import http.server, os, webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 8321


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
    }


print(f"Cohort Explorer running at http://localhost:{PORT}/  —  Ctrl+C to stop")
webbrowser.open(f"http://localhost:{PORT}/")
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
'''

START_MAC = '''#!/bin/bash
cd "$(dirname "$0")"
python3 serve.py
'''

START_WIN = '''@echo off
cd /d "%~dp0"
py serve.py || python serve.py
pause
'''

README_OFFLINE = '''OFFLINE Cohort Explorer
=======================

This folder is a fully self-contained copy of the Cohort Explorer.
It needs NO internet connection — the Python engine (Pyodide) is included.

To start it (any Python 3 must be installed, nothing else):

  * macOS:    double-click  START_MAC.command
              (first time: right-click → Open, or run `bash START_MAC.command`)
  * Windows:  double-click  START_WINDOWS.bat
  * Any OS:   python3 serve.py

Your browser opens http://localhost:8321/ — drop your phenopacket JSON
files there. All processing happens locally; nothing is ever uploaded.

(Why a start script? Browsers refuse to run WebAssembly from file://
pages, so the app has to be served from localhost.)
'''


def main() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)

    # 1. site
    shutil.copytree(APP, STAGE, dirs_exist_ok=True)
    shutil.copy(REPO / "CHANGELOG.md", STAGE / "CHANGELOG.md")

    # 2. vendored Pyodide (pybridge.js auto-detects vendor/pyodide/).
    # The repo already ships it; download only if it's missing.
    pyodide_dir = STAGE / "vendor" / "pyodide"
    if not (pyodide_dir / "pyodide.js").exists():
        fetch_pyodide(pyodide_dir)
    else:
        print("Pyodide already vendored in app/vendor/pyodide — skipping download.")

    # 3. start scripts + readme
    (STAGE / "serve.py").write_text(SERVE_PY)
    (STAGE / "START_MAC.command").write_text(START_MAC)
    (STAGE / "START_MAC.command").chmod(0o755)
    (STAGE / "START_WINDOWS.bat").write_text(START_WIN)
    (STAGE / "README_OFFLINE.txt").write_text(README_OFFLINE)

    # 4. zip
    zip_path = DIST / "cohort-explorer-offline.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(STAGE.rglob("*")):
            if f.is_file():
                zf.write(f, Path("cohort-explorer-offline") / f.relative_to(STAGE))
    print(f"Wrote {zip_path}  ({zip_path.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
