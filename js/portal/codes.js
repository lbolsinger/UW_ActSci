// Discount codes (Coaching Actuaries, ACTEX…). The codes themselves live in the database, not in this public repo:
// only the club account can read them, and a paid member sees one only by pressing Request, which logs who asked.
import { supabase } from './supabase.js';

const clean = msg => String(msg || '').replace(/^[a-z-]+:\s*/i, '');

/** The codes a paid member can ask for: [{ key, label, note, requested }] (no code values). */
export async function listCodes(termId) {
  const { data, error } = await supabase.rpc('list_discount_codes', { p_term: termId });
  if (error) throw new Error(clean(error.message));
  return data || [];
}

/** Reveals one code and records the request. Returns { label, code, note }. */
export async function requestCode(key, termId) {
  const { data, error } = await supabase.rpc('request_discount_code', { p_key: key, p_term: termId });
  if (error) throw new Error(clean(error.message));
  return data;
}
