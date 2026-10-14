import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { USERS_COLLECTION } from "./saved-addresses";
import type { VerifiedUser } from "./auth-server";

/**
 * Persistent customer profile records. SERVER ONLY.
 *
 * Firebase Authentication already records the single most recent sign-in on
 * each account, and that is left as the authoritative `lastSignInAt` — it is
 * written by Firebase itself when a user authenticates, so no client can forge
 * it. What Firebase does NOT keep is any history: there is no sign-in count and
 * no record of when an account first became active. That is what this adds.
 *
 * The record is keyed by uid and written only from a verified ID token.
 * Nothing sensitive is stored: no password, no password hash, no ID token, no
 * refresh token. Only timestamps, a count, and the sign-in method name that
 * Firebase itself put in the token.
 *
 * Identity fields (name, phone, email) are deliberately NOT mirrored here. The
 * Auth record stays the single source of truth for those, so the two can never
 * drift apart.
 */
export type CustomerProfileRecord = {
  uid: string;
  /** ISO. First time this account was seen signing in. Set once, never moved. */
  firstSignInAt: string | null;
  /** ISO, derived from the token's auth_time claim. */
  lastAuthAt: string | null;
  /** Successful authentications observed since this feature was added. */
  signInCount: number;
  /** Most recent sign-in method, from the token's firebase.sign_in_provider. */
  lastSignInProvider: string | null;
  updatedAt: string;
};

export type SignInOutcome = { counted: boolean; signInCount: number };

/**
 * Records one successful authentication.
 *
 * The count advances only when the token's `auth_time` is newer than the one
 * already stored. Because `auth_time` is a signed claim that only changes when
 * the user genuinely re-authenticates, replaying this request — or simply
 * reloading the page with the same session — cannot inflate the total.
 */
export async function recordSignIn(user: VerifiedUser): Promise<SignInOutcome> {
  if (user.authTime === null) return { counted: false, signInCount: 0 };

  const authAt = new Date(user.authTime * 1000).toISOString();
  const ref = adminDb().collection(USERS_COLLECTION).doc(user.uid);

  return adminDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const existing = snapshot.exists ? snapshot.data() : undefined;
    const previousAuthAt = typeof existing?.lastAuthAt === "string" ? existing.lastAuthAt : null;
    const currentCount = Number(existing?.signInCount ?? 0);

    // Same authentication seen again: refresh nothing but the heartbeat.
    if (previousAuthAt && previousAuthAt >= authAt) {
      return { counted: false, signInCount: currentCount };
    }

    const signInCount = currentCount + 1;
    tx.set(ref, {
      uid: user.uid,
      firstSignInAt: existing?.firstSignInAt ?? authAt,
      lastAuthAt: authAt,
      signInCount,
      lastSignInProvider: user.signInProvider,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { counted: true, signInCount };
  });
}

/** Reads the stored profile, or null when the account has never been recorded. */
export async function getCustomerProfile(uid: string): Promise<CustomerProfileRecord | null> {
  const snapshot = await adminDb().collection(USERS_COLLECTION).doc(uid).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data()!;
  // The document also carries addresses metadata and profileHistory; a record
  // that has never seen a sign-in simply has no sign-in fields.
  if (data.signInCount === undefined && data.lastAuthAt === undefined) return null;
  return {
    uid,
    firstSignInAt: typeof data.firstSignInAt === "string" ? data.firstSignInAt : null,
    lastAuthAt: typeof data.lastAuthAt === "string" ? data.lastAuthAt : null,
    signInCount: Number(data.signInCount ?? 0),
    lastSignInProvider: typeof data.lastSignInProvider === "string" ? data.lastSignInProvider : null,
    updatedAt: String(data.updatedAt ?? ""),
  };
}

/** Bulk read for the admin directory, chunked to respect getAll limits. */
export async function getCustomerProfiles(uids: string[]): Promise<Map<string, CustomerProfileRecord>> {
  const found = new Map<string, CustomerProfileRecord>();
  const unique = [...new Set(uids)];
  const db = adminDb();

  for (let index = 0; index < unique.length; index += 300) {
    const batch = unique.slice(index, index + 300);
    if (!batch.length) continue;
    const refs = batch.map((uid) => db.collection(USERS_COLLECTION).doc(uid));
    const snapshots = await db.getAll(...refs);
    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      const data = snapshot.data()!;
      if (data.signInCount === undefined && data.lastAuthAt === undefined) continue;
      found.set(snapshot.id, {
        uid: snapshot.id,
        firstSignInAt: typeof data.firstSignInAt === "string" ? data.firstSignInAt : null,
        lastAuthAt: typeof data.lastAuthAt === "string" ? data.lastAuthAt : null,
        signInCount: Number(data.signInCount ?? 0),
        lastSignInProvider: typeof data.lastSignInProvider === "string" ? data.lastSignInProvider : null,
        updatedAt: String(data.updatedAt ?? ""),
      });
    }
  }
  return found;
}

export { FieldValue };
