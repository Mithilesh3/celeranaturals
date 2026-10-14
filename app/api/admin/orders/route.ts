import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../lib/admin";
import { currentFulfilment } from "../../../../lib/fulfilment";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { ORDERS_COLLECTION, type Order } from "../../../../lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** Paginated order list. Search and fulfilment filtering are applied to the page. */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });
  const admin = access.user;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const payment = url.searchParams.get("payment");
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  let query = adminDb().collection(ORDERS_COLLECTION).orderBy("createdAt", "desc");
  if (payment && payment !== "all") query = query.where("status", "==", payment);
  if (cursor) query = query.startAfter(cursor);

  // One extra doc tells us whether another page exists without a second query.
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const docs = snapshot.docs.slice(0, PAGE_SIZE);
  const hasMore = snapshot.size > PAGE_SIZE;

  let rows = docs.map((doc) => {
    const order = doc.data() as Order & { fulfilment?: string };
    return {
      orderId: order.orderId,
      createdAt: order.createdAt,
      customer: order.address?.fullName ?? "",
      phone: order.phone ?? "",
      total: order.amounts?.total ?? 0,
      payment: order.status,
      fulfilment: currentFulfilment(order.fulfilment),
    };
  });

  if (search) {
    rows = rows.filter((row) =>
      row.orderId.toLowerCase().includes(search) ||
      row.customer.toLowerCase().includes(search) ||
      row.phone.toLowerCase().includes(search));
  }

  return NextResponse.json({
    orders: rows,
    nextCursor: hasMore ? docs[docs.length - 1].data().createdAt : null,
    // Search runs within the fetched page, so say so rather than implying global search.
    searchScopedToPage: Boolean(search),
  });
}
