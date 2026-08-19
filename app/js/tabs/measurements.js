// Measurements tab — assay overview, box plots, per-assay distribution
// detail, raw records table and measurements-over-time explorer.

import { charts, destroyChart, barCell, calibriFont, NUM_FONT } from '../core/charts.js';
import { fmtAge, fmt2, esc } from '../core/format.js';
import { renderTable } from '../core/tables.js';
import { callApi } from '../core/pybridge.js';

const GROUP_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#6366f1',
];

export default {
  id: 'measurements',
  label: 'Measurements',
  computeKey: 'measurements',

  render(section, m) {
    section.innerHTML = `
      <div class="section-title">Measurements</div>
      <div class="section-subtitle">Quantitative assay values across the cohort · LOINC-coded</div>
      <div class="stat-cards" id="meas-stats"></div>
      <div class="card" style="margin-bottom:20px">
        <h3>Assay Overview</h3>
        <div id="tbl-assays"></div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <h3>Value Distributions
          <span style="font-size:10px;color:var(--muted);text-transform:none;letter-spacing:0;margin-left:8px">top assays by frequency · box = IQR · line = median · whiskers = 5–95th percentile</span>
        </h3>
        <div id="meas-boxplots"></div>
      </div>
      <div class="card">
        <h3>All Measurement Records</h3>
        <div id="tbl-measurements"></div>
      </div>
      <div class="card" style="margin-top:20px" id="card-meas-time">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
          <div>
            <h3 style="margin-bottom:2px">Measurements Over Time</h3>
            <div style="font-size:11px;color:var(--muted)">Select an assay and grouping to explore longitudinal trends</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <select id="time-assay-select" class="rows-select" style="min-width:200px">
              <option value="">— select assay —</option>
            </select>
            <select id="time-group-select" class="rows-select">
              <option value="cohort">Whole cohort</option>
              <option value="sex">By sex</option>
              <option value="diagnosis">By diagnosis</option>
            </select>
            <select id="time-mode-select" class="rows-select">
              <option value="scatter">Scatter</option>
              <option value="median">Median line</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>
        <div id="meas-time-info" style="font-size:11px;color:var(--muted);margin-bottom:8px"></div>
        <div style="position:relative;height:320px"><canvas id="chart-meas-time"></canvas></div>
        <div id="meas-time-legend" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:11px"></div>
      </div>`;

    // ── Stat cards ──
    const s = m.stats;
    document.getElementById('meas-stats').innerHTML = `
      <div class="stat-card"><div class="val" style="color:var(--accent)">${s.records.toLocaleString()}</div><div class="lbl">Total Records</div></div>
      <div class="stat-card"><div class="val" style="color:var(--green)">${s.patients_with.toLocaleString()}</div><div class="lbl">Patients with Measurements</div></div>
      <div class="stat-card"><div class="val" style="color:var(--purple)">${s.unique_assays.toLocaleString()}</div><div class="lbl">Unique Assay Types</div></div>
      <div class="stat-card"><div class="val" style="color:var(--orange)">${s.avg_per_patient.toFixed(1)}</div><div class="lbl">Avg Records / Patient</div></div>`;

    // ── Assay overview table ──
    const assayCols = [
      { key: 'label', label: 'Assay', render: r => `<strong>${esc(r.label)}</strong>` },
      { key: 'id', label: 'LOINC ID', render: r => `<span style="color:var(--muted);font-size:11px">${esc(r.id)}</span>` },
      { key: 'unit', label: 'Unit', render: r => `<span style="font-size:11px">${esc(r.unit) || '—'}</span>` },
      { key: 'n_patients', label: 'Patients', render: r => barCell(r.n_patients, r.pct_patients, 'var(--accent)') },
      { key: 'n_records', label: 'Records', render: r => r.n_records.toLocaleString() },
      { key: 'min', label: 'Min', render: r => `<span style="color:var(--muted)">${fmt2(r.min)}</span>` },
      { key: 'median', label: 'Median', render: r => `<strong>${fmt2(r.median)}</strong>` },
      { key: 'mean', label: 'Mean', render: r => fmt2(r.mean) },
      { key: 'max', label: 'Max', render: r => `<span style="color:var(--muted)">${fmt2(r.max)}</span>` },
      { key: '_detail', label: '', render: r =>
        `<button class="btn btn-ghost assay-detail-btn" style="padding:3px 10px;font-size:10px" data-assay="${esc(r.id)}">Distribution ↓</button>` },
    ];
    renderTable('tbl-assays', m.assays, assayCols,
      { defaultSort: 'n_records', defaultDir: 'desc', searchKeys: ['label', 'id', 'unit'] });

    // Distribution buttons (event delegation survives table re-renders)
    document.getElementById('tbl-assays').addEventListener('click', e => {
      const btn = e.target.closest('.assay-detail-btn');
      if (btn) showAssayDetail(btn.dataset.assay);
    });

    // ── Box plots (top 12 assays) ──
    renderBoxplots(m.assays.slice(0, 12));

    // ── All records table ──
    const recCols = [
      { key: 'subject_id', label: 'Patient', render: r => `<span style="color:var(--accent);font-size:11px">${esc(r.subject_id)}</span>` },
      { key: 'assay_label', label: 'Assay', render: r => esc(r.assay_label) },
      { key: 'assay_id', label: 'LOINC ID', render: r => `<span style="color:var(--muted);font-size:11px">${esc(r.assay_id)}</span>` },
      { key: 'val', label: 'Value', render: r => `<strong>${fmt2(r.val)}</strong>` },
      { key: 'unit', label: 'Unit', render: r => `<span style="font-size:11px;color:var(--muted)">${esc(r.unit) || '—'}</span>` },
      { key: 'time_label', label: 'Time Observed', render: r => `<span style="font-size:11px;color:var(--muted)">${esc(r.time_label)}</span>` },
    ];
    const records = m.records.map(r => ({
      ...r,
      time_label: r.time_iso_age ? fmtAge(r.time_iso_age) : (r.time_date || '—'),
    }));
    renderTable('tbl-measurements', records, recCols,
      { defaultSort: 'assay_label', defaultDir: 'asc', searchKeys: ['subject_id', 'assay_label', 'assay_id', 'unit'] });

    // ── Over-time selector ──
    const withTime = new Set(m.records.filter(r => r.time_val !== null).map(r => r.assay_id));
    const hasAny = withTime.size > 0;
    const sel = document.getElementById('time-assay-select');
    sel.innerHTML = '<option value="">— select assay —</option>' +
      m.assays.map(a => {
        const hasT = withTime.has(a.id);
        const note = !hasAny ? '' : (hasT ? '' : ' (no timestamps)');
        return `<option value="${esc(a.id)}" ${!hasT && hasAny ? 'style="color:#94a3b8"' : ''}>${esc(a.label)}${note} (${a.n_records})</option>`;
      }).join('');
    if (!hasAny) {
      document.getElementById('meas-time-info').textContent =
        'No time-stamped measurements found yet. Once timeObserved is added to your data, charts will appear here automatically.';
    }
    ['time-assay-select', 'time-group-select', 'time-mode-select'].forEach(id =>
      document.getElementById(id).addEventListener('change', buildOverTime));
  },
};

