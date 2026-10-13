import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth-server";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { isRazorpayConfigured, verifyPaymentSignature } from "../../../../lib/razorpay";
import { ORDERS_COLLECTION, type Order } from "../../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminConfigured() || !isRazorpayConfigured()) {
    return NextResponse.json({ error: "Payments are not configured on this server." }, { status: 503 });
  }

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: { orderId?: string; razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const { orderId, razorpay_order_id: rzpOrderId, razorpay_payment_id: rzpPaymentId, razorpay_signature: signature } = body;
  if (!orderId || !rzpOrderId || !rzpPaymentId || !signature) {
    return NextResponse.json({ error: "Missing payment details." }, { status: 400 });
  }

  const db = adminDb();
  const ref = db.collection(ORDERS_COLLECTION).doc(orderId);

  // The whole decision happens in a transaction so a replayed callback (or two
  // tabs finishing at once) cannot double-process the same payment.
  try {
    const outcome = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return { http: 404 as const, error: "Order not found." };

      const order = snapshot.data() as Order;
      if (order.userId !== user.uid) return { http: 404 as const, error: "Order not found." };
      if (order.razorpayOrderId !== rzpOrderId) {
        return { http: 400 as const, error: "Payment does not belong to this order." };
      }

      // Idempotency: already settled, so report the existing outcome unchanged.
      if (order.status === "paid") {
        return order.razorpayPaymentId === rzpPaymentId
          ? { http: 200 as const, orderId, status: "paid" as const }
          : { http: 409 as const, error: "This order was already paid by another payment." };
      }

      // Signature is the single source of truth. The browser saying "success"
      // counts for nothing until this passes.
      if (!verifyPaymentSignature(rzpOrderId, rzpPaymentId, signature)) {
        tx.update(ref, { status: "failed", updatedAt: new Date().toISOString() });
        return { http: 400 as const, error: "Payment verification failed." };
      }

      tx.update(ref, {
        status: "paid",
        razorpayPaymentId: rzpPaymentId,
        updatedAt: new Date().toISOString(),
      });
      return { http: 200 as const, orderId, status: "paid" as const };
    });

    if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.http });
    return NextResponse.json({ orderId: outcome.orderId, status: outcome.status });
  } catch {
    return NextResponse.json({ error: "Could not verify the payment. Please check your orders before retrying." }, { status: 500 });
  }
}
