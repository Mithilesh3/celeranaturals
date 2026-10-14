import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../../../lib/admin";
import { adminDb, isAdminConfigured } from "../../../../../../lib/firebase-admin";
import { resolveEstimateInput, type OrderDeliveryEstimate } from "../../../../../../lib/delivery-estimate";
import { ORDERS_COLLECTION, type StoredOrder } from "../../../../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sets or updates the estimated delivery date for one order.
 *
 * Deliberately the narrowest possible surface: the only fields written are
 * `estimatedDelivery` and `updatedAt`. Payment status, razorpayPaymentId,
 * fulfilment, the delivery address, the items and the amounts are not read
 * from the body and are never written here, so no request to this endpoint can
 * change what was charged, what was paid, or where the parcel is going.
 *
 * The date is resolved on the server from either a day preset or an explicit
 * date, so the stored value is always a concrete calendar date and never
 * depends on the caller's clock or timezone.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });
  const admin = access.user;

  const { orderId } = await params;
  let body: { days?: unknown; date?: unknown; clear?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const ref = adminDb().collection(ORDERS_COLLECTION).doc(orderId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const order = snapshot.data() as StoredOrder;

  // Removing an estimate is allowed: a wrong promise is worse than none.
  if (body.clear === true) {
    await ref.update({ estimatedDelivery: null, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, estimatedDelivery: null });
  }

  const resolved = resolveEstimateInput({ days: body.days, date: body.date }, order.createdAt);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });

  const estimate: OrderDeliveryEstimate = {
    date: resolved.date,
    days: resolved.days,
    setAt: new Date().toISOString(),
    setByEmail: admin.email,
  };

  try {
    await ref.update({ estimatedDelivery: estimate, updatedAt: estimate.setAt });
    return NextResponse.json({ ok: true, estimatedDelivery: estimate });
  } catch {
    return NextResponse.json({ error: "Could not save the delivery estimate." }, { status: 500 });
  }
}
