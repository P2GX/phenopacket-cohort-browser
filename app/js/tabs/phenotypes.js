// Phenotypic Features tab — HPO terms table/chart, Diagnosis × Phenotype
// explorer, and onset-over-time explorer. All counts are unique individuals.

import { charts, destroyChart, hbar, barCell, GD_PALETTE, calibriFont, NUM_FONT } from '../core/charts.js';
import { fmtYears, esc } from '../core/format.js';
import { renderTable } from '../core/tables.js';
import { callApi } from '../core/pybridge.js';

export default {
  id: 'phenotypes',
  label: 'Phenotypic Features',
  computeKey: 'phenotypes',

  render(section, ph) {
    section.innerHTML = `
      <div class="section-title">Phenotypic Features</div>
      <div class="section-subtitle">HPO-coded terms across the cohort</div>
      <div class="card" style="margin-bottom:20px">
        <h3>Top 30 HPO Terms</h3>
        <div class="chart-wrap" id="chart-hpo-wrap" style="height:360px"><canvas id="chart-hpo"></canvas></div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <h3>All HPO Terms</h3>
        <div id="tbl-phenotypes"></div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
          <div>
            <h3 style="margin-bottom:2px">Diagnosis × Phenotype Explorer</h3>
            <div style="font-size:11px;color:var(--muted)">How phenotypic features are distributed across diagnoses, and which features make up each diagnosis</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <select id="dp-view" class="rows-select">
              <option value="dx-per-term">Diagnoses within each Feature</option>
              <option value="term-per-dx">Features within one Diagnosis</option>
              <option value="heatmap">Feature × Diagnosis Heatmap</option>
            </select>
            <select id="dp-dx" class="rows-select" style="display:none;max-width:260px"></select>
            <select id="dp-top" class="rows-select">
              <option value="15">Top 15</option>
              <option value="25">Top 25</option>
              <option value="50">Top 50</option>
              <option value="0">All</option>
            </select>
          </div>
        </div>
        <div id="dp-info" style="font-size:11px;color:var(--muted);margin-bottom:8px"></div>
        <div id="dp-chart-wrap" style="position:relative;overflow-x:auto">
          <div id="dp-placeholder" style="text-align:center;padding:60px;color:var(--muted);font-size:12px">Loading…</div>
          <canvas id="chart-dx-pheno" style="display:none"></canvas>
          <div id="dp-heatmap" style="display:none;overflow-x:auto"></div>
        </div>
        <div id="dp-legend" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;font-size:11px"></div>
      </div>

      <div class="card" id="card-pheno-time">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
          <div>
            <h3 style="margin-bottom:2px">Phenotypic Features Over Time</h3>
            <div style="font-size:11px;color:var(--muted)">Onset age distribution per HPO term · select a term to explore</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <select id="pheno-term-select" class="rows-select" style="min-width:220px">
              <option value="">— select HPO term —</option>
            </select>
            <select id="pheno-group-select" class="rows-select">
              <option value="cohort">Whole cohort</option>
              <option value="sex">By sex</option>
              <option value="diagnosis">By diagnosis</option>
            </select>
            <select id="pheno-mode-select" class="rows-select">
              <option value="histogram">Histogram</option>
              <option value="scatter">Rug / scatter</option>
              <option value="ecdf">Cumulative (ECDF)</option>
            </select>
            <label id="pheno-ecdf-base-wrap" style="display:none;align-items:center;gap:6px;font-size:11px;color:var(--muted);cursor:pointer"
                   title="Checked: 100 % = every individual in the group, so the curve plateaus at the share that has this feature. Unchecked: 100 % = only individuals with this feature and an onset age (classic ECDF).">
              <input type="checkbox" id="pheno-ecdf-base" checked> 100 % = whole cohort
            </label>
          </div>
        </div>
        <div id="pheno-time-info" style="font-size:11px;color:var(--muted);margin-bottom:8px"></div>
        <div style="position:relative;height:300px"><canvas id="chart-pheno-time"></canvas></div>
        <div id="pheno-time-legend" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:11px"></div>
      </div>`;

    document.getElementById('chart-hpo-wrap').style.height =
      Math.max(200, ph.chart.labels.length * 22) + 'px';
    hbar('hpo', 'chart-hpo', ph.chart.labels, ph.chart.counts, '#fb923c');

    const cols = [
      { key: 'label', label: 'HPO Term', render: r => `<span>${esc(r.label)}</span>` },
      { key: 'id', label: 'HPO ID', render: r => `<span style="color:var(--muted);font-size:11px">${esc(r.id)}</span>` },
      { key: 'count', label: 'Individuals', render: r => barCell(r.count, r.pct, '#fc8d59') },
      { key: 'median_onset', label: 'Median Onset', render: r => fmtYears(r.median_onset) },
    ];
    renderTable('tbl-phenotypes', ph.table, cols,
      { defaultSort: 'count', defaultDir: 'desc', searchKeys: ['label', 'id'] });

    // ── Diagnosis × Phenotype explorer ──
    ['dp-view', 'dp-dx', 'dp-top'].forEach(id =>
      document.getElementById(id).addEventListener('change', buildDxPhenoExplorer));
    buildDxPhenoExplorer();

    // ── Over-time selector ──
    const sel = document.getElementById('pheno-term-select');
    sel.innerHTML = '<option value="">— select HPO term —</option>' +
      ph.table.map(h =>
        `<option value="${esc(h.id)}" ${!h.has_onset ? 'style="color:#94a3b8"' : ''}>${esc(h.label)}${!h.has_onset ? ' (no onset data)' : ''} (n=${h.count})</option>`).join('');
    if (!ph.any_onset) {
      document.getElementById('pheno-time-info').textContent =
        'No onset ages recorded yet. Charts will appear automatically once onset data is available.';
    }
    ['pheno-term-select', 'pheno-group-select', 'pheno-mode-select', 'pheno-ecdf-base'].forEach(id =>
      document.getElementById(id).addEventListener('change', buildOverTime));
  },
};

