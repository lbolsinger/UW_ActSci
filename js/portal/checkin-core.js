// Checking in to an event (by an exec, by the member on their phone, or via the door QR code).
import { parse, addDays } from '../utils.js';
import { db, F, ref, read, stamp } from './db.js';
import { session } from './session.js';
import { termId } from './terms.js';

export function eventWindow(e, minutesBefore) {
  let start, end;
  if (e.allDay) { start = parse(e.start); end = addDays(parse(e.end || e.start), 1); }
  else { start = new Date(`${e.start}T${e.startTime}`); end = new Date(`${e.start}T${e.endTime}`); }
  return { opens: new Date(start.getTime() - minutesBefore * 60000), start, end };
}
export const isOpen = (e, minutesBefore, now = new Date()) => {
  const w = eventWindow(e, minutesBefore); return now >= w.opens && now <= w.end;
};

/** Sign the signed-in member in to an event. Returns {status} */
export async function selfCheckIn(event, term, method = 'self') {
  const uid = session.user.uid, tid = termId(term);
  const id = `${event.id}_${uid}`;
  const existing = await read('attendance', id);
  if (existing) return { status: 'already', at: existing.at };
  await F.setDoc(ref('attendance', id), {
    eventId: event.id, eventTitle: event.title, uid, email: session.email,
    name: session.profile?.name || session.email, termId: tid, method, by: '', at: stamp()
  });
  return { status: 'ok' };
}
