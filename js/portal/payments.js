// Payments: what state a membership is in, and every way it can change.
//
// A membership is always in one of these states (see payState):
//   awaiting     registered, nothing paid yet (cash is paid at the office and an exec marks it)
//   confirming   the member entered a WUSA confirmation number. They get a TRIAL: they can sign in to events
//                (not programs or discount codes) until `verifyBy`, three weeks later, which is when an exec
//                checks the payment with WUSA. The trial can only be used once per term (`trialUsed`).
//   flagged      something needs an exec's review (the same WUSA number is on two accounts, or WUSA could not
//                find the payment). The trial stops while a membership is flagged.
//   paid         an exec confirmed it. Full access.
// "paid" can also carry a flag (a flagged account an exec had already marked paid): access is unchanged,
// but the flag stays visible to execs until they clear it.
import { ref, stamp, F, list, col, where } from './db.js';
import { supabase } from './supabase.js';
import { session } from './session.js';
import { badge, toDate } from './ui.js';

export const TRIAL_DAYS = 14;

export const FLAG_REASONS = {
  'duplicate-wusa': 'The same WUSA confirmation number is on another account',
  'wusa-not-found': 'Unverified: this payment could not be found in WUSA\'s records'
};
export const flagText = m => FLAG_REASONS[m?.flagReason] || 'Flagged for review';
/** Short label for the exec badges: "Flag: Duplicate" / "Flag: Unverified". */
export const flagShort = m => ({ 'duplicate-wusa': 'Duplicate', 'wusa-not-found': 'Unverified' }[m?.flagReason] || 'Flagged');

/** 'none' | 'awaiting' | 'confirming' | 'flagged' | 'paid' */
export const payState = m => !m ? 'none' : m.paid ? 'paid' : m.flagged ? 'flagged' : m.payStatus === 'confirming' ? 'confirming' : 'awaiting';

/** The member is in their WUSA trial: number entered, not flagged, and the 3 weeks haven't run out. */
export const trialActive = (m, now = Date.now()) =>
  !!m && !m.paid && !m.flagged && m.payStatus === 'confirming' && !!m.verifyBy && toDate(m.verifyBy) > now;

/** The trial window has run out and nobody has confirmed the payment yet. */
export const trialEnded = (m, now = Date.now()) =>
  !!m && !m.paid && !m.flagged && m.payStatus === 'confirming' && !!m.verifyBy && toDate(m.verifyBy) <= now;

/** Can this membership sign in to events? (Matches app_event_access in schema.sql.) */
export const canSignIn = m => !!m && (!!m.paid || trialActive(m));

/** An exec should check this one with WUSA now (the 3 weeks are up). */
export const verifyDue = m => payState(m) === 'confirming' && !!m.verifyBy && toDate(m.verifyBy) <= Date.now();

/** The status badge, for execs (with detail) or members (plain). */
export function payBadge(m, { pay, exec = false } = {}) {
  switch (payState(m)) {
    case 'paid': {
      const how = exec && pay ? (pay.method === 'wusa' ? `WUSA · ${pay.wusaNumber}` : `Cash · ${pay.verifiedByName || ''}`) : 'Paid';
      return badge(how, 'b-paid') + (exec && m.flagged ? ' ' + badge('Flag: ' + flagShort(m), 'b-flag') : '');
    }
    case 'flagged': return badge(exec ? 'Flag: ' + flagShort(m) : m.flagReason === 'wusa-not-found' ? 'Unverified' : 'Under review', 'b-flag');
    case 'confirming': return badge(verifyDue(m) ? 'Verify with WUSA' : 'Awaiting confirmation', verifyDue(m) ? 'b-flag' : 'b-trial');
    default: return badge('Awaiting payment', 'b-wait');
  }
}

/* --------------------------------------------------------------- member side */
const cleanMessage = msg => String(msg || '').replace(/^[a-z-]+:\s*/i, '');

/** The member enters their WUSA confirmation number. Returns { status: 'confirming' | 'flagged' | 'paid' }. */
export async function submitWusa(termId, number) {
  const { data, error } = await supabase.rpc('submit_wusa_payment', { p_term: termId, p_number: String(number || '') });
  if (error) throw new Error(cleanMessage(error.message));
  return data;
}

/* --------------------------------------------------------------- exec side */
export function validatePayment({ method, number }) {
  if (!['wusa', 'cash'].includes(method)) return 'Choose WUSA or cash.';
  if (method === 'wusa' && !/^\d{6}$/.test(String(number || '').replace(/\s+/g, ''))) return 'Enter the 6-digit WUSA confirmation number.';
  return '';
}

