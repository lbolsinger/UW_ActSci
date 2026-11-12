// Recording a payment: updates the membership, the private payment record and the history, together.
import { ref, stamp, F } from './db.js';
import { session } from './session.js';

export function validatePayment({ method, number }) {
  if (!['wusa', 'cash'].includes(method)) return 'Choose WUSA or cash.';
  if (method === 'wusa' && !/^\d{6}$/.test(String(number || '').replace(/\s+/g, ''))) return 'Enter the 6-digit WUSA confirmation number.';
  return '';
}

/** Adds the writes for "mark as paid" to a batch. */
export function addPaid(b, { uid, termId, method, number }) {
  const id = `${uid}_${termId}`;
  const by = session.displayName, byEmail = session.email;
  const num = method === 'wusa' ? String(number).replace(/\s+/g, '') : '';
  b.update(ref('memberships', id), { paid: true, paidAt: stamp() });
  b.set(ref('payments', id), {
    uid, termId, method, wusaNumber: num, verifiedByName: by, verifiedByEmail: byEmail, at: stamp(),
    history: F.arrayUnion({ action: 'paid', method, wusaNumber: num, by, byEmail, at: Date.now() })
  }, { merge: true });
}
/** Undo a payment (kept in the history). */
export function addUnpaid(b, { uid, termId }) {
  const id = `${uid}_${termId}`;
  b.update(ref('memberships', id), { paid: false, paidAt: F.deleteField() });
  b.set(ref('payments', id), {
    history: F.arrayUnion({ action: 'unpaid', by: session.displayName, byEmail: session.email, at: Date.now() })
  }, { merge: true });
}

/** Renewing for an exec-run member: creates this term's membership already paid. */
export function addRenewalPaid(b, { uid, termId, user, method, number }) {
  const id = `${uid}_${termId}`;
  const by = session.displayName, byEmail = session.email;
  const num = method === 'wusa' ? String(number).replace(/\s+/g, '') : '';
  b.set(ref('memberships', id), {
    uid, email: user.email, termId, name: user.name, year: user.year, workTerm: user.workTerm, dietary: user.dietary || '',
    paid: true, paidAt: stamp(), registeredAt: stamp()
  });
  b.set(ref('payments', id), {
    uid, termId, method, wusaNumber: num, verifiedByName: by, verifiedByEmail: byEmail, at: stamp(),
    history: F.arrayUnion({ action: 'renewed and paid', method, wusaNumber: num, by, byEmail, at: Date.now() })
  }, { merge: true });
}
