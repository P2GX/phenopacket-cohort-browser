// Tab registry — the mechanism that makes "add a new tab" a one-file job.
//
// A tab is: {
//   id:         'demographics'          (unique, used for DOM ids)
//   label:      'Demographics'          (nav button text)
//   computeKey: 'demographics'          (key in the Python compute_all payload;
//                                        null if the tab doesn't need Python)
//   render(sectionEl, data, app) {...}  (fills its <section>; data is
//                                        payload[computeKey], app gives access
//                                        to raw packets + full payload)
// }
//
// Register tabs in js/tabs/index.js. Order there = order in the nav bar.

import { resizeAllCharts } from './charts.js';

export const TABS = [];

export function registerTab(tab) {
  TABS.push(tab);
}

export function buildShell() {
  const nav = document.querySelector('nav');
  const main = document.getElementById('sections');
  nav.innerHTML = '';
  main.innerHTML = '';
  TABS.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    if (i === 0) btn.classList.add('active');
    btn.addEventListener('click', () => showTab(tab.id));
    nav.appendChild(btn);

    const section = document.createElement('div');
    section.id = `tab-${tab.id}`;
    section.className = 'section' + (i === 0 ? ' active' : '');
    main.appendChild(section);
  });
}

export function renderAll(payload, app) {
  TABS.forEach(tab => {
    const section = document.getElementById(`tab-${tab.id}`);
    try {
      tab.render(section, tab.computeKey ? payload[tab.computeKey] : null, app);
    } catch (err) {
      console.error(`Tab "${tab.id}" failed to render:`, err);
      section.innerHTML = `<div class="empty-state">This tab failed to render — see the browser console.<br><span style="font-size:10px">${String(err)}</span></div>`;
    }
  });
}

export function showTab(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${id}`)?.classList.add('active');
  document.querySelector(`nav button[data-tab="${id}"]`)?.classList.add('active');
  setTimeout(resizeAllCharts, 50);
}
