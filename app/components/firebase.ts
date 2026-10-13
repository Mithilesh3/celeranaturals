import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Each value is referenced as a literal process.env.* member so Next can inline
// it at build time. These are NEXT_PUBLIC_ by design: Firebase web config is
// client-visible, and access is controlled by Security Rules and the Authorized
// Domains list, not by hiding these values.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** Names only — never the values — so a misconfiguration can be reported safely. */
export function missingFirebaseConfigKeys(): string[] {
  return Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function isFirebaseConfigured() {
  // measurementId is optional for Authentication.
  return missingFirebaseConfigKeys().every((key) => key === "measurementId");
}

function getFirebaseApp(): FirebaseApp {
  // getApps() guard keeps initialization to exactly once across HMR and remounts.
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Check NEXT_PUBLIC_FIREBASE_* in .env.local.");
  }
  return getAuth(getFirebaseApp());
}
