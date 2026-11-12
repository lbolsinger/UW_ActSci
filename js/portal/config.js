// ============================================================================
// MEMBER PORTAL SETTINGS
// Fill these in after you create your Firebase project (see SETUP.md).
// None of this is secret: Firebase designs these values to be public.
// Your data is protected by the rules in firestore.rules, not by hiding this.
// ============================================================================

// From Firebase console: Project settings > Your apps > Web app > Config
export const firebaseConfig = {
  apiKey: "AIzaSyD_x2Nvgh-sPgItC0uEoecWbY-JNIFpf84",
  authDomain: "actsci-club.firebaseapp.com",
  projectId: "actsci-club",
  storageBucket: "actsci-club.firebasestorage.app",
  messagingSenderId: "31244712653",
  appId: "1:31244712653:web:3f01b09083e0d217540784"
};

// The club's Google account (owner of the Firebase project). It must also be
// typed into firestore.rules, in the adminEmail() function.
export const ADMIN_EMAIL = "lucy.bollinger.spam@gmail.com";

// Only members with this email ending can register.
export const MEMBER_EMAIL_ENDING = "@uwaterloo.ca";

// Version of Firebase's browser library to load (loaded from Google's servers).
export const FIREBASE_SDK_VERSION = "12.19.0";

// ---- no need to edit below this line ----
export const adminEmail = () => (window.__TEST_ADMIN_EMAIL__ || ADMIN_EMAIL).toLowerCase();
export const isConfigured = () =>
  !!window.__USE_EMULATORS__ ||
  ![...Object.values(firebaseConfig), ADMIN_EMAIL].some(v => /^PASTE_/.test(v));
export const isMemberEmail = e => e.toLowerCase().endsWith(MEMBER_EMAIL_ENDING);
