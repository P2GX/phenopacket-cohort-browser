// Generic sortable / searchable / paginated table — identical look and
// behaviour to the original viewer, but using event delegation instead of
// inline onclick globals so it works cleanly inside ES modules.

const tableRegistry = {};

function getPgRange(current, total) {
  if (total <= 7) return [...Array(total).keys()];
  const r = new Set([0, total - 1, current, current - 1, current + 1].filter(p => p >= 0 && p < total));
  const sorted = [...r].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

export { getPgRange };

export function renderTable(containerId, data, cols, opts = {}) {
  const { defaultSort = '', defaultDir = 'asc', searchKeys = [], rowsOptions = [25, 50, 100, 250] } = opts;

  if (!tableRegistry[containerId]) {
    tableRegistry[containerId] = {
      data, cols, searchKeys, rowsOptions,
      state: { sortKey: defaultSort, sortDir: defaultDir, page: 0, rows: rowsOptions[0], search: '' },
      wired: false,
    };
  } else {
    Object.assign(tableRegistry[containerId], { data, cols, searchKeys, rowsOptions });
  }
  _refresh(containerId);
  _wire(containerId);
}

function _wire(containerId) {
  const reg = tableRegistry[containerId];
  const container = document.getElementById(containerId);
  if (!container || reg.wired) return;
  reg.wired = true;

  container.addEventListener('click', e => {
    const th = e.target.closest('th[data-key]');
    if (th) {
      const st = reg.state, key = th.dataset.key;
      if (st.sortKey === key) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
      else { st.sortKey = key; st.sortDir = 'asc'; }
      st.page = 0;
      _refresh(containerId);
      return;
    }
    const pg = e.target.closest('button[data-page]');
    if (pg && !pg.disabled) {
      reg.state.page = parseInt(pg.dataset.page);
      _refresh(containerId);
    }
  });
  container.addEventListener('input', e => {
    if (e.target.matches('input.search-box')) {
      reg.state.search = e.target.value;
      reg.state.page = 0;
      _refresh(containerId, true);
    }
  });
  container.addEventListener('change', e => {
    if (e.target.matches('select.rows-select')) {
      reg.state.rows = parseInt(e.target.value);
      reg.state.page = 0;
      _refresh(containerId);
    }
  });
}

function _refresh(containerId, keepFocus = false) {
  const reg = tableRegistry[containerId];
  if (!reg) return;
  const { data, cols, searchKeys, rowsOptions } = reg;
  const st = reg.state;

  const getVal = (row, key) => {
    const v = row[key];
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return v;
    return String(v).toLowerCase().replace(/<[^>]+>/g, '');
  };

  let filtered = data;
  if (st.search) {
    const q = st.search.toLowerCase();
    filtered = data.filter(r => searchKeys.some(k => String(r[k] || '').toLowerCase().includes(q)));
  }
  if (st.sortKey) {
    filtered = [...filtered].sort((a, b) => {
      const av = getVal(a, st.sortKey), bv = getVal(b, st.sortKey);
      if (typeof av === 'number' && typeof bv === 'number') return st.sortDir === 'asc' ? av - bv : bv - av;
      return st.sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }

  const total = filtered.length;
  const start = st.page * st.rows;
  const paged = filtered.slice(start, start + st.rows);
  const totalPages = Math.ceil(total / st.rows);

  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="table-controls">
      <input class="search-box" placeholder="Search…" value="${st.search.replace(/"/g, '&quot;')}">
      <select class="rows-select">
        ${rowsOptions.map(n => `<option value="${n}" ${n === st.rows ? 'selected' : ''}>${n} rows</option>`).join('')}
      </select>
      <span style="color:var(--muted);font-size:11px;margin-left:auto">${total.toLocaleString()} entries</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${cols.map(c => `<th data-key="${c.key}" class="${st.sortKey === c.key ? (st.sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : ''}">${c.label}</th>`).join('')}</tr></thead>
        <tbody>${paged.map(r => `<tr>${cols.map(c => `<td>${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="pagination">
      <span>${total.toLocaleString()} entries</span>
      <button class="pg-btn" data-page="${st.page - 1}" ${st.page === 0 ? 'disabled' : ''}>‹</button>
      ${getPgRange(st.page, totalPages).map(p => p === '…'
        ? `<span style="color:var(--muted);padding:0 4px">…</span>`
        : `<button class="pg-btn ${p === st.page ? 'active' : ''}" data-page="${p}">${p + 1}</button>`).join('')}
      <button class="pg-btn" data-page="${st.page + 1}" ${st.page >= totalPages - 1 ? 'disabled' : ''}>›</button>
    </div>`;

  if (keepFocus) {
    const box = container.querySelector('input.search-box');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
}
