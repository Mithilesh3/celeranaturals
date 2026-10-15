import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { checkAdmin, adminDenialMessage } from "../../../../../lib/admin";
import {
  canTransition, canonicalForStage, currentFulfilment, currentStageKey, isDeliveryStageKey,
  isForwardStage, validateTracking, trustedTrackingUrl, DELIVERY_STAGES,
  FULFILMENT_STATUSES, type DeliveryStageKey, type FulfilmentEvent, type FulfilmentStatus,
} from "../../../../../lib/fulfilment";

const stageLabel = (stage: DeliveryStageKey) =>
  DELIVERY_STAGES.find((entry) => entry.key === stage)?.label ?? stage;
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
  let body: {
    stage?: unknown; fulfilment?: unknown; correction?: unknown; note?: unknown;
    courier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  /**
   * Two accepted shapes:
   *   { stage: "confirmed" | "preparing" | "delivered" }  — the three-stage UI
   *   { fulfilment: <FulfilmentStatus> }                  — cancel, and any
   *                                                         older caller
   * A stage is canonicalised server-side, so the browser never decides which
   * underlying status gets stored.
   */
  const usingStage = body.stage !== undefined;
  if (usingStage && !isDeliveryStageKey(body.stage)) {
    return NextResponse.json({ error: "Unknown delivery stage." }, { status: 400 });
  }
  if (!usingStage && !FULFILMENT_STATUSES.includes(body.fulfilment as FulfilmentStatus)) {
    return NextResponse.json({ error: "Unknown fulfilment status." }, { status: 400 });
  }
  const stage = usingStage ? (body.stage as DeliveryStageKey) : null;
  const next = stage ? canonicalForStage(stage) : (body.fulfilment as FulfilmentStatus);

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

      if (stage) {
        // Three-stage workflow. Forward moves are normal and must never be
        // refused — the old step-by-step chain rejected pending -> delivered,
        // which is exactly the failure this replaces. Backward moves are
        // corrections: allowed, but only when explicitly flagged with a
        // reason, so they are deliberate and land in the audit trail.
        const currentStage = currentStageKey(from);
        if (currentStage === stage) {
          return { http: 409 as const, error: `This order is already at "${stageLabel(stage)}".` };
        }
        if (from === "cancelled") {
          return { http: 409 as const, error: "This order was cancelled and cannot be moved through delivery stages." };
        }
        if (!isForwardStage(from, stage) && body.correction !== true) {
          return {
            http: 409 as const,
            error: `Moving back to "${stageLabel(stage)}" is a correction. Confirm the correction and give a reason.`,
            needsCorrection: true,
          };
        }
        if (!isForwardStage(from, stage) && !String(body.note ?? "").trim()) {
          return { http: 400 as const, error: "A reason is required when correcting a delivery stage." };
        }
      } else {
        if (from === next) return { http: 409 as const, error: `Order is already ${next}.` };
        if (!canTransition(from, next)) {
          return { http: 409 as const, error: `Cannot move an order from ${from} to ${next}.` };
        }
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

    if ("error" in outcome) {
      // needsCorrection must survive to the client, otherwise the UI cannot
      // know to offer the reason field for a backward move.
      return NextResponse.json(
        { error: outcome.error, ...("needsCorrection" in outcome ? { needsCorrection: true } : {}) },
        { status: outcome.http },
      );
    }
    return NextResponse.json({ fulfilment: outcome.fulfilment });
  } catch {
    return NextResponse.json({ error: "Could not update the order." }, { status: 500 });
  }
}
