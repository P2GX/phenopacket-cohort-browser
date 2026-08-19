// Genes tab — renders app/py/cohort_stats/genes.py output, including the
// interactive Gene × Diagnosis explorer (recomputed in Python on demand).

import { charts, destroyChart, hbar, donut, barCell, GD_PALETTE, NUM_FONT } from '../core/charts.js';
import { esc } from '../core/format.js';
import { renderTable } from '../core/tables.js';
import { callApi } from '../core/pybridge.js';

const ACMG_COLORS = {
  PATHOGENIC: '#dc2626', LIKELY_PATHOGENIC: '#d97706',
  UNCERTAIN_SIGNIFICANCE: '#94a3b8', LIKELY_BENIGN: '#16a34a', BENIGN: '#2563eb',
};
const ACMG_BADGE = {
  PATHOGENIC: 'red', LIKELY_PATHOGENIC: 'orange', UNCERTAIN_SIGNIFICANCE: 'muted',
  LIKELY_BENIGN: 'green', BENIGN: 'blue',
};
const STATUS_BADGE = { CAUSATIVE: 'green', CONTRIBUTORY: 'orange', CANDIDATE: 'purple', UNCERTAIN: 'muted' };

const badge = (value, map) =>
  `<span class="badge badge-${map[value] || 'muted'}">${esc(String(value).replace(/_/g, ' '))}</span>`;

