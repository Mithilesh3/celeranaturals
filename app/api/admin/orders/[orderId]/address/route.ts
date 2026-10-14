import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { checkAdmin, adminDenialMessage } from "../../../../../../lib/admin";
import { adminDb, isAdminConfigured } from "../../../../../../lib/firebase-admin";
import { currentFulfilment } from "../../../../../../lib/fulfilment";
import {
  ORDERS_COLLECTION, hasAddressDetails, normalizeAddress, validateAddress,
  type AddressEvent, type StoredOrder,
} from "../../../../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Corrects the delivery address on an existing order.
 *
 * Separate from the fulfilment PATCH so the two concerns cannot be conflated,
 * and like that route it accepts no payment fields whatsoever: `status`,
 * `razorpayPaymentId` and `amounts` are not readable from this body, so no
 * request here can forge a paid state or change what was charged.
 *
 * The previous address is appended to `addressHistory` rather than discarded,
 * so an order's delivery history is never silently overwritten.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });
  const admin = access.user;

  const { orderId } = await params;
  let body: { address?: unknown; reason?: unknown; confirm?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  // An explicit acknowledgement is required, so a stray request cannot
  // redirect a customer's parcel as a side effect.
  if (body.confirm !== true) {
    return NextResponse.json({ error: "Address changes must be confirmed." }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (!reason) return NextResponse.json({ error: "A reason for the address change is required." }, { status: 400 });

  const address = normalizeAddress(body.address);
  const problems = validateAddress(address);
  if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 400 });

  const db = adminDb();
  const ref = db.collection(ORDERS_COLLECTION).doc(orderId);

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return { http: 404 as const, error: "Order not found." };
      const order = snapshot.data() as StoredOrder;

      const state = currentFulfilment(order.fulfilment);
      // Once the parcel is with a courier the printed label is what matters;
      // editing the record would misrepresent where it is actually going.
      if (state === "shipped" || state === "delivered") {
        return { http: 409 as const, error: `The delivery address cannot be changed after an order is ${state}.` };
      }
      if (state === "cancelled") {
        return { http: 409 as const, error: "The delivery address cannot be changed on a cancelled order." };
      }

      const event: AddressEvent = {
        at: new Date().toISOString(),
        byUid: admin.uid,
        byEmail: admin.email,
        byPhone: admin.phoneNumber,
        from: hasAddressDetails(order.address) ? order.address : null,
        to: address,
        reason,
      };

      tx.update(ref, {
        address,
        addressHistory: FieldValue.arrayUnion(event),
        updatedAt: event.at,
      });
      return { http: 200 as const, address };
    });

    if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.http });
    return NextResponse.json({ address: outcome.address });
  } catch {
    return NextResponse.json({ error: "Could not update the delivery address." }, { status: 500 });
  }
}
