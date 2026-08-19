// Demographics tab — renders app/py/cohort_stats/demographics.py output.

import { donut, histogram, barCell } from '../core/charts.js';
import { fmtYears } from '../core/format.js';

const SEX_COLORS = { FEMALE: '#7c3aed', MALE: '#2563eb', UNKNOWN: '#94a3b8', OTHER: '#16a34a' };
const VITAL_COLORS = { ALIVE: '#16a34a', DECEASED: '#dc2626', DEAD: '#dc2626', UNKNOWN: '#94a3b8' };

export default {
  id: 'demographics',
  label: 'Demographics',
  computeKey: 'demographics',

  render(section, d) {
    section.innerHTML = `
      <div class="section-title">Demographics</div>
      <div class="section-subtitle">Subject-level overview across the cohort</div>
      <div class="stat-cards" id="demo-stats"></div>
      <div class="grid-2" style="margin-bottom:20px">
        <div class="card">
          <h3>Sex Distribution</h3>
          <div class="donut-wrap">
            <div style="width:160px;height:160px;flex-shrink:0"><canvas id="chart-sex"></canvas></div>
            <div class="donut-legend" id="sex-legend"></div>
          </div>
        </div>
        <div class="card">
          <h3>Vital Status</h3>
          <div class="donut-wrap">
            <div style="width:160px;height:160px;flex-shrink:0"><canvas id="chart-vital"></canvas></div>
            <div class="donut-legend" id="vital-legend"></div>
          </div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h3>Year of Birth</h3>
          <div class="chart-wrap" style="height:200px"><canvas id="chart-yob"></canvas></div>
        </div>
        <div class="card">
          <h3>Age at Last Encounter <span style="font-size:10px;color:var(--muted);text-transform:none;letter-spacing:0">(5-year bins)</span></h3>
          <div class="chart-wrap" style="height:200px"><canvas id="chart-age"></canvas></div>
        </div>
      </div>
      <div class="grid-2" style="margin-top:20px">
        <div class="card">
          <h3>Current Age <span style="font-size:10px;color:var(--muted);text-transform:none;letter-spacing:0">computed from date of birth · 5-year bins</span></h3>
          <div class="chart-wrap" style="height:200px"><canvas id="chart-curage"></canvas></div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;justify-content:center">
          <h3>Age Summary</h3>
          <div id="age-summary-table"></div>
        </div>
      </div>`;

    const enc = d.encounter_summary, cur = d.current_summary;

    document.getElementById('demo-stats').innerHTML = `
      <div class="stat-card"><div class="val" style="color:var(--accent)">${d.n_patients.toLocaleString()}</div><div class="lbl">Total Patients</div></div>
      <div class="stat-card"><div class="val" style="color:var(--green)">${d.alive.toLocaleString()}</div><div class="lbl">Alive</div></div>
      <div class="stat-card"><div class="val" style="color:var(--red)">${d.deceased.toLocaleString()}</div><div class="lbl">Deceased</div></div>
      <div class="stat-card"><div class="val" style="color:var(--orange)">${enc.median !== null ? fmtYears(enc.median) : '—'}</div><div class="lbl">Median Age at Encounter</div></div>
      <div class="stat-card"><div class="val" style="color:var(--purple)">${cur.median !== null ? fmtYears(cur.median) : '—'}</div><div class="lbl">Median Current Age</div></div>
      <div class="stat-card"><div class="val" style="color:var(--teal)">${d.earliest_birth_year ?? '—'}</div><div class="lbl">Earliest Birth Year</div></div>`;

    donut('sex', 'chart-sex', 'sex-legend', d.sex_counts, SEX_COLORS, d.n_patients);
    donut('vital', 'chart-vital', 'vital-legend', d.vital_counts, VITAL_COLORS, d.n_patients);

    const drawHist = (key, canvasId, hist, color, emptyMsg) => {
      const canvas = document.getElementById(canvasId);
      if (hist.bins.length) {
        histogram(key, canvasId, hist.labels, hist.bins, color);
      } else {
        canvas.parentElement.innerHTML =
          `<p style="color:var(--muted);font-size:12px;text-align:center;padding:40px 0">${emptyMsg}</p>`;
      }
    };
    drawHist('yob', 'chart-yob', d.yob_hist, '#34d399', 'No date of birth data available');
    drawHist('age', 'chart-age', d.age_encounter_hist, '#60a5fa', 'No age-at-encounter data available');
    drawHist('curage', 'chart-curage', d.current_age_hist, '#f472b6', 'No date of birth data for current age');

    const th = (label, align = 'right') => `<th style="text-align:${align};padding:7px 10px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.8px;background:var(--bg)">${label}</th>`;
    const rows = [
      ['N with data', `${enc.n.toLocaleString()} (${enc.pct.toFixed(1)}%)`, `${cur.n.toLocaleString()} (${cur.pct.toFixed(1)}%)`],
      ['Minimum', fmtYears(enc.min), fmtYears(cur.min)],
      ['Median', fmtYears(enc.median), fmtYears(cur.median)],
      ['Mean', enc.mean !== null ? fmtYears(enc.mean) : '—', cur.mean !== null ? fmtYears(cur.mean) : '—'],
      ['Maximum', fmtYears(enc.max), fmtYears(cur.max)],
    ];
    document.getElementById('age-summary-table').innerHTML = `
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr>${th('', 'left')}${th('Age at Encounter')}${th('Current Age')}</tr></thead>
        <tbody>
          ${rows.map(([lbl, e, c]) => `
            <tr>
              <td style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--muted)">${lbl}</td>
              <td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:right">${e}</td>
              <td style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:right">${c}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  },
};
