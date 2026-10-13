import { NextResponse } from "next/server";
import { products } from "../../../../scripts/data.js";
import { requireUser } from "../../../../lib/auth-server";
import { adminDb, isAdminConfigured, missingAdminKeys } from "../../../../lib/firebase-admin";
import { createRazorpayOrder, isRazorpayConfigured, razorpayKeyId, razorpaySecretIsPublic } from "../../../../lib/razorpay";
import { buildAmounts, rupeesToPaise } from "../../../../lib/money";
import { ORDERS_COLLECTION, validateAddress, type Order, type OrderAddress, type OrderItem } from "../../../../lib/orders";

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

  let body: { items?: CartLine[]; address?: Partial<OrderAddress>; expectedTotal?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const lines = Array.isArray(body.items) ? body.items : [];
  if (!lines.length) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });

  const addressProblems = validateAddress(body.address ?? {});
  if (addressProblems.length) return NextResponse.json({ error: addressProblems.join(" ") }, { status: 400 });

  // Prices come from server-side catalogue data only. Any amount supplied by
  // the browser is treated as a claim to be checked, never as input.
  const items: OrderItem[] = [];
  for (const line of lines) {
    const product = products.find((candidate) => candidate.id === line.id);
    if (!product) return NextResponse.json({ error: "A product in your cart is no longer available." }, { status: 400 });
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
      return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
    }
    if (product.availability !== "in-stock") {
      return NextResponse.json({ error: `${product.name} is out of stock.` }, { status: 400 });
    }
    const unitPrice = rupeesToPaise(product.price);
    items.push({ id: product.id, name: product.name, qty, unitPrice, lineTotal: unitPrice * qty });
  }

  const amounts = buildAmounts(items.reduce((sum, item) => sum + item.lineTotal, 0));

  // If the client disagrees about the price, stop rather than silently charging
  // a different amount than the customer was shown.
  if (typeof body.expectedTotal === "number" && body.expectedTotal !== amounts.total) {
    return NextResponse.json({ error: "Prices have changed. Please review your cart and try again." }, { status: 409 });
  }

  const db = adminDb();
  const ref = db.collection(ORDERS_COLLECTION).doc();
  const now = new Date().toISOString();
  const address = body.address as OrderAddress;

  let razorpayOrderId: string;
  try {
    const rzp = await createRazorpayOrder(amounts.total, ref.id);
    razorpayOrderId = rzp.id;
  } catch {
    return NextResponse.json({ error: "Could not reach the payment provider. Please try again." }, { status: 502 });
  }

  const order: Order = {
    orderId: ref.id,
    userId: user.uid,
    items,
    amounts,
    address,
    phone: user.phoneNumber ?? address.phone ?? "",
    status: "created",
    paymentMethod: "razorpay",
    razorpayOrderId,
    razorpayPaymentId: null,
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
