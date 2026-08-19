// About tab — version, privacy note, and the version history (CHANGELOG.md)
// so users of the deployed site can see what changed in each release.

import { esc } from '../core/format.js';
import { REPO_URL } from '../config.js';

// Minimal markdown renderer for the Keep-a-Changelog subset
// (h1–h3, unordered lists, links, bold, inline code).
function miniMarkdown(md) {
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const lines = md.split('\n');
  let html = '', inList = false;
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^###\s+/.test(line)) html += `<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`;
    else if (/^##\s+/.test(line)) html += `<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`;
    else if (/^#\s+/.test(line)) html += `<h2>${inline(line.replace(/^#\s+/, ''))}</h2>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

export default {
  id: 'about',
  label: 'About',
  computeKey: null,

  async render(section) {
    section.innerHTML = `
      <div class="section-title">About</div>
      <div class="section-subtitle">Version history · privacy · how this viewer works</div>
      <div class="grid-2" style="align-items:start">
        <div class="card">
          <h3>Version History</h3>
          <div id="about-changelog" class="about-md"><span class="no-data">Loading changelog…</span></div>
        </div>
        <div class="card">
          <h3>This Viewer</h3>
          <div class="about-md">
            <p><strong>Your data never leaves this browser.</strong> Phenopacket files are read
            locally; all statistics run inside the page via a WebAssembly Python engine
            (Pyodide). Nothing is uploaded to any server — the site works from a static
            file host and can be used offline after the first visit.</p>
            <p>Version <strong id="about-version">…</strong>
              <span id="about-date" style="color:var(--muted)"></span></p>
            <p>Source code, issues and feature requests:
              <a id="about-repo" href="#" target="_blank" rel="noopener">GitHub repository</a></p>
            <h3>Editing the statistics</h3>
            <p>Every number in this viewer is computed by small Python modules in
            <code>app/py/cohort_stats/</code>. Edit them, push to <code>main</code>, and the
            deployed site updates automatically.</p>
          </div>
        </div>
      </div>`;

    const repoLink = section.querySelector('#about-repo');
    repoLink.href = REPO_URL;
    repoLink.textContent = REPO_URL.replace(/^https?:\/\//, '');

    try {
      const v = await (await fetch('version.json')).json();
      section.querySelector('#about-version').textContent = v.version;
      section.querySelector('#about-date').textContent = v.date ? ` · ${v.date}` : '';
    } catch { section.querySelector('#about-version').textContent = 'dev'; }

    try {
      let res = await fetch('CHANGELOG.md');           // deployed site (copied in CI)
      if (!res.ok) res = await fetch('../CHANGELOG.md'); // local dev from repo root
      if (!res.ok) throw new Error('not found');
      section.querySelector('#about-changelog').innerHTML = miniMarkdown(await res.text());
    } catch {
      section.querySelector('#about-changelog').innerHTML =
        '<span class="no-data">Changelog not available in this build.</span>';
    }
  },
};
