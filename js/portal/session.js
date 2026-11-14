// Who is signed in, and what are they allowed to see?
import { supabase } from './supabase.js';
import { read } from './db.js';
import { adminEmail, isMemberEmail } from './config.js';

export const session = {
  user: null, email: '', profile: null,
  isMember: false, isExec: false, isAdmin: false, displayName: ''
};

let started;
async function load(authUser) {
  // The pages use session.user.uid, so we keep that name.
  session.user = authUser ? { uid: authUser.id, email: authUser.email } : null;
  session.email = (authUser?.email || '').toLowerCase();
  session.profile = null;
  session.isAdmin = !!authUser && session.email === adminEmail();
  session.isMember = !!authUser && isMemberEmail(session.email);
  session.isExec = session.isAdmin;
  session.displayName = '';
  if (!authUser) return;
  if (session.isMember) {
    session.profile = await read('users', authUser.id);
    if (!session.isExec) session.isExec = !!(await read('execs', session.email));
  }
  session.displayName = session.profile?.name || session.email;
}

const currentUser = async () => (await supabase.auth.getSession()).data.session?.user ?? null;

/** Resolves once we have worked out whether someone is signed in. */
export function init() {
  started ??= (async () => {
    try { await load(await currentUser()); } catch (e) { console.error(e); }
  })();
  return started;
}
export const reload = async () => load(await currentUser());
