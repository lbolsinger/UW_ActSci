// Small wrappers so the pages stay readable.
import { db, F } from './firebase.js';
export { db, F };

export const col = (...path) => F.collection(db, ...path);
export const ref = (...path) => F.doc(db, ...path);
export const stamp = () => F.serverTimestamp();
export const where = (...a) => F.where(...a);

/** Read one document, or null if it doesn't exist. */
export async function read(...path) {
  const s = await F.getDoc(ref(...path));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
/** Read many documents (optionally filtered). */
export async function list(c, ...constraints) {
  const s = await F.getDocs(constraints.length ? F.query(c, ...constraints) : c);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
/** Live-updating query. Returns a function that stops listening. */
export function watch(c, constraints, onData, onError) {
  const q = constraints.length ? F.query(c, ...constraints) : c;
  return F.onSnapshot(q, s => onData(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError || console.error);
}
export const batch = () => F.writeBatch(db);
