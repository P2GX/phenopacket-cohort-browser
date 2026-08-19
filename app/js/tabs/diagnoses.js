// Diagnoses tab — renders app/py/cohort_stats/diagnoses.py output.

import { hbar, barCell } from '../core/charts.js';
import { fmtYears, esc } from '../core/format.js';
import { renderTable } from '../core/tables.js';

export default {
  id: 'diagnoses',
  label: 'Diagnoses',
  computeKey: 'diagnoses',

  render(section, d) {
    section.innerHTML = `
      <div class="section-title">Diagnoses</div>
      <div class="section-subtitle">From the interpretations block · grouped by disease</div>
      <div class="card" style="margin-bottom:20px">
        <h3>Top 30 Diagnoses</h3>
        <div class="chart-wrap" id="chart-dx-wrap" style="height:360px"><canvas id="chart-dx"></canvas></div>
      </div>
      <div class="card">
        <h3>Full Table</h3>
        <div id="tbl-diagnoses"></div>
      </div>`;

    document.getElementById('chart-dx-wrap').style.height =
      Math.max(200, d.chart.labels.length * 22) + 'px';
    hbar('dx', 'chart-dx', d.chart.labels, d.chart.counts, '#22c55e');

    const cols = [
      { key: 'label', label: 'Disease', render: r => `<span>${esc(r.label)}</span>` },
      { key: 'id', label: 'MONDO ID', render: r => `<span style="color:var(--muted)">${esc(r.id)}</span>` },
      { key: 'count', label: 'Patients', render: r => barCell(r.count, r.pct, 'var(--green)') },
      { key: 'median_onset', label: 'Median Onset', render: r => fmtYears(r.median_onset) },
    ];
    renderTable('tbl-diagnoses', d.table, cols,
      { defaultSort: 'count', defaultDir: 'desc', searchKeys: ['label', 'id'] });
  },
};
