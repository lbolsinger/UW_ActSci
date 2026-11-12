// Loads Firebase from Google's servers. This file is only loaded when someone
// opens the Account page, so the rest of the site never depends on it.
import { firebaseConfig, FIREBASE_SDK_VERSION as V } from './config.js';

const base = `https://www.gstatic.com/firebasejs/${V}`;
const [appMod, authMod, fsMod] = await Promise.all([
  import(`${base}/firebase-app.js`),
  import(`${base}/firebase-auth.js`),
  import(`${base}/firebase-firestore.js`)
]);

export const app = appMod.initializeApp(window.__TEST_FIREBASE_CONFIG__ || firebaseConfig);
export const auth = authMod.getAuth(app);
export const db = fsMod.getFirestore(app);
export const A = authMod;   // sign-in functions
export const F = fsMod;     // database functions

// Used only by automated tests (a local copy of Firebase). Does nothing on the real site.
if (window.__USE_EMULATORS__) {
  authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  fsMod.connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
