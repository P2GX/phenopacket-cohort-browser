// Patient Browser tab — pure presentation over the raw phenopackets held in
// JS memory (no Python needed): list, search, pagination, detail panel.

import { fmtAge, esc } from '../core/format.js';
import { getPgRange } from '../core/tables.js';

const PER_PAGE = 50;

let packets = [];
let filtered = [];
let page = 0;

const ACMG_BADGE = {
  PATHOGENIC: 'red', LIKELY_PATHOGENIC: 'orange', UNCERTAIN_SIGNIFICANCE: 'muted',
  LIKELY_BENIGN: 'green', BENIGN: 'blue',
};

export default {
  id: 'browser',
  label: 'Patient Browser',
  computeKey: null,

  render(section, _data, app) {
    packets = app.packets;
    filtered = [...packets];
    page = 0;

    section.innerHTML = `
      <div class="section-title">Patient Browser</div>
      <div class="section-subtitle">Browse individual phenopackets</div>
      <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:20px;align-items:start">
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center">
            <input class="search-box" id="browser-search" placeholder="Search ID, diagnosis…" style="width:100%">
          </div>
          <div id="browser-list"></div>
          <div style="padding:10px 14px;border-top:1px solid var(--border)">
            <div id="browser-pagination" class="pagination"></div>
          </div>
        </div>
        <div id="browser-detail">
          <div class="empty-state">← Select a patient to view details</div>
        </div>
      </div>`;

    document.getElementById('browser-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      filtered = packets.filter(p => {
        if (!q) return true;
        const id = p.subject?.id || '';
        const dx = (p.interpretations || []).map(i => i.diagnosis?.disease?.label || '').join(' ');
        return id.toLowerCase().includes(q) || dx.toLowerCase().includes(q);
      });
      page = 0;
      renderList();
    });

    document.getElementById('browser-list').addEventListener('click', e => {
      const row = e.target.closest('.patient-row');
      if (!row) return;
      document.querySelectorAll('.patient-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      const p = filtered[parseInt(row.dataset.idx)];
      if (p) renderDetail(p);
    });

    document.getElementById('browser-pagination').addEventListener('click', e => {
      const btn = e.target.closest('button[data-page]');
      if (btn && !btn.disabled) { page = parseInt(btn.dataset.page); renderList(); }
    });

    renderList();
  },
};

