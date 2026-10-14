import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth-server";
import { adminAuth, adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import {
  cleanContactPhone, cleanDisplayName, validateContactPhone, validateDisplayName,
} from "../../../../lib/customers";
import { USERS_COLLECTION } from "../../../../lib/saved-addresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in customer's own profile.
 *
 * The uid always comes from the verified ID token, so there is no request
 * field that could address another customer's record: a caller can only ever
 * read or write their own profile.
 *
 * Only displayName is writable. Phone and email are authentication
 * credentials and are returned read-only; changing them has to go through
 * Firebase's own verified flows, not a plain API call.
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    const [record, stored] = await Promise.all([
      adminAuth().getUser(user.uid),
      adminDb().collection(USERS_COLLECTION).doc(user.uid).get(),
    ]);
    const contactPhone = typeof stored.data()?.contactPhone === "string" ? stored.data()!.contactPhone : null;
    return NextResponse.json({
      profile: {
        uid: record.uid,
        name: record.displayName?.trim() || null,
        // Verified: only ever set by completing an OTP challenge.
        phone: record.phoneNumber ?? null,
        // Self-declared and explicitly NOT verified. Never used for auth.
        contactPhone,
        providers: record.providerData.map((entry) => entry.providerId),
        email: record.email ?? null,
        createdAt: record.metadata?.creationTime ? new Date(record.metadata.creationTime).toISOString() : null,
        lastSignInAt: record.metadata?.lastSignInTime ? new Date(record.metadata.lastSignInTime).toISOString() : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load your profile." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: { displayName?: unknown; contactPhone?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const problem = validateDisplayName(body.displayName);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const displayName = cleanDisplayName(body.displayName as string);

  // Optional. Written to Firestore, never to the Auth record's phoneNumber:
  // that field means "OTP-verified" and must not be settable by typing.
  let contactPhone: string | null | undefined;
  if (body.contactPhone !== undefined) {
    if (body.contactPhone === null || body.contactPhone === "") {
      contactPhone = null;
    } else {
      const phoneProblem = validateContactPhone(body.contactPhone);
      if (phoneProblem) return NextResponse.json({ error: phoneProblem }, { status: 400 });
      contactPhone = cleanContactPhone(body.contactPhone as string);
    }
  }

  try {
    await adminAuth().updateUser(user.uid, { displayName });
    if (contactPhone !== undefined) {
      await adminDb().collection(USERS_COLLECTION).doc(user.uid).set(
        { contactPhone, contactPhoneVerified: false, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }
    return NextResponse.json({ ok: true, displayName, ...(contactPhone !== undefined ? { contactPhone } : {}) });
  } catch {
    return NextResponse.json({ error: "Could not update your profile." }, { status: 500 });
  }
}
