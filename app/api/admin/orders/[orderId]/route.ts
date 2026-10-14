import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { checkAdmin, adminDenialMessage } from "../../../../../lib/admin";
import {
  canTransition, currentFulfilment, validateTracking, trustedTrackingUrl,
  FULFILMENT_STATUSES, type FulfilmentEvent, type FulfilmentStatus,
} from "../../../../../lib/fulfilment";
import { adminDb, isAdminConfigured } from "../../../../../lib/firebase-admin";
import { ORDERS_COLLECTION, type StoredOrder } from "../../../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });

  const { orderId } = await params;
  const snapshot = await adminDb().collection(ORDERS_COLLECTION).doc(orderId).get();
  if (!snapshot.exists) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const order = snapshot.data() as StoredOrder;
  return NextResponse.json({ order: { ...order, fulfilment: currentFulfilment(order.fulfilment) } });
}

/**
 * Updates fulfilment only.
 *
 * Payment status is deliberately NOT accepted here. `status` on an order is
 * set exclusively by the Razorpay signature verification in
 * /api/payments/verify (or the signed webhook). An admin cannot mark an order
 * paid by any request to this endpoint.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });
  const admin = access.user;

  const { orderId } = await params;
  let body: { fulfilment?: unknown; note?: unknown; courier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const target = body.fulfilment;
  if (!FULFILMENT_STATUSES.includes(target as FulfilmentStatus)) {
    return NextResponse.json({ error: "Unknown fulfilment status." }, { status: 400 });
  }
  const next = target as FulfilmentStatus;

  const wantsTracking = body.courier !== undefined || body.trackingNumber !== undefined;
  if (wantsTracking) {
    const problem = validateTracking(body.courier, body.trackingNumber);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  // An operator may supply a courier tracking page, but only a vetted host is
  // stored. A rejected URL fails the request rather than being silently
  // dropped, so nobody believes a link was saved when it was not.
  let trackingUrl: string | null = null;
  if (body.trackingUrl !== undefined && String(body.trackingUrl).trim()) {
    trackingUrl = trustedTrackingUrl(body.trackingUrl);
    if (!trackingUrl) {
      return NextResponse.json({
        error: "Tracking URL must be an https link on a recognised courier domain.",
      }, { status: 400 });
    }
  }

  const db = adminDb();
  const ref = db.collection(ORDERS_COLLECTION).doc(orderId);

  try {
    // Transactional so two operators cannot apply conflicting transitions.
    const outcome = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return { http: 404 as const, error: "Order not found." };
      const order = snapshot.data() as StoredOrder;
      const from = currentFulfilment(order.fulfilment);

      if (from === next) return { http: 409 as const, error: `Order is already ${next}.` };
      if (!canTransition(from, next)) {
        return { http: 409 as const, error: `Cannot move an order from ${from} to ${next}.` };
      }

      // Checked against stored state inside the transaction, not against the
      // request alone: shipping is allowed when tracking is being supplied now
      // or was already recorded, and never when neither is true.
      if (next === "shipped" && !wantsTracking && !order.tracking?.number) {
        return { http: 400 as const, error: "Courier and tracking number are required to mark an order shipped." };
      }

      const event: FulfilmentEvent = {
        status: next,
        at: new Date().toISOString(),
        byUid: admin.uid,
        byEmail: admin.email,
        byPhone: admin.phoneNumber,
        ...(typeof body.note === "string" && body.note.trim() ? { note: body.note.trim().slice(0, 300) } : {}),
      };

      const update: Record<string, unknown> = {
        fulfilment: next,
        fulfilmentHistory: FieldValue.arrayUnion(event),
        updatedAt: event.at,
      };
      if (wantsTracking) {
        update.tracking = {
          courier: String(body.courier).trim(),
          number: String(body.trackingNumber).trim(),
          at: event.at,
          url: trackingUrl,
        };
      } else if (trackingUrl && order.tracking) {
        update.tracking = { ...order.tracking, url: trackingUrl };
      }
      tx.update(ref, update);
      return { http: 200 as const, fulfilment: next };
    });

    if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.http });
    return NextResponse.json({ fulfilment: outcome.fulfilment });
  } catch {
    return NextResponse.json({ error: "Could not update the order." }, { status: 500 });
  }
}