// ── SVG box plots ──────────────────────────────────────────────────────────
function renderBoxplots(topAssays) {
  const el = document.getElementById('meas-boxplots');
  if (!topAssays.length) {
    el.innerHTML = '<p class="no-data" style="padding:20px 0">No measurement data available.</p>';
    return;
  }
  const PLOT_W = 580, BAR_H = 28, PAD_L = 180, PAD_R = 60, PAD_T = 16, PAD_B = 24;
  const totalH = PAD_T + topAssays.length * (BAR_H + 10) + PAD_B;

  const svgRows = topAssays.map((a, i) => {
    const range = a.max - a.min || 1;
    const x = v => PAD_L + ((v - a.min) / range) * (PLOT_W - PAD_L - PAD_R);
    const y = PAD_T + i * (BAR_H + 10) + BAR_H / 2;
    const xMin = x(a.min), xP25 = x(a.p25), xMed = x(a.median), xP75 = x(a.p75), xP95 = x(a.p95), xMax = x(a.max);

    return `
      <text x="${PAD_L - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#334155"
        style="font-family:'DM Mono',monospace">${esc(a.label.length > 26 ? a.label.slice(0, 25) + '…' : a.label)}</text>
      <line x1="${xMin}" y1="${y}" x2="${xMax}" y2="${y}" stroke="#cbd5e1" stroke-width="1.5"/>
      <line x1="${xMin}" y1="${y - 5}" x2="${xMin}" y2="${y + 5}" stroke="#94a3b8" stroke-width="1.5"/>
      <line x1="${xMax}" y1="${y - 5}" x2="${xMax}" y2="${y + 5}" stroke="#94a3b8" stroke-width="1.5"/>
      <rect x="${x(a.p25 < a.min ? a.min : a.p25)}" y="${y - BAR_H / 2 + 4}"
            width="${Math.max(0, xP95 - xP25)}" height="${BAR_H - 8}" rx="2" fill="#bfdbfe" opacity="0.5"/>
      <rect x="${xP25}" y="${y - BAR_H / 2 + 2}" width="${Math.max(1, xP75 - xP25)}" height="${BAR_H - 4}"
            rx="3" fill="#60a5fa" opacity="0.8"/>
      <line x1="${xMed}" y1="${y - BAR_H / 2 + 2}" x2="${xMed}" y2="${y + BAR_H / 2 - 2}" stroke="#1d4ed8" stroke-width="2"/>
      <text x="${PLOT_W - PAD_R + 6}" y="${y + 4}" font-size="9" fill="#94a3b8"
        style="font-family:'DM Mono',monospace">${esc(a.unit)}</text>
      <text x="${xMin - 2}" y="${y + 14}" text-anchor="middle" font-size="8" fill="#94a3b8"
        style="font-family:'DM Mono',monospace">${fmt2(a.min)}</text>
      <text x="${xMed}" y="${y - BAR_H / 2 - 2}" text-anchor="middle" font-size="8" fill="#1d4ed8"
        style="font-family:'DM Mono',monospace">${fmt2(a.median)}</text>
      <text x="${xMax + 2}" y="${y + 14}" text-anchor="middle" font-size="8" fill="#94a3b8"
        style="font-family:'DM Mono',monospace">${fmt2(a.max)}</text>`;
  }).join('');

  el.innerHTML = `
    <svg width="100%" viewBox="0 0 ${PLOT_W} ${totalH}" style="overflow:visible;max-width:${PLOT_W}px">
      <rect x="${PAD_L}" y="2" width="12" height="8" rx="2" fill="#60a5fa" opacity="0.8"/>
      <text x="${PAD_L + 16}" y="10" font-size="9" fill="#64748b" style="font-family:'DM Mono',monospace">IQR (25–75th pct)</text>
      <rect x="${PAD_L + 130}" y="2" width="12" height="8" rx="2" fill="#bfdbfe" opacity="0.5"/>
      <text x="${PAD_L + 146}" y="10" font-size="9" fill="#64748b" style="font-family:'DM Mono',monospace">5–95th pct</text>
      <line x1="${PAD_L + 240}" y1="6" x2="${PAD_L + 252}" y2="6" stroke="#1d4ed8" stroke-width="2"/>
      <text x="${PAD_L + 256}" y="10" font-size="9" fill="#64748b" style="font-family:'DM Mono',monospace">Median</text>
      ${svgRows}
    </svg>`;
}

