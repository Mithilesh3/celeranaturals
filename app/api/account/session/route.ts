import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth-server";
import { isAdminConfigured } from "../../../../lib/firebase-admin";
import { recordSignIn } from "../../../../lib/customer-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records a successful sign-in for the calling account.
 *
 * Called by the browser after Firebase reports an authenticated user, but the
 * browser supplies nothing that is trusted: the uid, the authentication time
 * and the sign-in method are all read from the signed ID token on the server.
 * A caller cannot record a sign-in for anyone else, cannot backdate one, and
 * cannot inflate the count by replaying the request — the stored count only
 * advances when the token's auth_time is newer than the one already saved.
 *
 * No password, hash, ID token or refresh token is stored by this endpoint.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    const outcome = await recordSignIn(user);
    return NextResponse.json({ ok: true, ...outcome });
  } catch {
    // A failure here must never block the customer from using the site.
    return NextResponse.json({ error: "Could not record the sign-in." }, { status: 500 });
  }
}
