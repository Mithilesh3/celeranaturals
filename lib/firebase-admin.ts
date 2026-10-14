import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const ADMIN_APP = "celeranaturals-admin";

/**
 * Server-only by construction. None of these names carry a NEXT_PUBLIC prefix,
 * and Next only inlines NEXT_PUBLIC_* into client bundles — a non-prefixed
 * process.env read in a client component evaluates to undefined rather than
 * leaking the value. This module is imported exclusively from route handlers.
 */
function credentials() {
  // The project id is not a secret and is already configured for the web SDK,
  // so fall back to it rather than making you set the same value twice.
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Private keys are stored with literal \n escapes in most dashboards.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

export function isAdminConfigured(): boolean {
  const { projectId, clientEmail, privateKey } = credentials();
  return Boolean(projectId && clientEmail && privateKey);
}

/** Variable NAMES only, so a misconfiguration can be reported without leaking values. */
export function missingAdminKeys(): string[] {
  const { projectId, clientEmail, privateKey } = credentials();
  return [
    !projectId && "FIREBASE_PROJECT_ID",
    !clientEmail && "FIREBASE_CLIENT_EMAIL",
    !privateKey && "FIREBASE_PRIVATE_KEY",
  ].filter((name): name is string => Boolean(name));
}

/** Initialised lazily inside request handlers so a missing key cannot break the build. */
function adminApp(): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP);
  if (existing) return existing;
  const { projectId, clientEmail, privateKey } = credentials();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin is not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).");
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, ADMIN_APP);
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

/**
 * The initialised Admin app itself, for SDKs that need it passed explicitly.
 * This is a named app, so getStorage() with no argument would look for the
 * default app and fail.
 */
export function ensureAdminApp(): App {
  return adminApp();
}

export { getApp };
