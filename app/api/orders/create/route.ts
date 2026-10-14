import { NextResponse } from "next/server";
import { getProductsByIds, stockShortfalls } from "../../../../lib/catalog-server";
import { effectivePrice } from "../../../../lib/catalog";
import { requireUser } from "../../../../lib/auth-server";
import { adminDb, isAdminConfigured, missingAdminKeys } from "../../../../lib/firebase-admin";
import { createRazorpayOrder, isRazorpayConfigured, razorpayKeyId, razorpaySecretIsPublic } from "../../../../lib/razorpay";
import { buildAmounts, rupeesToPaise } from "../../../../lib/money";
import { ORDERS_COLLECTION, normalizeAddress, validateAddress, type Order, type OrderAddress, type OrderItem, type StoredOrder } from "../../../../lib/orders";
import { applyCoupon } from "../../../../lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CartLine = { id: string; qty: number };

export async function POST(request: Request) {
  // Refuse to run if the secret was given a NEXT_PUBLIC name, because Next
  // would inline it into the browser bundle.
  if (razorpaySecretIsPublic()) {
    return NextResponse.json({
      error: "Server misconfigured: RAZORPAY_KEY_SECRET must not use a NEXT_PUBLIC_ prefix. Rename it and regenerate the key.",
    }, { status: 503 });
  }
  if (!isAdminConfigured() || !isRazorpayConfigured()) {
    const missing = [
      ...missingAdminKeys(),
      ...(!razorpayKeyId() ? ["RAZORPAY_KEY_ID"] : []),
      ...(!process.env.RAZORPAY_KEY_SECRET ? ["RAZORPAY_KEY_SECRET"] : []),
    ];
    // Names only — never values.
    return NextResponse.json({
      error: `Payments are not configured on this server. Missing in .env.local: ${missing.join(", ")}. Restart the dev server after adding them.`,
    }, { status: 503 });
  }

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: { items?: CartLine[]; address?: Partial<OrderAddress>; expectedTotal?: number; couponCode?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const lines = Array.isArray(body.items) ? body.items : [];
  if (!lines.length) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });

  // Coerced to exactly the known keys before validation, so neither extra
  // fields nor oversized strings can reach the stored snapshot.
  const address = normalizeAddress(body.address);
  const addressProblems = validateAddress(address);
  if (addressProblems.length) return NextResponse.json({ error: addressProblems.join(" ") }, { status: 400 });

  // Quantities are validated before any catalogue lookup.
  const wanted: Array<{ id: string; qty: number }> = [];
  for (const line of lines) {
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
      return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
    }
    if (typeof line.id !== "string" || !line.id) {
      return NextResponse.json({ error: "A product in your cart is no longer available." }, { status: 400 });
    }
    wanted.push({ id: line.id, qty });
  }

  // Prices and stock come from the Firestore catalogue — the same records the
  // admin panel writes — read live and uncached. Any price the browser sends is
  // a claim to be checked, never an input.
  let found;
  try {
    found = await getProductsByIds(wanted.map((line) => line.id));
  } catch {
    return NextResponse.json({ error: "Could not load the product catalogue. Please try again." }, { status: 503 });
  }

  const unavailable = stockShortfalls(wanted, found);
  if (unavailable.length) return NextResponse.json({ error: unavailable[0] }, { status: 400 });

  const items: OrderItem[] = [];
  for (const line of wanted) {
    const product = found.get(line.id)!;
    const unitPrice = rupeesToPaise(effectivePrice(product));
    // Name and SKU are snapshotted here; editing the product later cannot
    // change what this order says was bought or what it cost.
    items.push({
      id: product.id,
      name: product.name,
      sku: product.sku || null,
      qty: line.qty,
      unitPrice,
      lineTotal: unitPrice * line.qty,
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  // The browser sends a code, never an amount. The discount is looked up and
  // recomputed here, so a forged request cannot invent a reduction.
  let applied: Order["coupon"] = null;
  if (typeof body.couponCode === "string" && body.couponCode.trim()) {
    const result = applyCoupon(body.couponCode, subtotal);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    applied = { code: result.coupon.code, label: result.coupon.label, discount: result.discount };
  }

  const amounts = buildAmounts(subtotal, applied?.discount ?? 0);

  // If the client disagrees about the price, stop rather than silently charging
  // a different amount than the customer was shown.
  if (typeof body.expectedTotal === "number" && body.expectedTotal !== amounts.total) {
    return NextResponse.json({ error: "Prices have changed. Please review your cart and try again." }, { status: 409 });
  }

  const db = adminDb();
  const ref = db.collection(ORDERS_COLLECTION).doc();
  const now = new Date().toISOString();

  let razorpayOrderId: string;
  try {
    const rzp = await createRazorpayOrder(amounts.total, ref.id);
    razorpayOrderId = rzp.id;
  } catch {
    return NextResponse.json({ error: "Could not reach the payment provider. Please try again." }, { status: 502 });
  }

  const order: StoredOrder = {
    orderId: ref.id,
    userId: user.uid,
    items,
    amounts,
    coupon: applied,
    address,
    phone: user.phoneNumber ?? address.phone ?? "",
    status: "created",
    paymentMethod: "razorpay",
    razorpayOrderId,
    razorpayPaymentId: null,
    // Fulfilment starts explicitly, independent of payment. Older orders have
    // no such field and are read as "pending" by currentFulfilment.
    fulfilment: "pending",
    fulfilmentHistory: [],
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(order);

  return NextResponse.json({
    orderId: ref.id,
    razorpayOrderId,
    amount: amounts.total,
    currency: "INR",
    keyId: razorpayKeyId() ?? null,
  });
}
