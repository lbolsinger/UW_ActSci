// Event sign-up rules, shared by the public site and the member portal. No database code in here.
//
// Every event can be signed up for inside the member portal. Optional settings go in data/events.json:
//   "registration": { "capacity": 40, "deadline": "2026-11-20", "questions": [ ... ] }
// "registration": false turns portal sign-up off. A real "registerUrl" (not "#") sends people to that link instead.

export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
/** Events can have a fixed "id" in events.json. Without one we make a stable one from the title and date. */
export const defaultEventId = e => `${slug(e.title)}-${e.start}`;
export const eventKey = e => e.id || defaultEventId(e);

const realUrl = u => !!u && u !== '#';

/** "2026-11-20" means the end of that day. "2026-11-20 17:00" (or with a T) is an exact time. Local time. */
export function parseDeadline(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim();
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59` : s.replace(' ', 'T'));
  return isNaN(d) ? null : d;
}

const QTYPES = ['text', 'yesno', 'choice', 'checkbox'];
export function normQuestions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map(q => {
    const label = String(q?.label || '').trim();
    if (!label) return null;
    const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
    let id = slug(q.id || label) || 'q', n = 2; const base = id;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);
    return { id, label, options, required: !!q.required, type: QTYPES.includes(q.type) ? q.type : options.length ? 'choice' : 'text' };
  }).filter(Boolean).slice(0, 10);
}

/** How people sign up for one event: { mode: 'portal' | 'external' | 'none', ... } */
export function regConfig(e) {
  const r = e.registration;
  if (r === false) return realUrl(e.registerUrl) ? { mode: 'external', url: e.registerUrl } : { mode: 'none' };
  if (r === undefined && realUrl(e.registerUrl)) return { mode: 'external', url: e.registerUrl };
  const o = r && typeof r === 'object' ? r : {};
  const cap = Math.floor(+o.capacity);
  return { mode: 'portal', capacity: cap > 0 ? cap : null, deadline: parseDeadline(o.deadline), questions: normQuestions(o.questions) };
}

/** When the event is over. */
export function eventEnd(e) {
  if (e.allDay) return new Date(`${e.end || e.start}T23:59:59`);
  return new Date(`${e.start}T${e.endTime || '23:59'}`);
}
export const eventStart = e => e.allDay ? new Date(`${e.start}T00:00:00`) : new Date(`${e.start}T${e.startTime || '00:00'}`);

/**
 * Works out who is in and who is waiting. `queue` is a list of { at, mine? } (any extra fields are kept).
 * People are served in the order they signed up. Only sign-ups made before the deadline count, and only the
 * first `capacity` of them are confirmed; the rest wait. Nothing is stored: when someone cancels, everyone
 * behind them moves up automatically.
 */
export function queueState(cfg, queue, now = new Date()) {
  const all = queue.map((x, i) => ({ ...x, at: new Date(x.at), _i: i })).sort((a, b) => a.at - b.at || a._i - b._i);
  const onTime = cfg.deadline ? all.filter(x => x.at <= cfg.deadline) : all;
  const late = cfg.deadline ? all.filter(x => x.at > cfg.deadline) : [];
  const confirmed = cfg.capacity ? onTime.slice(0, cfg.capacity) : onTime;
  const waitlist = cfg.capacity ? onTime.slice(cfg.capacity) : [];
  let mine = null, k;
  if ((k = confirmed.findIndex(x => x.mine)) >= 0) mine = { state: 'confirmed', position: k + 1 };
  else if ((k = waitlist.findIndex(x => x.mine)) >= 0) mine = { state: 'waitlisted', position: k + 1 };
  else if (late.some(x => x.mine)) mine = { state: 'late', position: 0 };
  return {
    capacity: cfg.capacity, confirmed, waitlist, late, mine,
    spotsLeft: cfg.capacity ? Math.max(0, cfg.capacity - confirmed.length) : null,
    full: !!cfg.capacity && confirmed.length >= cfg.capacity,
    deadlinePassed: !!cfg.deadline && now > cfg.deadline
  };
}

/** Can someone who isn't signed up yet sign up now? */
export function signUpStatus(ev, cfg, st, now = new Date()) {
  if (now > eventEnd(ev)) return { open: false, reason: 'This event has passed.' };
  if (st.deadlinePassed) return { open: false, reason: 'Sign-up has closed.' };
  return { open: true, waitlist: st.full };
}

/** Checks the answers to an event's questions. Returns an error message, or '' if all is well. */
export function checkAnswers(cfg, answers) {
  for (const q of cfg.questions || []) {
    const v = answers[q.id];
    if (q.required && (v === undefined || v === null || v === '' || v === false)) return `Please answer: ${q.label}`;
    if (typeof v === 'string' && v.length > 500) return `Your answer to "${q.label}" is too long.`;
  }
  return '';
}
