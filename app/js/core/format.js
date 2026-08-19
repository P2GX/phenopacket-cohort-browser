// Formatting helpers — presentation only. All *statistics* live in Python
// (app/py/cohort_stats/); these functions just turn numbers into strings.

export function isoToYears(iso) {
  if (!iso) return null;
  const m = iso.match(/P(?:(\d+)Y)?(?:(\d+)M)?/);
  if (!m) return null;
  return (parseInt(m[1] || 0)) + (parseInt(m[2] || 0)) / 12;
}

export function fmtAge(iso) {
  if (!iso) return '—';
  const y = isoToYears(iso);
  if (y === null) return '—';
  return fmtYears(y);
}

export function fmtYears(y) {
  if (y === null || y === undefined) return '—';
  let yr = Math.floor(y), mo = Math.round((y - yr) * 12);
  if (mo === 12) { yr += 1; mo = 0; } // avoid "34y 12m"
  return mo ? `${yr}y ${mo}m` : `${yr}y`;
}

export const fmt2 = v => (v !== null && v !== undefined) ? Number(v).toFixed(2) : '—';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
