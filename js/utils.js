// Small helpers shared by every page. No site content lives here.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/** Escape text before putting it into HTML. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = n => String(n).padStart(2, '0');

/* ---- dates (all dates in the JSON files are "YYYY-MM-DD") ---- */
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fmtDate = (d, o) => d.toLocaleDateString('en-CA', o);
export const LONG = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ---- times (JSON uses 24h "HH:MM") ---- */
export const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
export const fmtShort = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + pad(m) : ''}`; };
export const fmtChip = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + pad(m) : ''}${h >= 12 ? 'p' : 'a'}`; };

/* ---- images ---- */
/** Grey placeholder shown whenever an image path is null in the JSON. */
export function ph(label, hue = 215) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="hsl(${hue} 30% 90%)"/><path d="M0 0L800 450M800 0L0 450" stroke="hsl(${hue} 25% 80%)" stroke-width="2"/><text x="400" y="232" text-anchor="middle" font-family="sans-serif" font-size="30" fill="hsl(${hue} 20% 40%)">${esc(label)}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
/** <img> tag that falls back to a placeholder when src is empty. */
export const pic = (src, label, alt = '', cls = '') =>
  `<img class="${cls}" src="${esc(src || ph(label))}" alt="${esc(alt)}" loading="lazy">`;
