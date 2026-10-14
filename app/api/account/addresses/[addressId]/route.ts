import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/auth-server";
import { adminDb, isAdminConfigured } from "../../../../../lib/firebase-admin";
import { normalizeAddress, validateAddress } from "../../../../../lib/orders";
import {
  ADDRESSES_SUBCOLLECTION, USERS_COLLECTION, addressLabel, type SavedAddress,
} from "../../../../../lib/saved-addresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edit, set-default and delete for one saved address.
 *
 * The path is built from the uid on the verified token, so `addressId` can only
 * ever select a document inside the caller's own subcollection. An id belonging
 * to another customer simply does not exist at that path and returns 404.
 *
 * Editing or deleting a saved address never touches any order: orders hold
 * their own address snapshot, taken at the time they were placed.
 */
function collection(uid: string) {
  return adminDb().collection(USERS_COLLECTION).doc(uid).collection(ADDRESSES_SUBCOLLECTION);
}

export async function PUT(request: Request, { params }: { params: Promise<{ addressId: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { addressId } = await params;
  let body: { address?: unknown; label?: unknown; isDefault?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const address = normalizeAddress(body.address);
  const problems = validateAddress(address);
  if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 400 });

  const db = adminDb();
  const ref = collection(user.uid).doc(addressId);

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return { http: 404 as const, error: "Address not found." };
      const existing = snapshot.data() as SavedAddress;

      const makeDefault = body.isDefault === true;
      if (makeDefault && !existing.isDefault) {
        const all = await tx.get(collection(user.uid));
        for (const doc of all.docs) if (doc.id !== addressId) tx.update(doc.ref, { isDefault: false });
      }

      tx.update(ref, {
        ...address,
        label: addressLabel(body.label ?? existing.label),
        isDefault: makeDefault || existing.isDefault,
        updatedAt: new Date().toISOString(),
      });
      return { http: 200 as const };
    });

    if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.http });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not update the address." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ addressId: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { addressId } = await params;
  const db = adminDb();
  const ref = collection(user.uid).doc(addressId);

  try {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return;
      const removed = snapshot.data() as SavedAddress;
      // Firestore requires every read in a transaction to precede every write,
      // so the replacement is chosen before the delete is queued.
      const successor = removed.isDefault
        ? (await tx.get(collection(user.uid))).docs.find((doc) => doc.id !== addressId)
        : undefined;
      tx.delete(ref);
      // Promote another address so the customer is never left without a default.
      if (successor) tx.update(successor.ref, { isDefault: true });
    });
  } catch {
    return NextResponse.json({ error: "Could not delete the address." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