// ── Diagnosis × Phenotype explorer ─────────────────────────────────────────
async function buildDxPhenoExplorer() {
  const view = document.getElementById('dp-view')?.value || 'dx-per-term';
  const topN = parseInt(document.getElementById('dp-top')?.value || '15');
  const dxSel = document.getElementById('dp-dx');
  const diagnosis = dxSel.value || null;

  const chartEl = document.getElementById('chart-dx-pheno');
  const heatmapEl = document.getElementById('dp-heatmap');
  const phEl = document.getElementById('dp-placeholder');
  const legendEl = document.getElementById('dp-legend');
  const infoEl = document.getElementById('dp-info');

  dxSel.style.display = view === 'term-per-dx' ? '' : 'none';

  const data = await callApi('dx_pheno_explorer', { view, top_n: topN, diagnosis });

  if (data.empty) {
    phEl.textContent = 'No phenotypic feature data available.';
    phEl.style.display = 'block';
    chartEl.style.display = 'none';
    heatmapEl.style.display = 'none';
    legendEl.innerHTML = '';
    infoEl.textContent = '';
    return;
  }

  // (Re)populate the diagnosis dropdown without losing the current choice
  if (dxSel.options.length !== data.dx_options.length) {
    dxSel.innerHTML = data.dx_options.map(o =>
      `<option value="${esc(o.label)}">${esc(o.label)} (n=${o.n})</option>`).join('');
  }
  if (data.diagnosis) dxSel.value = data.diagnosis;

  destroyChart('dx-pheno');
  phEl.style.display = 'none';

  if (view === 'heatmap') {
    chartEl.style.display = 'none';
    heatmapEl.style.display = 'block';
    legendEl.innerHTML = '';
    infoEl.textContent = 'Cell = individuals with both the feature and the diagnosis · colour = share of that diagnosis’ individuals showing the feature';

    const { terms, diagnoses, matrix, pct, dx_totals } = data;
    const CELL = 36, LPAD = 230, TPAD = 120, CPAD = 8;
    const W = LPAD + diagnoses.length * CELL + CPAD;
    const H = TPAD + terms.length * CELL + CPAD;

    const cells = terms.flatMap((t, ti) => diagnoses.map((d, di) => {
      const v = matrix[ti][di];
      if (!v) return '';
      const intensity = pct[ti][di] / 100;
      const bg = `rgba(234,88,12,${(0.08 + intensity * 0.85).toFixed(2)})`;
      const tx = intensity > 0.55 ? '#fff' : '#1a2332';
      const x = LPAD + di * CELL, y = TPAD + ti * CELL;
      return `<rect x="${x}" y="${y}" width="${CELL - 2}" height="${CELL - 2}" rx="3" fill="${bg}">
                <title>${esc(t)} × ${esc(d)}: ${v} of ${dx_totals[di]} individuals (${pct[ti][di].toFixed(0)} %)</title>
              </rect>
              <text x="${x + CELL / 2 - 1}" y="${y + CELL / 2 + 4}" text-anchor="middle" font-size="10"
                fill="${tx}" font-family="${NUM_FONT}" pointer-events="none">${v}</text>`;
    })).join('');

    const tLabels = terms.map((t, i) => {
      const label = t.length > 34 ? t.slice(0, 33) + '…' : t;
      return `<text x="${LPAD - 6}" y="${TPAD + i * CELL + CELL / 2 + 4}" text-anchor="end" font-size="11"
        fill="#334155" font-family="${NUM_FONT}"><title>${esc(t)}</title>${esc(label)}</text>`;
    }).join('');

    const dLabels = diagnoses.map((d, i) => {
      const label = d.length > 20 ? d.slice(0, 19) + '…' : d;
      const x = LPAD + i * CELL + CELL / 2;
      return `<text x="${x}" y="${TPAD - 6}" text-anchor="start" font-size="10"
        fill="#334155" font-family="${NUM_FONT}"
        transform="rotate(-45,${x},${TPAD - 6})"><title>${esc(d)} (n=${dx_totals[i]})</title>${esc(label)}</text>`;
    }).join('');

    heatmapEl.innerHTML = `<svg width="${W}" height="${H}" style="min-width:${W}px">${tLabels}${dLabels}${cells}</svg>`;
    return;
  }

  heatmapEl.style.display = 'none';
  chartEl.style.display = 'block';

  if (view === 'term-per-dx') {
    // Horizontal bars: top-N features within the chosen diagnosis
    const labels = data.terms.map(t => t.label);
    const counts = data.terms.map(t => t.n);
    const pcts = data.terms.map(t => t.pct);
    infoEl.textContent = `${data.diagnosis} · ${data.n_dx} individuals · bar = share of them with the feature`;
    legendEl.innerHTML = '';

    chartEl.parentElement.style.height = Math.max(200, labels.length * 24 + 60) + 'px';
    charts['dx-pheno'] = new Chart(chartEl, {
      type: 'bar',
      data: { labels, datasets: [{ data: pcts, backgroundColor: '#fb923c', borderRadius: 3, borderSkipped: false }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${counts[ctx.dataIndex]} of ${data.n_dx} individuals (${ctx.raw.toFixed(1)} %)` } },
        },
        scales: {
          x: { min: 0, max: 100, ticks: { color: '#94a3b8', font: { size: 10, family: NUM_FONT }, callback: v => v + ' %' }, grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: `% of individuals with ${data.diagnosis}`, color: '#7a8694', font: { size: 10, family: NUM_FONT } } },
          y: { ticks: { color: '#334155', font: { size: 10, family: NUM_FONT } }, grid: { display: false } },
        },
      },
    });
    return;
  }

  // dx-per-term: stacked bars, x = top features, stacks = diagnoses
  infoEl.textContent = 'Each bar = individuals with the feature, split by their diagnosis (an individual with several diagnoses is counted in each)';
  const primaryKeys = data.primary_keys;
  const datasets = data.datasets.map((ds, si) => ({
    label: ds.label, data: ds.data,
    backgroundColor: GD_PALETTE[si % GD_PALETTE.length], borderWidth: 0,
  }));
  const barH = Math.max(28, Math.min(50, 700 / primaryKeys.length));
  chartEl.parentElement.style.height = Math.max(300, primaryKeys.length * barH + 60) + 'px';

  charts['dx-pheno'] = new Chart(chartEl, {
    type: 'bar',
    data: { labels: primaryKeys, datasets },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} individuals` } },
      },
      scales: {
        x: { stacked: true, ticks: { color: '#94a3b8', font: { size: 10, family: NUM_FONT } }, grid: { color: 'rgba(0,0,0,.06)' },
             title: { display: true, text: 'Unique individuals', color: '#7a8694', font: { size: 10, family: NUM_FONT } } },
        y: { stacked: true, ticks: { color: '#334155', font: { size: 10, family: NUM_FONT } }, grid: { display: false } },
      },
    },
  });

  legendEl.innerHTML = datasets.slice(0, 40).map((ds, si) => `
    <span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">
      <span style="width:10px;height:10px;border-radius:2px;background:${GD_PALETTE[si % GD_PALETTE.length]};flex-shrink:0"></span>
      <span style="font-family:var(--font-num);font-size:10px">${esc(ds.label.length > 30 ? ds.label.slice(0, 29) + '…' : ds.label)}</span>
    </span>`).join('') +
    (datasets.length > 40 ? `<span style="color:var(--muted);font-size:10px">+${datasets.length - 40} more</span>` : '');
}

