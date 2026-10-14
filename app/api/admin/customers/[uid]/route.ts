import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { checkAdmin, adminDenialMessage } from "../../../../../lib/admin";
import { adminAuth, adminDb, isAdminConfigured } from "../../../../../lib/firebase-admin";
import { getCustomer } from "../../../../../lib/customers-server";
import { USERS_COLLECTION } from "../../../../../lib/saved-addresses";
import { cleanDisplayName, validateDisplayName, type ProfileEvent } from "../../../../../lib/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });

  const { uid } = await params;
  try {
    const customer = await getCustomer(uid);
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    return NextResponse.json({ customer });
  } catch {
    return NextResponse.json({ error: "Could not load the customer." }, { status: 500 });
  }
}

/**
 * Corrects a customer's display name.
 *
 * Deliberately the ONLY editable field. Phone number and email are
 * authentication credentials — changing them would change how the customer
 * signs in, and could hand their account to someone else — so they are not
 * editable here. Passwords are never readable or writable through this API.
 *
 * Order address snapshots are untouched by design: an order's delivery address
 * is a separate stored copy, corrected only through the audited order-address
 * endpoint. Renaming a customer cannot rewrite delivery history.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });
  const admin = access.user;

  const { uid } = await params;
  let body: { displayName?: unknown; reason?: unknown; confirm?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  if (body.confirm !== true) {
    return NextResponse.json({ error: "Profile changes must be confirmed." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (!reason) return NextResponse.json({ error: "A reason for the change is required." }, { status: 400 });

  const problem = validateDisplayName(body.displayName);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const displayName = cleanDisplayName(body.displayName as string);

  try {
    const auth = adminAuth();
    const existing = await auth.getUser(uid).catch(() => null);
    if (!existing) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

    const event: ProfileEvent = {
      at: new Date().toISOString(),
      byUid: admin.uid,
      byEmail: admin.email,
      field: "displayName",
      from: existing.displayName ?? null,
      to: displayName,
      reason,
    };

    // The Auth record is the profile; the Firestore document only carries the
    // append-only audit trail beside it.
    await auth.updateUser(uid, { displayName });
    await adminDb().collection(USERS_COLLECTION).doc(uid).set(
      { profileHistory: FieldValue.arrayUnion(event) },
      { merge: true },
    );

    return NextResponse.json({ ok: true, displayName });
  } catch {
    return NextResponse.json({ error: "Could not update the customer profile." }, { status: 500 });
  }
}
