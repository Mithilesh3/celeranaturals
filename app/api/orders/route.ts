import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth-server";
import { adminDb, isAdminConfigured } from "../../../lib/firebase-admin";
import { ORDERS_COLLECTION, type Order } from "../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's own orders only; the uid comes from the verified token, never the query. */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const snapshot = await adminDb()
    .collection(ORDERS_COLLECTION)
    .where("userId", "==", user.uid)
    .limit(50)
    .get();

  const orders = snapshot.docs
    .map((doc) => doc.data() as Order)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ orders });
}
