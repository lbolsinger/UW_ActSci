// Who is signed in, and what are they allowed to see?
import { auth, A } from './firebase.js';
import { read } from './db.js';
import { adminEmail, isMemberEmail } from './config.js';

export const session = {
  user: null, email: '', profile: null,
  isMember: false, isExec: false, isAdmin: false, displayName: ''
};

let started;
async function load(user) {
  session.user = user;
  session.email = (user?.email || '').toLowerCase();
  session.profile = null;
  session.isAdmin = !!user && session.email === adminEmail();
  session.isMember = !!user && isMemberEmail(session.email);
  session.isExec = session.isAdmin;
  session.displayName = '';
  if (!user) return;
  if (session.isMember) {
    session.profile = await read('users', user.uid);
    if (!session.isExec) session.isExec = !!(await read('execs', session.email));
  }
  session.displayName = session.profile?.name || session.email;
}

/** Resolves once Firebase has worked out whether someone is signed in. */
export function init() {
  started ??= new Promise(resolve => {
    A.onAuthStateChanged(auth, async user => {
      try { await load(user); } catch (e) { console.error(e); }
      resolve();
    });
  });
  return started;
}
export const reload = () => load(auth.currentUser);
