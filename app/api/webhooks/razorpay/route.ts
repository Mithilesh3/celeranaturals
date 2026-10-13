import { NextResponse } from "next/server";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { verifyWebhookSignature } from "../../../../lib/razorpay";
import { ORDERS_COLLECTION, type Order, type OrderStatus } from "../../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Source of truth when the browser never comes back — the customer closed the
 * tab mid-payment, or the verify call died on a flaky network. Razorpay retries
 * webhooks, so every path here must be idempotent.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  // The signature covers the exact bytes, so the raw body must be read before parsing.
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Malformed payload." }, { status: 400 }); }

  const entity = event.payload?.payment?.entity;
  const rzpOrderId = entity?.order_id;
  const rzpPaymentId = entity?.id;
  if (!rzpOrderId || !rzpPaymentId) return NextResponse.json({ received: true, ignored: "no payment entity" });

  const nextStatus: OrderStatus | null =
    event.event === "payment.captured" ? "paid"
    : event.event === "payment.failed" ? "failed"
    : null;
  // Acknowledge unhandled events so Razorpay stops retrying them.
  if (!nextStatus) return NextResponse.json({ received: true, ignored: event.event ?? "unknown" });

  const db = adminDb();
  const matches = await db.collection(ORDERS_COLLECTION).where("razorpayOrderId", "==", rzpOrderId).limit(1).get();
  if (matches.empty) return NextResponse.json({ received: true, ignored: "unknown order" });

  const ref = matches.docs[0].ref;
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return;
    const order = snapshot.data() as Order;
    // Terminal states are never rewritten, which makes retries a no-op.
    if (order.status === "paid" || order.status === "cancelled") return;
    tx.update(ref, {
      status: nextStatus,
      razorpayPaymentId: rzpPaymentId,
      updatedAt: new Date().toISOString(),
    });
  });

  return NextResponse.json({ received: true });
}
