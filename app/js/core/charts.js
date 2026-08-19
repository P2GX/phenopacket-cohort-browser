// Chart.js helpers shared by every tab. Chart.js is loaded globally from
// vendor/chart.umd.min.js (see index.html), so `Chart` is a global here.

export const charts = {};

export function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

export function destroyAllCharts() {
  Object.keys(charts).forEach(destroyChart);
}

export function resizeAllCharts() {
  Object.values(charts).forEach(c => c.resize?.());
}

export const NUM_FONT = "Calibri, Candara, sans-serif";
export const calibriFont = { family: NUM_FONT, size: 10 };

export const GD_PALETTE = [
  '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#6366f1', '#0d9488', '#9333ea',
  '#b45309', '#0369a1', '#15803d', '#be123c', '#7e22ce', '#0f766e',
  '#92400e', '#1d4ed8', '#166534', '#991b1b', '#6b21a8', '#155e75',
  '#854d0e', '#1e40af', '#14532d', '#7f1d1d', '#4c1d95', '#164e63',
];

// Vertical histogram, identical defaults to the original viewer
export function histogram(key, canvasId, labels, bins, color) {
  destroyChart(key);
  charts[key] = new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: { labels, datasets: [{ data: bins, backgroundColor: color, borderRadius: 2, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw.toLocaleString()} patients` } } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10, family: NUM_FONT }, maxRotation: 45 }, grid: { color: 'rgba(0,0,0,.06)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 10, family: NUM_FONT } }, grid: { color: 'rgba(0,0,0,.06)' } },
      },
    },
  });
}

// Horizontal "top N" bar chart
export function hbar(key, canvasId, labels, data, color, tooltipSuffix = 'patients') {
  destroyChart(key);
  charts[key] = new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 3, borderSkipped: false }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw.toLocaleString()} ${tooltipSuffix}` } } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10, family: NUM_FONT } }, grid: { color: 'rgba(0,0,0,.06)' } },
        y: { ticks: { color: '#334155', font: { size: 10, family: NUM_FONT } }, grid: { display: false } },
      },
    },
  });
}

// Doughnut + custom HTML legend
export function donut(key, canvasId, legendId, counts, colorMap, total) {
  const labels = Object.keys(counts);
  const values = labels.map(k => counts[k]);
  destroyChart(key);
  charts[key] = new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: labels.map(l => colorMap[l] || '#94a3b8'), borderWidth: 0, hoverOffset: 4 }],
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => total
          ? `${ctx.label}: ${ctx.raw.toLocaleString()} (${(ctx.raw / total * 100).toFixed(1)}%)`
          : `${ctx.label}: ${ctx.raw.toLocaleString()}` } },
      },
      animation: { duration: 600 },
    },
  });
  const legendEl = document.getElementById(legendId);
  if (legendEl) {
    legendEl.innerHTML = labels.map((l, i) =>
      `<div class="legend-item"><div class="legend-dot" style="background:${colorMap[l] || '#94a3b8'}"></div>${l}<span class="legend-val">${values[i].toLocaleString()}</span></div>`).join('');
  }
}

// Mini bar cell used inside tables: value + proportional bar + percentage
export function barCell(value, pct, color) {
  return `<div class="bar-cell"><span>${Number(value).toLocaleString()}</span><div class="mini-bar-bg"><div class="mini-bar" style="width:${pct}%;background:${color}"></div></div><span style="color:var(--muted)">${pct.toFixed(1)}%</span></div>`;
}