export default {
  id: 'genes',
  label: 'Genes',
  computeKey: 'genes',

  render(section, g) {
    section.innerHTML = `
      <div class="section-title">Genes</div>
      <div class="section-subtitle">HGNC-annotated genomic interpretations across the cohort</div>
      <div class="stat-cards" id="gene-stats"></div>
      <div class="grid-2" style="margin-bottom:20px">
        <div class="card">
          <h3>Top 20 Genes by Patient Count</h3>
          <div class="chart-wrap" style="height:300px"><canvas id="chart-genes"></canvas></div>
        </div>
        <div class="card">
          <h3>ACMG Classification</h3>
          <div class="donut-wrap" style="justify-content:center;padding:20px 0">
            <div style="width:160px;height:160px;flex-shrink:0"><canvas id="chart-acmg"></canvas></div>
            <div class="donut-legend" id="acmg-legend"></div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <h3>Gene Summary
          <span style="font-size:10px;color:var(--muted);text-transform:none;letter-spacing:0;margin-left:8px">one row per gene</span>
        </h3>
        <div id="tbl-gene-summary"></div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
          <div>
            <h3 style="margin-bottom:2px">Gene × Diagnosis Explorer</h3>
            <div style="font-size:11px;color:var(--muted)">Explore how genes and diagnoses relate across the cohort</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <select id="gd-view" class="rows-select">
              <option value="gene-per-dx">Genes within each Diagnosis</option>
              <option value="dx-per-gene">Diagnoses within each Gene</option>
              <option value="heatmap">Co-occurrence Heatmap</option>
            </select>
            <select id="gd-top" class="rows-select">
              <option value="15">Top 15</option>
              <option value="25">Top 25</option>
              <option value="50">Top 50</option>
              <option value="0">All</option>
            </select>
            <select id="gd-metric" class="rows-select">
              <option value="patients">by patients</option>
              <option value="records">by records</option>
            </select>
          </div>
        </div>
        <div id="gd-chart-wrap" style="position:relative;overflow-x:auto">
          <div id="gd-placeholder" style="text-align:center;padding:60px;color:var(--muted);font-size:12px">Loading…</div>
          <canvas id="chart-gene-dx" style="display:none"></canvas>
          <div id="gd-heatmap" style="display:none;overflow-x:auto"></div>
        </div>
        <div id="gd-legend" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;font-size:11px"></div>
      </div>
      <div class="card">
        <h3>Gene × Variant Table</h3>
        <div id="tbl-genes"></div>
      </div>`;

    // ── Stat cards ──
    const s = g.stats;
    document.getElementById('gene-stats').innerHTML = `
      <div class="stat-card"><div class="val" style="color:var(--accent)">${s.unique_genes.toLocaleString()}</div><div class="lbl">Unique Genes</div></div>
      <div class="stat-card"><div class="val" style="color:var(--green)">${s.unique_patients.toLocaleString()}</div><div class="lbl">Patients with Variants</div></div>
      <div class="stat-card"><div class="val" style="color:var(--purple)">${s.records.toLocaleString()}</div><div class="lbl">Total Records</div></div>
      <div class="stat-card"><div class="val" style="color:var(--orange)">${s.linked_dx.toLocaleString()}</div><div class="lbl">Linked Diagnoses</div></div>
      <div class="stat-card"><div class="val" style="color:var(--red)">${s.path_count.toLocaleString()}</div><div class="lbl">Path / Likely Path</div></div>`;

    hbar('genes', 'chart-genes', g.top20.labels, g.top20.counts, '#a78bfa', 'records');

    // ACMG donut with compact legend labels
    donut('acmg', 'chart-acmg', 'acmg-legend', g.acmg_counts, ACMG_COLORS, null);
    document.getElementById('acmg-legend').innerHTML = Object.keys(g.acmg_counts).map(l =>
      `<div class="legend-item"><div class="legend-dot" style="background:${ACMG_COLORS[l] || '#94a3b8'}"></div><span style="font-size:10px">${esc(l.replace(/_/g, ' '))}</span><span class="legend-val">${g.acmg_counts[l]}</span></div>`).join('');

    // ── Gene summary table ──
    const sumCols = [
      { key: 'gene', label: 'Gene', render: r => `<strong style="color:var(--accent)">${esc(r.gene)}</strong>` },
      { key: 'hgnc_id', label: 'HGNC', render: r => `<span style="color:var(--muted);font-size:11px">${esc(r.hgnc_id)}</span>` },
      { key: 'n_patients', label: 'Patients', render: r => barCell(r.n_patients, r.pct_patients, 'var(--purple)') },
      { key: 'records', label: 'Records', render: r => r.records },
      { key: 'n_diseases', label: '# Diagnoses', render: r => r.n_diseases },
      { key: 'diseases', label: 'Diagnoses', render: r => `<span style="font-size:11px">${esc(r.diseases)}</span>` },
      { key: 'top_acmg', label: 'Top ACMG', render: r => badge(r.top_acmg, ACMG_BADGE) },
      { key: 'acmg_break', label: 'ACMG Detail', render: r => `<span style="font-size:10px;color:var(--muted)">${esc(r.acmg_break)}</span>` },
    ];
    renderTable('tbl-gene-summary', g.gene_summary, sumCols,
      { defaultSort: 'n_patients', defaultDir: 'desc', searchKeys: ['gene', 'hgnc_id', 'diseases', 'top_acmg'] });

    // ── Gene × Variant table ──
    const varCols = [
      { key: 'gene', label: 'Gene', render: r => `<strong style="color:var(--accent)">${esc(r.gene)}</strong>` },
      { key: 'hgnc_id', label: 'HGNC', render: r => `<span style="color:var(--muted);font-size:11px">${esc(r.hgnc_id)}</span>` },
      { key: 'disease', label: 'Disease', render: r => `<span>${esc(r.disease)}</span>` },
      { key: 'acmg', label: 'ACMG', render: r => badge(r.acmg, ACMG_BADGE) },
      { key: 'status', label: 'Status', render: r => badge(r.status, STATUS_BADGE) },
      { key: 'hgvs', label: 'HGVS (c.)', render: r => `<span style="font-size:11px;color:var(--muted)">${esc(r.hgvs)}</span>` },
      { key: 'allelic', label: 'Zygosity', render: r => `<span style="font-size:11px">${esc(r.allelic)}</span>` },
    ];
    renderTable('tbl-genes', g.rows, varCols,
      { defaultSort: 'gene', defaultDir: 'asc', searchKeys: ['gene', 'disease', 'hgvs', 'acmg'] });

    // ── Explorer ──
    const rebuild = () => buildExplorer();
    ['gd-view', 'gd-top', 'gd-metric'].forEach(id =>
      document.getElementById(id).addEventListener('change', rebuild));
    buildExplorer();
  },
};

