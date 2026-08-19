// Bridge to the Python statistics engine (Pyodide / WebAssembly).
//
// Everything statistical happens in Python — this file only moves JSON
// strings across the JS↔Python boundary. Data NEVER leaves the browser:
// Pyodide is a Python interpreter compiled to WebAssembly that runs locally.
//
// Pyodide source: vendor/pyodide/ if present (offline bundle), else the CDN.

const PYODIDE_VERSION = '314.0.5';
const CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const LOCAL_BASE = 'vendor/pyodide/';

let pyodide = null;
let readyPromise = null;

async function detectBase() {
  try {
    // GET (not HEAD) so the response lands in the HTTP cache and the real
    // <script> load that follows is served from cache.
    const res = await fetch(LOCAL_BASE + 'pyodide.js', { cache: 'force-cache' });
    if (res.ok) return LOCAL_BASE;
  } catch (_) { /* fall through to CDN */ }
  return CDN_BASE;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function initPython(onStatus = () => {}) {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    onStatus('loading Python engine…');
    const base = await detectBase();
    await loadScript(base + 'pyodide.js');
    pyodide = await globalThis.loadPyodide({ indexURL: base });

    onStatus('loading statistics modules…');
    const manifest = await (await fetch('py/manifest.json')).json();
    pyodide.FS.mkdirTree('/app/cohort_stats');
    for (const path of manifest) {
      const src = await (await fetch(`py/${path}`)).text();
      pyodide.FS.writeFile(`/app/${path}`, src);
    }
    pyodide.runPython("import sys; sys.path.insert(0, '/app')");
    await pyodide.runPythonAsync('import cohort_stats');
    onStatus('ready');
    return pyodide;
  })();
  readyPromise.catch(() => { readyPromise = null; }); // allow retry on failure
  return readyPromise;
}

export function whenReady() {
  return initPython();
}

// Load a cohort (JSON array string of phenopackets); returns header stats.
export async function loadCohort(packetsJson) {
  await whenReady();
  pyodide.globals.set('_packets_json', packetsJson);
  const header = pyodide.runPython('cohort_stats.load_cohort(_packets_json)');
  return JSON.parse(header);
}

// Run every registered tab computation; returns the full payload object.
export async function computeAll() {
  await whenReady();
  return JSON.parse(pyodide.runPython('cohort_stats.compute_all_json()'));
}

// Call an interactive API function (dropdown changes etc.):
//   callApi('gene_dx_explorer', {view: 'heatmap', top_n: 15, metric: 'patients'})
export async function callApi(fn, args = {}) {
  await whenReady();
  pyodide.globals.set('_api_fn', fn);
  pyodide.globals.set('_api_args', JSON.stringify(args));
  return JSON.parse(pyodide.runPython('cohort_stats.api(_api_fn, _api_args)'));
}
