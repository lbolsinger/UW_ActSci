// Loads Supabase from the jsDelivr CDN. This file is only loaded when someone
// opens the Account page, so the rest of the site never depends on it.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JS_VERSION as V } from './config.js';

const { createClient } = await import(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${V}/+esm`);

export const supabase = createClient(
  window.__TEST_SUPABASE__?.url || SUPABASE_URL,
  window.__TEST_SUPABASE__?.key || SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,        // stay signed in on this device
      autoRefreshToken: true,
      detectSessionInUrl: false,   // we sign in with a typed code, not a link, so the URL is never used
      storageKey: 'actsci-club-auth'
    }
  }
);
