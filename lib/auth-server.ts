import { adminAuth } from "./firebase-admin";

export type VerifiedUser = { uid: string; phoneNumber: string | null; name: string | null };

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
      name: (decoded.name as string | undefined) ?? null,
    };
  } catch {
    // Expired, malformed, revoked, or signed by another project.
    return null;
  }
}
