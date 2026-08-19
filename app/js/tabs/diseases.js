// Diseases tab — the diseases block (may differ from interpretations).

import { hbar, barCell } from '../core/charts.js';
import { fmtYears, esc } from '../core/format.js';
import { renderTable } from '../core/tables.js';

export default {
  id: 'diseases',
  label: 'Diseases',
  computeKey: 'diseases',

  render(section, d) {
    section.innerHTML = `
      <div class="section-title">Diseases Block</div>
      <div class="section-subtitle">From the diseases field (may differ from interpretations)</div>
      <div class="card" style="margin-bottom:20px">
        <h3>Top 30 Diseases</h3>
        <div class="chart-wrap" id="chart-dis-wrap" style="height:360px"><canvas id="chart-dis"></canvas></div>
      </div>
      <div class="card">
        <h3>Full Table</h3>
        <div id="tbl-diseases"></div>
      </div>`;

    document.getElementById('chart-dis-wrap').style.height =
      Math.max(200, d.chart.labels.length * 22) + 'px';
    hbar('dis', 'chart-dis', d.chart.labels, d.chart.counts, '#60a5fa');

    const cols = [
      { key: 'label', label: 'Disease', render: r => `<span>${esc(r.label)}</span>` },
      { key: 'id', label: 'MONDO ID', render: r => `<span style="color:var(--muted);font-size:11px">${esc(r.id)}</span>` },
      { key: 'count', label: 'Patients', render: r => barCell(r.count, r.pct, 'var(--accent)') },
      { key: 'median_onset', label: 'Median Onset', render: r => fmtYears(r.median_onset) },
      { key: 'min_onset', label: 'Earliest Onset', render: r => fmtYears(r.min_onset) },
    ];
    renderTable('tbl-diseases', d.table, cols,
      { defaultSort: 'count', defaultDir: 'desc', searchKeys: ['label', 'id'] });
  },
};
