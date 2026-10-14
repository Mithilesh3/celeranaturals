import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth-server";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { ORDERS_COLLECTION, toCustomerOrder, type StoredOrder } from "../../../../lib/orders";
import { deliveryEstimate } from "../../../../lib/delivery-estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { orderId } = await params;
  const snapshot = await adminDb().collection(ORDERS_COLLECTION).doc(orderId).get();
  if (!snapshot.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const stored = snapshot.data() as StoredOrder;
  // Another user's order is indistinguishable from one that does not exist.
  if (stored.userId !== user.uid) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const order = toCustomerOrder(stored);
  // Null unless DELIVERY_ESTIMATE_DAYS is configured; the UI then says the
  // estimate is unavailable rather than guessing one.
  const estimate = deliveryEstimate({
    createdAt: order.createdAt,
    paid: order.status === "paid",
    fulfilment: order.fulfilment,
    shippedAt: order.tracking?.at ?? null,
  });

  return NextResponse.json({ order, estimate });
}
