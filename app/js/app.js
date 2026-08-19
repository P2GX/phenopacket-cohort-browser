// App bootstrap: file loading, Python engine startup, tab orchestration.

import './tabs/index.js'; // registers all tabs
import { buildShell, renderAll } from './core/registry.js';
import { destroyAllCharts } from './core/charts.js';
import { initPython, loadCohort, computeAll } from './core/pybridge.js';
import { REPO_URL, SITE_NAME, SITE_NAME_ACCENT } from './config.js';

const app = {
  packets: [],   // raw phenopackets (JS objects) — used by presentation-only tabs
  payload: null, // full Python compute_all() output
};

// ── Loading overlay ────────────────────────────────────────────────────────
const tick = () => new Promise(r => setTimeout(r, 30));
const showLoading = msg => { document.getElementById('loading').style.display = 'flex'; updateLoading(msg); };
const updateLoading = msg => { document.getElementById('loading-msg').textContent = msg; };
const hideLoading = () => { document.getElementById('loading').style.display = 'none'; };

// ── Python engine status on the landing page ───────────────────────────────
const pyStatus = document.getElementById('py-status');
const pythonReady = initPython(msg => {
  pyStatus.innerHTML = `<span class="dot"></span>Python engine: ${msg}`;
  if (msg === 'ready') pyStatus.classList.add('ready');
});
pythonReady.catch(err => {
  pyStatus.innerHTML = `<span class="dot"></span>Python engine failed to load — check your connection and reload. (${err.message})`;
});

// ── File loading ───────────────────────────────────────────────────────────
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');

dropArea.addEventListener('click', () => fileInput.click());
document.getElementById('btn-select').addEventListener('click', () => fileInput.click());
dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
dropArea.addEventListener('drop', e => {
  e.preventDefault(); dropArea.classList.remove('drag-over');
  loadFiles([...e.dataTransfer.files]);
});
fileInput.addEventListener('change', () => loadFiles([...fileInput.files]));

document.getElementById('btn-example').addEventListener('click', loadExampleCohort);
document.getElementById('btn-reset').addEventListener('click', resetApp);

async function loadFiles(files) {
  const jsonFiles = files.filter(f => f.name.endsWith('.json'));
  if (!jsonFiles.length) { alert('No JSON files found.'); return; }

  showLoading(`Parsing ${jsonFiles.length.toLocaleString()} phenopackets…`);
  await tick();

  const packets = [];
  const texts = [];
  for (let i = 0; i < jsonFiles.length; i++) {
    if (i % 500 === 0) {
      updateLoading(`Parsing… ${i.toLocaleString()} / ${jsonFiles.length.toLocaleString()}`);
      await tick();
    }
    try {
      const text = await jsonFiles[i].text();
      packets.push(JSON.parse(text)); // validates
      texts.push(text);
    } catch (e) { /* skip bad files */ }
  }
  await ingest(packets, texts);
}

async function loadExampleCohort() {
  showLoading('Loading example cohort…');
  try {
    const manifest = await (await fetch('examples/manifest.json')).json();
    const texts = await Promise.all(
      manifest.map(name => fetch(`examples/${name}`).then(r => r.text()))
    );
    await ingest(texts.map(t => JSON.parse(t)), texts);
  } catch (err) {
    hideLoading();
    alert('Could not load the example cohort: ' + err.message);
  }
}

async function ingest(packets, texts) {
  if (!packets.length) { hideLoading(); alert('No valid phenopackets found.'); return; }

  updateLoading('Starting Python engine…');
  await pythonReady;

  updateLoading('Computing statistics…');
  await tick();

  app.packets = packets;
  await loadCohort('[' + texts.join(',') + ']');
  app.payload = await computeAll();

  updateLoading('Building charts…');
  await tick();

  buildShell();
  renderAll(app.payload, app);
  updateHeaderStats(app.payload.header);

  hideLoading();
  document.getElementById('dropzone').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

function updateHeaderStats(h) {
  document.getElementById('cohort-stats').innerHTML = `
    <div class="stat-pill"><strong>${h.n_patients.toLocaleString()}</strong> patients</div>
    <div class="stat-pill">median age <strong>${h.median_age !== null ? h.median_age.toFixed(1) + 'y' : '—'}</strong></div>
    <div class="stat-pill"><strong>${h.n_unique_dx}</strong> unique diagnoses</div>`;
}

function resetApp() {
  app.packets = [];
  app.payload = null;
  destroyAllCharts();
  fileInput.value = '';
  document.getElementById('dropzone').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// ── Branding + version stamp on the landing page ───────────────────────────
document.getElementById('dz-title').innerHTML = `${SITE_NAME}<br><em>${SITE_NAME_ACCENT}</em>`;
document.getElementById('hdr-title').innerHTML = `${SITE_NAME} <span>${SITE_NAME_ACCENT}</span>`;
(async () => {
  try {
    const v = await (await fetch('version.json')).json();
    document.getElementById('dz-version').textContent = `v${v.version}`;
  } catch { /* dev build */ }
  const repoA = document.getElementById('dz-repo');
  repoA.href = REPO_URL;
})();

// ── Offline support (cache app + Python engine after first visit) ──────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ });
}