function renderList() {
  const start = page * PER_PAGE;
  const pageItems = filtered.slice(start, start + PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  document.getElementById('browser-list').innerHTML = pageItems.length ? pageItems.map((p, i) => {
    const s = p.subject || {};
    const age = fmtAge(s.timeAtLastEncounter?.age?.iso8601duration);
    const dx = (p.interpretations || []).map(it => it.diagnosis?.disease?.label).filter(Boolean)[0] || '—';
    const sexIcon = s.sex === 'FEMALE' ? '♀' : s.sex === 'MALE' ? '♂' : '?';
    return `<div class="patient-row" data-idx="${start + i}">
      <span class="patient-id">${esc(s.id || p.id || '—')}</span>
      <span class="patient-meta">${sexIcon} · ${age}</span>
      <span class="patient-dx">${esc(dx)}</span>
    </div>`;
  }).join('') : '<div class="empty-state">No patients match</div>';

  const pg = document.getElementById('browser-pagination');
  let html = `<span>${filtered.length.toLocaleString()} patients</span>`;
  html += `<button class="pg-btn" data-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>‹</button>`;
  getPgRange(page, totalPages).forEach(p => {
    if (p === '…') html += `<span style="color:var(--muted);padding:0 4px">…</span>`;
    else html += `<button class="pg-btn ${p === page ? 'active' : ''}" data-page="${p}">${p + 1}</button>`;
  });
  html += `<button class="pg-btn" data-page="${page + 1}" ${page >= totalPages - 1 ? 'disabled' : ''}>›</button>`;
  pg.innerHTML = html;
}

function renderDetail(p) {
  const s = p.subject || {};
  const age = fmtAge(s.timeAtLastEncounter?.age?.iso8601duration);
  const dob = s.dateOfBirth
    ? new Date(s.dateOfBirth).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })
    : '—';

  const dxHtml = (p.interpretations || []).map(interp => {
    const dx = interp.diagnosis;
    const genes = (dx?.genomicInterpretations || []).map(gi => {
      const vd = gi.variantInterpretation?.variationDescriptor;
      const gene = vd?.geneContext || gi.gene;
      const sym = gene?.symbol;
      if (!sym) return '';
      const hgvs = vd?.expressions?.[0]?.value || '';
      const acmg = gi.variantInterpretation?.acmgPathogenicityClassification || '';
      const col = ACMG_BADGE[acmg] || 'muted';
      const hgvsSpan = hgvs ? `<span style="font-size:10px;color:var(--muted)">${esc(hgvs)}</span> ` : '';
      const acmgBadge = acmg ? `<span class="badge badge-${col}" style="font-size:9px">${esc(acmg.replace(/_/g, ' '))}</span>` : '';
      const hgncSpan = gene.valueId ? `<span style="font-size:10px;color:var(--muted)"> · ${esc(gene.valueId)}</span>` : '';
      return `<div class="detail-row"><span class="key">${esc(sym)}${hgncSpan}</span><span class="val">${hgvsSpan}${acmgBadge}</span></div>`;
    }).join('');
    const statusCol = { SOLVED: 'green', IN_PROGRESS: 'orange', UNSOLVED: 'red' }[interp.progressStatus] || 'muted';
    return `<div class="detail-row"><span class="key" style="font-weight:500">${esc(dx?.disease?.label || '—')}</span><span class="val"><span class="badge badge-${statusCol}">${esc(interp.progressStatus || '—')}</span></span></div>${genes}`;
  }).join('') || '<span class="no-data">No interpretations</span>';

  const presentFeatures = (p.phenotypicFeatures || []).filter(pf => !pf.excluded);
  const excludedFeatures = (p.phenotypicFeatures || []).filter(pf => pf.excluded);
  const hpoHtml = [
    ...presentFeatures.map(pf => {
      const sev = pf.severity?.label || '';
      const onset = pf.onset?.age?.iso8601duration ? ` · onset ${fmtAge(pf.onset.age.iso8601duration)}` : '';
      return `<span class="hpo-chip" title="${esc(sev)}${esc(onset)}">${esc(pf.type?.label || pf.type?.id)}</span>`;
    }),
    ...(excludedFeatures.length ? [`<span style="display:block;font-size:10px;color:var(--muted);margin:6px 0 2px">Excluded:</span>`] : []),
    ...excludedFeatures.map(pf =>
      `<span class="hpo-chip absent" title="Excluded">${esc(pf.type?.label || pf.type?.id)}</span>`),
  ].join('') || '<span class="no-data">None recorded</span>';

  const measHtml = (p.measurements || []).map(m => `
    <div class="detail-row">
      <span class="key">${esc(m.assay?.label || m.assay?.id)}</span>
      <span class="val">${esc(m.value?.quantity?.value ?? '—')} <span style="color:var(--muted);font-size:10px">${esc(m.value?.quantity?.unit?.label || '')}</span> <span style="color:var(--muted);font-size:10px">@ ${fmtAge(m.timeObserved?.age?.iso8601duration)}</span></span>
    </div>`).join('') || '<span class="no-data">No measurements</span>';

  const disHtml = (p.diseases || []).map(d => `
    <div class="detail-row">
      <span class="key">${esc(d.term?.label || d.term?.id)}</span>
      <span class="val" style="color:var(--muted);font-size:11px">${d.onset?.age?.iso8601duration ? 'onset ' + fmtAge(d.onset.age.iso8601duration) : '—'}</span>
    </div>`).join('') || '<span class="no-data">No diseases recorded</span>';

  document.getElementById('browser-detail').innerHTML = `
    <h3>${esc(s.id || p.id || 'Patient')}</h3>
    <div style="color:var(--muted);font-size:11px;margin-bottom:4px">${esc(s.vitalStatus?.status || '')}</div>

    <div class="detail-section">
      <h4>Subject</h4>
      <div class="detail-row"><span class="key">Date of Birth</span><span class="val">${dob}</span></div>
      <div class="detail-row"><span class="key">Age at last encounter</span><span class="val">${age}</span></div>
      <div class="detail-row"><span class="key">Sex</span><span class="val">${esc(s.sex || '—')}</span></div>
      <div class="detail-row"><span class="key">Gender</span><span class="val">${esc(s.gender?.label || '—')}</span></div>
    </div>

    <div class="detail-section">
      <h4>Diagnosis &amp; Variants</h4>
      ${dxHtml}
    </div>

    <div class="detail-section">
      <h4>Diseases</h4>
      ${disHtml}
    </div>

    <div class="detail-section">
      <h4>Phenotypic Features (${presentFeatures.length} present · ${excludedFeatures.length} excluded)</h4>
      <div style="margin-top:4px">${hpoHtml}</div>
    </div>

    <div class="detail-section">
      <h4>Measurements (${(p.measurements || []).length})</h4>
      ${measHtml}
    </div>`;
}