const historyEntry = (action, extra = {}) => F.arrayUnion({ action, by: session.displayName, byEmail: session.email, at: Date.now(), ...extra });

/** Adds the writes for "mark as paid" to a batch. `how` is a note for the history ("confirmed from proof"). */
export function addPaid(b, { uid, termId, method, number, how = '' }) {
  const id = `${uid}_${termId}`;
  const by = session.displayName, byEmail = session.email;
  const num = method === 'wusa' ? String(number).replace(/\s+/g, '') : '';
  b.update(ref('memberships', id), { paid: true, payStatus: 'paid', paidAt: stamp() });
  b.set(ref('payments', id), {
    uid, termId, method, wusaNumber: num, verifiedByName: by, verifiedByEmail: byEmail, at: stamp(),
    history: F.arrayUnion({ action: how ? `paid (${how})` : 'paid', method, wusaNumber: num, by, byEmail, at: Date.now() })
  }, { merge: true });
}
/** Undo a payment (kept in the history). */
export function addUnpaid(b, { uid, termId, directoryEntry }) {
  const id = `${uid}_${termId}`;
  // Programs are for paid members, so an unpaid mentor loses the Mentor badge too.
  if (directoryEntry?.isMentor) b.update(ref('directory', uid), { isMentor: false });
  b.update(ref('memberships', id), { paid: false, payStatus: 'awaiting', paidAt: F.deleteField() });
  b.set(ref('payments', id), { history: historyEntry('unpaid') }, { merge: true });
}

/** Renewing for an exec-run member: creates this term's membership already paid. */
export function addRenewalPaid(b, { uid, termId, user, method, number }) {
  const id = `${uid}_${termId}`;
  const by = session.displayName, byEmail = session.email;
  const num = method === 'wusa' ? String(number).replace(/\s+/g, '') : '';
  b.set(ref('memberships', id), {
    uid, email: user.email, termId, name: user.name, year: user.year, workTerm: user.workTerm, dietary: user.dietary || '',
    paid: true, payStatus: 'paid', paidAt: stamp(), registeredAt: stamp()
  });
  b.set(ref('payments', id), {
    uid, termId, method, wusaNumber: num, verifiedByName: by, verifiedByEmail: byEmail, at: stamp(),
    history: F.arrayUnion({ action: 'renewed and paid', method, wusaNumber: num, by, byEmail, at: Date.now() })
  }, { merge: true });
}

/** WUSA could not find this payment: flag it. (The trial stops; the member is told to email proof.) */
export function addWusaNotFound(b, { uid, termId }) {
  const id = `${uid}_${termId}`;
  b.update(ref('memberships', id), { flagged: true, flagReason: 'wusa-not-found', flaggedAt: stamp() });
  b.set(ref('payments', id), { history: historyEntry('flagged: WUSA could not find this payment') }, { merge: true });
}
/** An exec has looked into a flag and is happy. */
export function addClearFlag(b, { uid, termId }) {
  const id = `${uid}_${termId}`;
  b.update(ref('memberships', id), { flagged: false, flagReason: F.deleteField(), flaggedAt: F.deleteField() });
  b.set(ref('payments', id), { history: historyEntry('flag cleared') }, { merge: true });
}

/** Other payment records that already use this WUSA number (execs can read payments). */
export async function findDuplicates(number, exceptId) {
  const num = String(number || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(num)) return [];
  return (await list(col('payments'), where('wusaNumber', '==', num))).filter(p => p.id !== exceptId);
}
/** Flags the other accounts using the same number, and this one. */
export function addDuplicateFlags(b, { uid, termId, others }) {
  const id = `${uid}_${termId}`;
  const flag = { flagged: true, flagReason: 'duplicate-wusa', flaggedAt: stamp() };
  b.update(ref('memberships', id), flag);
  b.set(ref('payments', id), { history: historyEntry('flagged: this WUSA number is on another account') }, { merge: true });
  for (const o of others) {
    b.update(ref('memberships', o.id), flag);
    b.set(ref('payments', o.id), { history: historyEntry('flagged: the same WUSA number was entered on another account') }, { merge: true });
  }
}

/** Before an exec records a WUSA number: if it is already on another account, ask. Returns the other payment
    records ([] if none), or null if the exec backed out. `nameOf(uid)` is used to say whose they are. */
export async function checkDuplicates(number, exceptId, nameOf = () => '') {
  const others = await findDuplicates(number, exceptId);
  if (!others.length) return [];
  const who = others.map(o => nameOf(o.uid) || 'another member').join(', ');
  return confirm(`This WUSA number is already on ${who}'s account.\n\nContinue and flag both accounts for review?`) ? others : null;
}
