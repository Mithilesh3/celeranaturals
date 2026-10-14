import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth-server";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { normalizeAddress, validateAddress } from "../../../../lib/orders";
import {
  ADDRESSES_SUBCOLLECTION, MAX_SAVED_ADDRESSES, USERS_COLLECTION,
  addressLabel, type SavedAddress,
} from "../../../../lib/saved-addresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saved addresses for the signed-in customer.
 *
 * The uid always comes from the verified ID token and is used to build the
 * document path, so there is no request field that could point these
 * operations at another customer's records.
 */
function collection(uid: string) {
  return adminDb().collection(USERS_COLLECTION).doc(uid).collection(ADDRESSES_SUBCOLLECTION);
}

export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const snapshot = await collection(user.uid).limit(MAX_SAVED_ADDRESSES).get();
  const addresses = snapshot.docs
    .map((doc) => ({ ...(doc.data() as SavedAddress), id: doc.id }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.localeCompare(b.createdAt));

  return NextResponse.json({ addresses });
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: { address?: unknown; label?: unknown; isDefault?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const address = normalizeAddress(body.address);
  const problems = validateAddress(address);
  if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 400 });

  const db = adminDb();
  const ref = collection(user.uid).doc();
  const now = new Date().toISOString();

  try {
    await db.runTransaction(async (tx) => {
      // Counted inside the transaction so concurrent saves cannot exceed the cap.
      const existing = await tx.get(collection(user.uid));
      if (existing.size >= MAX_SAVED_ADDRESSES) {
        throw new Error(`LIMIT:You can save up to ${MAX_SAVED_ADDRESSES} addresses. Delete one first.`);
      }
      const makeDefault = body.isDefault === true || existing.empty;
      if (makeDefault) {
        for (const doc of existing.docs) tx.update(doc.ref, { isDefault: false });
      }
      const saved: SavedAddress = {
        ...address,
        id: ref.id,
        label: addressLabel(body.label),
        isDefault: makeDefault,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(ref, saved);
    });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("LIMIT:")
      ? error.message.slice(6)
      : "Could not save the address.";
    return NextResponse.json({ error: message }, { status: message.startsWith("You can save") ? 409 : 500 });
  }

  return NextResponse.json({ id: ref.id });
}
