// Loads every JSON file in /data once, and exposes helpers built on top of them.
import { iso, parse, addDays } from './utils.js';

export const store = {};   // filled by loadData()

const get = async name => {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`Could not load data/${name}.json (${res.status})`);
  return res.json();
};

export async function loadData() {
  const [site, keyDates, events, officeHours, execTeams, resources, programs] = await Promise.all([
    get('site'), get('key-dates'), get('events'), get('office-hours'),
    get('execs'), get('resources'), get('programs')
  ]);
  Object.assign(store, { site, keyDates, events, officeHours, execTeams, resources, programs });

  // office-hours.json only stores exec ids; join them to the exec details
  const execById = {};
  execTeams.forEach(t => t.members.forEach(m => { execById[m.id] = m; }));
  store.ohPeople = officeHours.people.map(p => {
    const exec = execById[p.execId];
    if (!exec) console.warn(`office-hours.json: no exec with id "${p.execId}" in execs.json`);
    return { ...(exec || { name: p.execId, role: '' }), color: p.color, officeHours: p.slots };
  });

  // one flat list for the calendar
  store.items = [
    ...keyDates.map(k => ({ type: 'key', title: k.title, start: k.start, end: k.end || k.start, allDay: true, ref: k })),
    ...events.map(e => ({ type: 'event', title: e.title, start: e.start, end: (e.allDay && e.end) || e.start,
                          allDay: !!e.allDay, startTime: e.startTime, ref: e }))
  ];
}

/** Office hours happening on a given Date (respects periods and paused weeks). */
export function officeHoursOn(date) {
  const k = iso(date);
  const { periods } = store.officeHours;
  if (!periods.some(p => k >= p.start && k <= p.end)) return [];
  if (store.keyDates.some(x => x.pausesOfficeHours && k >= x.start && k <= (x.end || x.start))) return [];
  const out = [];
  store.ohPeople.forEach(p => p.officeHours.forEach(s => { if (s.day === date.getDay()) out.push({ p, s }); }));
  return out.sort((a, b) => a.s.start.localeCompare(b.s.start));
}

/** Calendar items (key dates + events) covering a "YYYY-MM-DD" day. */
export const itemsOn = k => store.items.filter(i => k >= i.start && k <= i.end);

/** The next event that hasn't finished yet. */
export function nextEvent() {
  const now = new Date();
  const endOf = e => e.allDay
    ? addDays(parse(e.end || e.start), 1)
    : new Date(parse(e.start).setHours(...(e.endTime || '23:59').split(':').map(Number)));
  return store.events
    .filter(e => endOf(e) > now)
    .sort((a, b) => parse(a.start) - parse(b.start) || (a.startTime || '').localeCompare(b.startTime || ''))[0];
}
