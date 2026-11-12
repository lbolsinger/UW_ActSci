// Terms run Winter -> Spring -> Fall. A term id looks like "fall-2026".
const SEASONS = ['Winter', 'Spring', 'Fall'];

export const termId = t => `${t.season.toLowerCase()}-${t.year}`;
export const termLabel = t => `${t.season} ${t.year}`;
export function labelFromId(id) {
  const [s, y] = id.split('-');
  return s ? `${s[0].toUpperCase()}${s.slice(1)} ${y}` : id;
}
export function prevTerm(t) {
  const i = SEASONS.indexOf(t.season);
  return i === 0 ? { season: 'Fall', year: t.year - 1 } : { season: SEASONS[i - 1], year: t.year };
}
/** The given term followed by the (n-1) terms before it, newest first. */
export function termsBack(t, n) {
  const out = [t];
  while (out.length < n) out.push(prevTerm(out[out.length - 1]));
  return out;
}

/** A number that sorts terms in time order (for "newest first"). */
export function termOrder(id) {
  const [s, y] = id.split('-');
  return (+y) * 3 + SEASONS.findIndex(x => x.toLowerCase() === s);
}
