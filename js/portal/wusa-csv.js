// Reading the CSV WUSA sends every two weeks, and matching it against the payments awaiting confirmation.
// Pure functions (no database, no page), so they are easy to test.

/** Minimal CSV reader: quoted cells, commas inside quotes, "" for a quote, comma / semicolon / tab separators. */
export function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = [',', ';', '\t'].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const isNum = s => /^\d{6}$/.test(String(s || '').replace(/\s+/g, ''));
const isEmail = s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim());

/** From the parsed CSV: [{ number, email, name }] for every row that has a 6-digit confirmation number. */
export function wusaRows(table) {
  if (!table.length) return [];
  const head = table[0].map(h => h.trim());
  const hasHeader = !head.some(isNum);
  const find = re => hasHeader ? head.findIndex(h => re.test(h)) : -1;
  const numCol = find(/confirm|number|receipt|reference|transaction|order/i), mailCol = find(/e-?mail/i), nameCol = find(/name/i);
  return (hasHeader ? table.slice(1) : table).map(r => {
    const number = (numCol >= 0 && isNum(r[numCol]) ? r[numCol] : r.find(isNum) || '').replace(/\s+/g, '');
    const email = ((mailCol >= 0 && isEmail(r[mailCol]) ? r[mailCol] : r.find(isEmail)) || '').trim().toLowerCase();
    return { number, email, name: nameCol >= 0 ? (r[nameCol] || '').trim() : '' };
  }).filter(r => r.number);
}

export const RECENT_DAYS = 14;

/**
 * Decide what to do with every membership that is still waiting on WUSA.
 *   mems  memberships for the term; pays  { membershipId: payment doc }; rows  from wusaRows(); toMs  date -> ms
 * Returns lists of the memberships (each with `.number`):
 *   paid      number is in the file                           -> mark paid (emailMismatch: file's email differs)
 *   missing   not in the file and entered 2+ weeks ago         -> flag as unverified
 *   recent    not in the file but entered in the last 2 weeks  -> leave (may be in the next file)
 *   review    same number on several accounts and the file's email matches none of them -> leave for an exec
 *   loser     same number on several accounts and another account's email matched      -> stays flagged as a duplicate
 *   alreadyFlagged  already flagged as unverified and still not in the file -> nothing to change
 */
export function reconcile(mems, pays, rows, { now = Date.now(), toMs = d => +new Date(d) } = {}) {
  const byNum = new Map();
  for (const r of rows) (byNum.get(r.number) ?? byNum.set(r.number, []).get(r.number)).push(r);
  const pending = mems.filter(m => !m.paid && pays[m.id]?.wusaNumber && isNum(pays[m.id].wusaNumber))
    .map(m => ({ m, number: String(pays[m.id].wusaNumber).replace(/\s+/g, '') }));
  const groups = new Map();
  for (const p of pending) (groups.get(p.number) ?? groups.set(p.number, []).get(p.number)).push(p);

  const out = { paid: [], missing: [], recent: [], review: [], loser: [], alreadyFlagged: [] };
  for (const [number, group] of groups) {
    const hits = byNum.get(number);
    if (!hits) {
      for (const p of group) {
        if (p.m.flagged && p.m.flagReason === 'wusa-not-found') out.alreadyFlagged.push(p);
        else {
          const at = p.m.wusaSubmittedAt ? toMs(p.m.wusaSubmittedAt) : 0;
          (at && now - at < RECENT_DAYS * 864e5 ? out.recent : out.missing).push(p);
        }
      }
      continue;
    }
    const emails = new Set(hits.map(h => h.email).filter(Boolean));
    if (group.length === 1) { out.paid.push({ ...group[0], emailMismatch: !emails.has(String(group[0].m.email).toLowerCase()) }); continue; }
    const match = group.filter(p => emails.has(String(p.m.email).toLowerCase()));
    if (match.length === 1) { out.paid.push({ ...match[0], emailMismatch: false }); out.loser.push(...group.filter(p => p !== match[0])); }
    else out.review.push(...group);
  }
  return out;
}
