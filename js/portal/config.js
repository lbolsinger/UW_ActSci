// ============================================================================
// MEMBER PORTAL SETTINGS
// Fill these in after you create your Supabase project (see SUPABASE_SETUP.md).
// None of this is secret: Supabase designs the project URL and the public key
// to be visible in the page. Your data is protected by the rules in
// supabase/schema.sql, not by hiding these values.
// ============================================================================

// From the Supabase dashboard: Project Settings > API (or the "Connect" button).
export const SUPABASE_URL = "https://kjijxlqastzrqlbqqwip.supabase.co";            // like https://abcdefgh.supabase.co
export const SUPABASE_ANON_KEY = "sb_publishable_xINUM-T8FA2C6-5L6yoWXA_1jaWnj0B";        // the "anon" or "publishable" key. NEVER the service_role / secret key.

// The club's email account. It must also be typed into supabase/schema.sql,
// in the app_admin_email() function.
export const ADMIN_EMAIL = "lisa.bolsinger06@gmail.com";

// Only members with this email ending can register.
export const MEMBER_EMAIL_ENDING = "@uwaterloo.ca";

// Version of Supabase's browser library to load (loaded from the jsDelivr CDN).
export const SUPABASE_JS_VERSION = "2.119.0";

// ---- no need to edit below this line ----
export const adminEmail = () => (window.__TEST_ADMIN_EMAIL__ || ADMIN_EMAIL).toLowerCase();
export const isConfigured = () =>
  !![SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL].every(v => v && !/^PASTE_/.test(v)) || !!window.__TEST_SUPABASE__;
export const isMemberEmail = e => e.toLowerCase().endsWith(MEMBER_EMAIL_ENDING);
