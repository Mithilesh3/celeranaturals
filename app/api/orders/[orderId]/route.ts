import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth-server";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { ORDERS_COLLECTION, type Order } from "../../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { orderId } = await params;
  const snapshot = await adminDb().collection(ORDERS_COLLECTION).doc(orderId).get();
  if (!snapshot.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const order = snapshot.data() as Order;
  // Another user's order is indistinguishable from one that does not exist.
  if (order.userId !== user.uid) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ order });
}
