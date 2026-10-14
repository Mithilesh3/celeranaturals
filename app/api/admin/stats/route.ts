import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../lib/admin";
import { currentFulfilment } from "../../../../lib/fulfilment";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { ORDERS_COLLECTION, type Order } from "../../../../lib/orders";
import { NEWSLETTER_COLLECTION } from "../../../../lib/newsletter";
import { countCustomers } from "../../../../lib/customers-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });
  const admin = access.user;

  const db = adminDb();
  const startOfDayIST = new Date();
  // IST is UTC+5:30; shift, truncate, shift back to get "today" in local terms.
  startOfDayIST.setUTCHours(startOfDayIST.getUTCHours() + 5, startOfDayIST.getUTCMinutes() + 30);
  startOfDayIST.setUTCHours(0, 0, 0, 0);
  startOfDayIST.setUTCHours(startOfDayIST.getUTCHours() - 5, startOfDayIST.getUTCMinutes() - 30);
  const todayIso = startOfDayIST.toISOString();

  // Counted server-side with aggregation queries rather than downloading docs.
  const orders = db.collection(ORDERS_COLLECTION);
  const [total, today, paid, subscribers, customers] = await Promise.all([
    orders.count().get(),
    orders.where("createdAt", ">=", todayIso).count().get(),
    orders.where("status", "==", "paid").count().get(),
    db.collection(NEWSLETTER_COLLECTION).where("status", "==", "subscribed").count().get(),
    countCustomers().catch(() => 0),
  ]);

  // Fulfilment buckets need the field, and legacy docs have none, so this reads
  // only paid orders — the set an operator actually works through.
  const paidDocs = await orders.where("status", "==", "paid").limit(500).get();
  let awaitingPacking = 0;
  let awaitingShipment = 0;
  for (const doc of paidDocs.docs) {
    const stage = currentFulfilment((doc.data() as Order & { fulfilment?: string }).fulfilment);
    if (stage === "pending" || stage === "confirmed" || stage === "processing") awaitingPacking++;
    if (stage === "packed") awaitingShipment++;
  }

  return NextResponse.json({
    totalOrders: total.data().count,
    ordersToday: today.data().count,
    paidOrders: paid.data().count,
    awaitingPacking,
    awaitingShipment,
    subscribers: subscribers.data().count,
    // Flagged so the UI can say the buckets are computed from a capped scan.
    fulfilmentSampleCapped: paidDocs.size >= 500,
    // Real registered accounts from Firebase Auth, excluding staff logins.
    // Anonymous visitors are not counted: no analytics is configured.
    customers,
  });
}
