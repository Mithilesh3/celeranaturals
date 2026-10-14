import { adminAuth } from "./firebase-admin";

export type VerifiedUser = {
  uid: string;
  phoneNumber: string | null;
  /** Set by Firebase from the auth provider; never read from a request body. */
  email: string | null;
  name: string | null;
  /**
   * The `auth_time` claim: when this user actually authenticated, in seconds.
   * Signed by Firebase as part of the token, so it cannot be moved by a caller.
   * Used to count sign-ins without a replayed request inflating the total.
   */
  authTime: number | null;
  /** Sign-in method recorded in the token, e.g. "phone" or "password". */
  signInProvider: string | null;
};

/**
 * Verifies the Firebase ID token from `Authorization: Bearer <token>`.
 * A request is anonymous until this succeeds; nothing the browser asserts
 * about its own identity is trusted.
 */
export async function requireUser(request: Request): Promise<VerifiedUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/i.exec(header.trim());
  if (!match) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(match[1], true);
    return {
      uid: decoded.uid,
      phoneNumber: (decoded.phone_number as string | undefined) ?? null,
      email: (decoded.email as string | undefined) ?? null,
      name: (decoded.name as string | undefined) ?? null,
      authTime: typeof decoded.auth_time === "number" ? decoded.auth_time : null,
      signInProvider: (decoded.firebase?.sign_in_provider as string | undefined) ?? null,
    };
  } catch {
    // Expired, malformed, revoked, or signed by another project.
    return null;
  }
}
