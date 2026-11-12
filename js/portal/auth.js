// Passwordless sign-in: we email a link; opening it signs the person in.
import { auth, A } from './firebase.js';
import { isMemberEmail, adminEmail } from './config.js';

const KEY = 'emailForSignIn';

export const allowedEmail = e => isMemberEmail(e) || e.toLowerCase() === adminEmail();

export async function sendLink(email) {
  email = email.trim().toLowerCase();
  if (!allowedEmail(email)) throw new Error('Please use your @uwaterloo.ca email address.');
  // After clicking the link, bring them back to the page they were on.
  const url = location.origin + location.pathname + (location.hash || '#account');
  await A.sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  localStorage.setItem(KEY, email);
}
export const hasPendingLink = () => A.isSignInWithEmailLink(auth, location.href);
export const storedEmail = () => localStorage.getItem(KEY);

export async function finishLink(email) {
  const cred = await A.signInWithEmailLink(auth, email.trim().toLowerCase(), location.href);
  localStorage.removeItem(KEY);
  history.replaceState(null, '', location.pathname + (location.hash || '#account'));  // tidy the address bar
  return cred;
}
export const signOut = () => A.signOut(auth);
