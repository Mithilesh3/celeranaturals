import { requireUser, type VerifiedUser } from "./auth-server";

/**
 * Admin authorization. SERVER ONLY — this module reaches firebase-admin, so it
 * must never be imported from a client component. The client-safe fulfilment
 * model lives in ./fulfilment.
 *
 * Identity comes from a Firebase ID token verified by the Admin SDK. The email
 * on that token is set by Firebase from the auth provider, not by the caller,
 * so it cannot be spoofed by a request body, header or local-storage value.
 * The allowlist is a server-only environment variable, so a customer cannot
 * promote themselves and no client flag has any effect.
 */
export type AdminUser = VerifiedUser;

/** Comma-separated addresses, e.g. "celeranatural@gmail.com,ops@example.com". */
function allowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminAllowlistConfigured() {
  return allowlist().length > 0;
}

export type AdminCheck =
  | { ok: true; user: AdminUser }
  /** No/invalid token, or a token with no email claim. */
  | { ok: false; reason: "unauthenticated" }
  /** Verified identity, but ADMIN_EMAILS is empty — a server misconfiguration. */
  | { ok: false; reason: "unconfigured" }
  /** Verified identity, but this email is not on the allowlist. */
  | { ok: false; reason: "forbidden"; email: string };

/**
 * Single authorization decision for every admin endpoint. Always fails closed.
 *
 * The distinction between "unconfigured" and "forbidden" is only ever revealed
 * to a caller who already holds a verified token, so it cannot be used by an
 * anonymous probe to learn anything about the deployment.
 */
export async function checkAdmin(request: Request): Promise<AdminCheck> {
  const user = await requireUser(request);
  if (!user?.email) return { ok: false, reason: "unauthenticated" };

  const list = allowlist();
  if (!list.length) return { ok: false, reason: "unconfigured" };

  // Compared case-insensitively and whitespace-trimmed on both sides;
  // addresses are otherwise matched exactly.
  const email = user.email.trim().toLowerCase();
  return list.includes(email) ? { ok: true, user } : { ok: false, reason: "forbidden", email };
}

/**
 * Returns the admin, or null. Every admin endpoint must call this (or
 * checkAdmin) and bail — authorization is never inferred from the route path.
 */
export async function requireAdmin(request: Request): Promise<AdminUser | null> {
  const result = await checkAdmin(request);
  return result.ok ? result.user : null;
}

/** Message for a denied caller; identical status, differing only in detail. */
export function adminDenialMessage(result: Extract<AdminCheck, { ok: false }>): string {
  switch (result.reason) {
    case "unconfigured":
      return "Admin access is not configured on this server: ADMIN_EMAILS is empty. Set it in .env.local and restart the server.";
    case "forbidden":
      return `The signed-in account (${result.email}) is not on the admin allowlist.`;
    default:
      return "Not authorised.";
  }
}
