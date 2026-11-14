// Passwordless sign-in: we email a 6-digit code; typing it in signs the person in.
// (A code works better than a link here: university email security often opens links
// automatically, which uses them up, and a code works on any device.)
import { supabase } from './supabase.js';
import { isMemberEmail, adminEmail } from './config.js';

export const allowedEmail = e => isMemberEmail(e) || e.toLowerCase() === adminEmail();

/** Emails a sign-in code. The same step creates the account for someone new. */
export async function sendCode(email) {
  email = email.trim().toLowerCase();
  if (!allowedEmail(email)) throw new Error('Please use your @uwaterloo.ca email address.');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  return email;
}

/** Checks the code. On success the person is signed in on this device. */
export async function verifyCode(email, code) {
  const token = String(code).replace(/\s+/g, '');
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
  if (error) throw error;
  return data;
}

export const signOut = () => supabase.auth.signOut();