async function buildExplorer() {
  const view = document.getElementById('gd-view')?.value || 'gene-per-dx';
  const topN = parseInt(document.getElementById('gd-top')?.value || '15');
  const metric = document.getElementById('gd-metric')?.value || 'patients';

  const chartEl = document.getElementById('chart-gene-dx');
  const heatmapEl = document.getElementById('gd-heatmap');
  const phEl = document.getElementById('gd-placeholder');
  const legendEl = document.getElementById('gd-legend');

  const data = await callApi('gene_dx_explorer', { view, top_n: topN, metric });

  if (data.empty) {
    phEl.textContent = 'No gene data available.';
    phEl.style.display = 'block';
    chartEl.style.display = 'none';
    heatmapEl.style.display = 'none';
    return;
  }

  if (view === 'heatmap') {
    destroyChart('gene-dx');
    chartEl.style.display = 'none';
    heatmapEl.style.display = 'block';
    phEl.style.display = 'none';
    legendEl.innerHTML = '';

    const { genes, diagnoses, matrix, max } = data;
    const CELL = 36, LPAD = 120, TPAD = 110, CPAD = 8;
    const W = LPAD + diagnoses.length * CELL + CPAD;
    const H = TPAD + genes.length * CELL + CPAD;

    const cells = genes.flatMap((gName, gi) => diagnoses.map((dName, di) => {
      const v = matrix[gi][di];
      if (!v) return '';
      const intensity = v / max;
      const bg = `rgba(37,99,235,${(0.08 + intensity * 0.85).toFixed(2)})`;
      const tx = intensity > 0.55 ? '#fff' : '#1a2332';
      const x = LPAD + di * CELL, y = TPAD + gi * CELL;
      return `<rect x="${x}" y="${y}" width="${CELL - 2}" height="${CELL - 2}" rx="3" fill="${bg}"/>
              <text x="${x + CELL / 2 - 1}" y="${y + CELL / 2 + 4}" text-anchor="middle" font-size="10"
                fill="${tx}" font-family="${NUM_FONT}">${v}</text>`;
    })).join('');

    const gLabels = genes.map((gName, i) =>
      `<text x="${LPAD - 6}" y="${TPAD + i * CELL + CELL / 2 + 4}" text-anchor="end" font-size="11"
        fill="#334155" font-family="${NUM_FONT}">${esc(gName)}</text>`).join('');

    const dLabels = diagnoses.map((dName, i) => {
      const label = dName.length > 18 ? dName.slice(0, 17) + '…' : dName;
      const x = LPAD + i * CELL + CELL / 2;
      return `<text x="${x}" y="${TPAD - 6}" text-anchor="start" font-size="10"
        fill="#334155" font-family="${NUM_FONT}"
        transform="rotate(-45,${x},${TPAD - 6})">${esc(label)}</text>`;
    }).join('');

    heatmapEl.innerHTML = `
      <svg width="${W}" height="${H}" style="min-width:${W}px">${gLabels}${dLabels}${cells}</svg>
      <div style="font-size:10px;color:var(--muted);margin-top:6px">
        Colour intensity = ${metric === 'patients' ? 'unique patients' : 'total records'} · white = 0
      </div>`;
    return;
  }

  // ── Stacked bars ──
  heatmapEl.style.display = 'none';
  phEl.style.display = 'none';
  chartEl.style.display = 'block';

  const primaryKeys = data.primary_keys;
  const datasets = data.datasets.map((ds, si) => ({
    label: ds.label,
    data: ds.data,
    backgroundColor: GD_PALETTE[si % GD_PALETTE.length],
    borderWidth: 0,
  }));

  const barH = Math.max(28, Math.min(50, 700 / primaryKeys.length));
  chartEl.parentElement.style.height = Math.max(300, primaryKeys.length * barH + 60) + 'px';

  destroyChart('gene-dx');
  charts['gene-dx'] = new Chart(chartEl, {
    type: 'bar',
    data: { labels: primaryKeys, datasets },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} ${metric}` } },
      },
      scales: {
        x: {
          stacked: true, ticks: { color: '#94a3b8', font: { size: 10, family: NUM_FONT } }, grid: { color: 'rgba(0,0,0,.06)' },
          title: { display: true, text: metric === 'patients' ? 'Unique patients' : 'Records', color: '#7a8694', font: { size: 10, family: NUM_FONT } },
        },
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