// ── Per-assay distribution detail panel ────────────────────────────────────
async function showAssayDetail(assayId) {
  const existing = document.getElementById('assay-detail-panel');
  if (existing && existing.dataset.assayId === assayId) { existing.remove(); return; }
  if (existing) existing.remove();

  const a = await callApi('assay_detail', { assay_id: assayId });
  if (a.empty) return;

  const panel = document.createElement('div');
  panel.id = 'assay-detail-panel';
  panel.dataset.assayId = assayId;
  panel.className = 'card';
  panel.style.cssText = 'margin-bottom:20px;border-top:3px solid var(--accent)';
  const sm = a.summary;
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <h3 style="margin-bottom:2px">${esc(a.label)}
          <span style="font-size:10px;color:var(--muted);text-transform:none;letter-spacing:0;margin-left:6px">${esc(a.id)} · ${esc(a.unit)}</span>
        </h3>
        <div style="font-size:11px;color:var(--muted)">${a.n_records.toLocaleString()} records across ${a.n_patients.toLocaleString()} patients</div>
      </div>
      <button id="assay-detail-close"
        style="background:none;border:none;font-size:18px;color:var(--muted);cursor:pointer;line-height:1">×</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:10px">Value Distribution</div>
        <div style="position:relative;height:200px"><canvas id="chart-assay-detail"></canvas></div>
      </div>
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:10px">Summary Statistics</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          ${[
            ['N records', a.n_records.toLocaleString()],
            ['N patients', a.n_patients.toLocaleString()],
            ['Minimum', Number(sm.min).toFixed(3) + ' ' + a.unit],
            ['5th percentile', Number(sm.p05).toFixed(3) + ' ' + a.unit],
            ['25th percentile', Number(sm.p25).toFixed(3) + ' ' + a.unit],
            ['Median', Number(sm.median).toFixed(3) + ' ' + a.unit],
            ['Mean', Number(sm.mean).toFixed(3) + ' ' + a.unit],
            ['75th percentile', Number(sm.p75).toFixed(3) + ' ' + a.unit],
            ['95th percentile', Number(sm.p95).toFixed(3) + ' ' + a.unit],
            ['Maximum', Number(sm.max).toFixed(3) + ' ' + a.unit],
          ].map(([k, v]) => `
            <tr>
              <td style="padding:5px 10px;border-bottom:1px solid var(--border);color:var(--muted)">${k}</td>
              <td style="padding:5px 10px;border-bottom:1px solid var(--border);font-weight:500;text-align:right">${esc(v)}</td>
            </tr>`).join('')}
        </table>
      </div>
    </div>`;

  const assayCard = document.getElementById('tbl-assays').closest('.card');
  assayCard.insertAdjacentElement('afterend', panel);
  panel.querySelector('#assay-detail-close').addEventListener('click', () => panel.remove());

  destroyChart('assay-detail');
  charts['assay-detail'] = new Chart(document.getElementById('chart-assay-detail'), {
    type: 'bar',
    data: {
      labels: a.bin_labels,
      datasets: [{ data: a.bins, backgroundColor: '#60a5fa', borderRadius: 2, borderSkipped: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        title: ctx => `${ctx[0].label} – ${Number(Number(ctx[0].label) + a.bin_width).toFixed(2)} ${a.unit}`,
        label: ctx => `${ctx.raw.toLocaleString()} records`,
      } } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 9, family: NUM_FONT }, maxRotation: 45 }, grid: { color: 'rgba(0,0,0,.06)' },
             title: { display: true, text: a.unit, color: '#94a3b8', font: { size: 10 } } },
        y: { ticks: { color: '#94a3b8', font: { size: 10, family: NUM_FONT } }, grid: { color: 'rgba(0,0,0,.06)' },
             title: { display: true, text: 'Records', color: '#94a3b8', font: { size: 10 } } },
      },
    },
  });

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Measurements over time ─────────────────────────────────────────────────
async function buildOverTime() {
  const assayId = document.getElementById('time-assay-select')?.value;
  const groupBy = document.getElementById('time-group-select')?.value || 'cohort';
  const mode = document.getElementById('time-mode-select')?.value || 'scatter';
  const infoEl = document.getElementById('meas-time-info');
  const legendEl = document.getElementById('meas-time-legend');

  if (!assayId) {
    destroyChart('meas-time');
    infoEl.textContent = '';
    legendEl.innerHTML = '';
    return;
  }

  const data = await callApi('meas_over_time', { assay_id: assayId, group_by: groupBy });

  if (data.empty) {
    destroyChart('meas-time');
    infoEl.textContent = 'No time-stamped records available for this assay.';
    legendEl.innerHTML = '';
    return;
  }

  const isAge = data.time_type === 'age';
  infoEl.textContent =
    `${data.n_records.toLocaleString()} records across ${data.n_patients} patients · time axis: ${isAge ? 'age (years)' : 'calendar date'}`;

  const datasets = [];
  data.groups.forEach((grp, gi) => {
    const color = GROUP_COLORS[gi % GROUP_COLORS.length];
    if (mode === 'scatter' || mode === 'both') {
      datasets.push({
        label: grp.name, type: 'scatter', data: grp.points,
        backgroundColor: color + '55', borderColor: color,
        pointRadius: 4, pointHoverRadius: 6, borderWidth: 1, showLine: false,
        _group: grp.name, _color: color,
      });
    }
    if (mode === 'median' || mode === 'both') {
      datasets.push({
        label: grp.name + ' (median)', type: 'line', data: grp.median_line,
        borderColor: color, backgroundColor: 'transparent',
        borderWidth: 2.5, pointRadius: 3, tension: 0.35, fill: false,
        _group: grp.name, _color: color,
      });
    }
  });

  destroyChart('meas-time');
  const xTickCallback = val => isAge
    ? `${Number(val).toFixed(1)} yr`
    : new Date(val).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });

  charts['meas-time'] = new Chart(document.getElementById('chart-meas-time'), {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: ctx => {
            const xFmt = isAge
              ? `${ctx.parsed.x.toFixed(1)} yr`
              : new Date(ctx.parsed.x).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
            return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ${data.unit || ''} @ ${xFmt}`;
          },
        } },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: isAge ? 'Age (years)' : 'Date', color: '#7a8694', font: calibriFont },
          ticks: { color: '#94a3b8', font: calibriFont, callback: xTickCallback, maxTicksLimit: 12 },
          grid: { color: 'rgba(0,0,0,.06)' },
        },
        y: {
          title: { display: true, text: `${data.label || ''} (${data.unit || ''})`, color: '#7a8694', font: calibriFont },
          ticks: { color: '#94a3b8', font: calibriFont },
          grid: { color: 'rgba(0,0,0,.06)' },
        },
      },
    },
  });

  const seen = new Set();
  legendEl.innerHTML = datasets
    .filter(d => { if (seen.has(d._group)) return false; seen.add(d._group); return true; })
    .map(d => `<span style="display:inline-flex;align-items:center;gap:5px">
      <span style="width:12px;height:12px;border-radius:50%;background:${d._color};flex-shrink:0"></span>
      <span style="font-family:var(--font-num)">${esc(d._group)}</span>
    </span>`).join('');
}