// ── Onset over time ────────────────────────────────────────────────────────
async function buildOverTime() {
  const termId = document.getElementById('pheno-term-select')?.value;
  const groupBy = document.getElementById('pheno-group-select')?.value || 'cohort';
  const mode = document.getElementById('pheno-mode-select')?.value || 'histogram';
  const ecdfBase = document.getElementById('pheno-ecdf-base')?.checked ? 'cohort' : 'term';
  const infoEl = document.getElementById('pheno-time-info');
  const legendEl = document.getElementById('pheno-time-legend');

  document.getElementById('pheno-ecdf-base-wrap').style.display = mode === 'ecdf' ? 'inline-flex' : 'none';

  if (!termId) {
    destroyChart('pheno-time');
    infoEl.textContent = '';
    legendEl.innerHTML = '';
    return;
  }

  const data = await callApi('pheno_over_time', { term_id: termId, group_by: groupBy, ecdf_base: ecdfBase });

  if (data.empty) {
    destroyChart('pheno-time');
    infoEl.textContent = 'No onset age data for this term.';
    legendEl.innerHTML = '';
    return;
  }

  infoEl.textContent =
    `${data.n_records} records with onset age across ${data.n_patients} individuals`;

  destroyChart('pheno-time');
  const canvas = document.getElementById('chart-pheno-time');

  if (mode === 'histogram') {
    const datasets = data.groups.map((grp, gi) => ({
      label: grp.name, data: grp.bins,
      backgroundColor: GD_PALETTE[gi % GD_PALETTE.length], borderRadius: 2, borderSkipped: false,
    }));
    charts['pheno-time'] = new Chart(canvas, {
      type: 'bar', data: { labels: data.hist_labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} individuals` } },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#94a3b8', font: calibriFont }, grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: 'Onset age (years)', color: '#7a8694', font: calibriFont } },
          y: { stacked: true, ticks: { color: '#94a3b8', font: calibriFont }, grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: 'Individuals', color: '#7a8694', font: calibriFont } },
        },
      },
    });
  } else if (mode === 'scatter') {
    const datasets = data.groups.map((grp, gi) => ({
      label: grp.name,
      data: grp.ages.map(a => ({ x: a, y: gi + (Math.random() - 0.5) * 0.5 })),
      backgroundColor: GD_PALETTE[gi % GD_PALETTE.length] + '99',
      borderColor: GD_PALETTE[gi % GD_PALETTE.length],
      pointRadius: 5, pointHoverRadius: 7, borderWidth: 1,
    }));
    charts['pheno-time'] = new Chart(canvas, {
      type: 'scatter', data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: age ${ctx.parsed.x.toFixed(1)} yr` } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: calibriFont }, grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: 'Onset age (years)', color: '#7a8694', font: calibriFont } },
          y: { ticks: { display: false }, grid: { display: false },
               min: -0.8, max: data.groups.length - 0.2 },
        },
      },
    });
  } else { // ecdf
    const yTitle = data.ecdf_base === 'cohort'
      ? 'Cumulative % of all individuals in group'
      : 'Cumulative % of individuals with this feature';
    const datasets = data.groups.map((grp, gi) => ({
      label: grp.name,
      data: grp.ecdf,
      borderColor: GD_PALETTE[gi % GD_PALETTE.length],
      backgroundColor: 'transparent',
      borderWidth: 2.5, pointRadius: 0, tension: 0, stepped: true,
      type: 'line',
    }));
    charts['pheno-time'] = new Chart(canvas, {
      type: 'scatter', data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(1)} yr → ${ctx.parsed.y.toFixed(1)} %` } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: calibriFont }, grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: 'Onset age (years)', color: '#7a8694', font: calibriFont } },
          y: { min: 0, max: 100,
               ticks: { color: '#94a3b8', font: calibriFont, callback: v => v + '%' },
               grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: yTitle, color: '#7a8694', font: calibriFont } },
        },
      },
    });
  }

  legendEl.innerHTML = data.groups.map((grp, gi) => `
    <span style="display:inline-flex;align-items:center;gap:5px">
      <span style="width:12px;height:12px;border-radius:50%;background:${GD_PALETTE[gi % GD_PALETTE.length]};flex-shrink:0"></span>
      <span style="font-family:var(--font-num)">${esc(grp.name)}</span>
      <span style="color:var(--muted)">(n=${grp.n}${mode === 'ecdf' && data.ecdf_base === 'cohort' ? ` of ${grp.group_size}` : ''})</span>
    </span>`).join('');
}
