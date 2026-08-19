// Phenotypic Features tab — HPO terms table/chart + onset-over-time explorer.

import { charts, destroyChart, hbar, barCell, GD_PALETTE, calibriFont } from '../core/charts.js';
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
      { key: 'count', label: 'Patients', render: r => barCell(r.count, r.pct, '#fc8d59') },
      { key: 'median_onset', label: 'Median Onset', render: r => fmtYears(r.median_onset) },
      { key: 'top_severity', label: 'Most Common Severity', render: r => r.top_severity ? esc(r.top_severity) : '<span class="no-data">—</span>' },
    ];
    renderTable('tbl-phenotypes', ph.table, cols,
      { defaultSort: 'count', defaultDir: 'desc', searchKeys: ['label', 'id'] });

    // ── Over-time selector ──
    const sel = document.getElementById('pheno-term-select');
    sel.innerHTML = '<option value="">— select HPO term —</option>' +
      ph.table.map(h =>
        `<option value="${esc(h.id)}" ${!h.has_onset ? 'style="color:#94a3b8"' : ''}>${esc(h.label)}${!h.has_onset ? ' (no onset data)' : ''} (n=${h.count})</option>`).join('');
    if (!ph.any_onset) {
      document.getElementById('pheno-time-info').textContent =
        'No onset ages recorded yet. Charts will appear automatically once onset data is available.';
    }
    ['pheno-term-select', 'pheno-group-select', 'pheno-mode-select'].forEach(id =>
      document.getElementById(id).addEventListener('change', buildOverTime));
  },
};

async function buildOverTime() {
  const termId = document.getElementById('pheno-term-select')?.value;
  const groupBy = document.getElementById('pheno-group-select')?.value || 'cohort';
  const mode = document.getElementById('pheno-mode-select')?.value || 'histogram';
  const infoEl = document.getElementById('pheno-time-info');
  const legendEl = document.getElementById('pheno-time-legend');

  if (!termId) {
    destroyChart('pheno-time');
    infoEl.textContent = '';
    legendEl.innerHTML = '';
    return;
  }

  const data = await callApi('pheno_over_time', { term_id: termId, group_by: groupBy });

  if (data.empty) {
    destroyChart('pheno-time');
    infoEl.textContent = 'No onset age data for this term.';
    legendEl.innerHTML = '';
    return;
  }

  infoEl.textContent =
    `${data.n_records} records with onset age across ${data.n_patients} patients`;

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
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} patients` } },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#94a3b8', font: calibriFont }, grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: 'Onset age (years)', color: '#7a8694', font: calibriFont } },
          y: { stacked: true, ticks: { color: '#94a3b8', font: calibriFont }, grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: 'Patients', color: '#7a8694', font: calibriFont } },
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
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(1)} yr → ${ctx.parsed.y.toFixed(1)}% of cases` } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: calibriFont }, grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: 'Onset age (years)', color: '#7a8694', font: calibriFont } },
          y: { min: 0, max: 100,
               ticks: { color: '#94a3b8', font: calibriFont, callback: v => v + '%' },
               grid: { color: 'rgba(0,0,0,.06)' },
               title: { display: true, text: 'Cumulative %', color: '#7a8694', font: calibriFont } },
        },
      },
    });
  }

  legendEl.innerHTML = data.groups.map((grp, gi) => `
    <span style="display:inline-flex;align-items:center;gap:5px">
      <span style="width:12px;height:12px;border-radius:50%;background:${GD_PALETTE[gi % GD_PALETTE.length]};flex-shrink:0"></span>
      <span style="font-family:var(--font-num)">${esc(grp.name)}</span>
      <span style="color:var(--muted)">(n=${grp.n})</span>
    </span>`).join('');
}
