/**
 * Tests the per-order estimated delivery date: admin set/update/clear,
 * authorization, server-side validation, customer visibility, and above all
 * that it never disturbs payment status, delivery status, the address or the
 * total.
 *
 * Operates on a seeded test order and throwaway accounts, all removed at the
 * end. Real orders are never touched.
 *
 *   node scripts/test-delivery-estimate.mjs http://127.0.0.1:3241
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] ??= v;
}
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }) });
}
const auth = getAuth();
const db = getFirestore();
const BASE = process.argv[2] ?? "http://127.0.0.1:3241";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const idTokenFor = async (uid) => {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  return (await res.json()).idToken;
};

const stamp = Date.now();
const created = { orders: [], users: [] };
const ORDER_DAY = "2026-10-10";
const ORDER_CREATED = `${ORDER_DAY}T06:00:00.000Z`;

try {
  const adminEmail = (process.env.ADMIN_EMAILS ?? "").split(",")[0].trim();
  const adminUser = await auth.getUserByEmail(adminEmail);
  const adminToken = await idTokenFor(adminUser.uid);

  const owner = await auth.createUser({ email: `qa-est-own-${stamp}@example.invalid`, password: `Pw!${stamp}` });
  const other = await auth.createUser({ email: `qa-est-oth-${stamp}@example.invalid`, password: `Pw!${stamp}b` });
  created.users.push(owner.uid, other.uid);
  const ownerToken = await idTokenFor(owner.uid);
  const otherToken = await idTokenFor(other.uid);

  const ref = db.collection("orders").doc();
  created.orders.push(ref.id);
  const BASELINE = {
    orderId: ref.id, userId: owner.uid,
    items: [{ id: "p1", name: "QA item", qty: 1, unitPrice: 37500, lineTotal: 37500 }],
    amounts: { subtotal: 37500, discount: 0, shipping: 0, tax: 0, total: 37500 },
    coupon: null,
    address: { fullName: "Est Owner", phone: "9800000002", line1: "2 Est Road", line2: "", locality: "Area", city: "Lucknow", state: "Uttar Pradesh", pincode: "226010", landmark: "" },
    phone: "+919800000002", status: "paid", razorpayOrderId: "order_est", razorpayPaymentId: "pay_est",
    paymentMethod: "razorpay", fulfilment: "confirmed", fulfilmentHistory: [],
    createdAt: ORDER_CREATED, updatedAt: ORDER_CREATED,
  };
  await ref.set(BASELINE);

  const put = (token, body) => fetch(`${BASE}/api/admin/orders/${ref.id}/estimate`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const doc = async () => (await db.collection("orders").doc(ref.id).get()).data();
  const customerView = async (token) =>
    (await (await fetch(`${BASE}/api/orders/${ref.id}`, { headers: { Authorization: `Bearer ${token}` } })).json());

  // ---- authorization ----------------------------------------------------
  check("anonymous cannot set an estimate", (await put(null, { days: 5 })).status === 403);
  check("a signed-in customer cannot set an estimate", (await put(ownerToken, { days: 5 })).status === 403);
  check("another customer cannot set an estimate", (await put(otherToken, { days: 5 })).status === 403);
  check("no estimate was written by those attempts", (await doc()).estimatedDelivery === undefined);

  // ---- customer sees the unset state ------------------------------------
  const before = await customerView(ownerToken);
  check("customer API reports no estimate before one is set",
    before.order.estimatedDeliveryDate === null, String(before.order.estimatedDeliveryDate));

  // ---- validation --------------------------------------------------------
  for (const [label, body, expect] of [
    ["nothing chosen", {}, 400],
    ["both days and a date", { days: 5, date: "2026-10-20" }, 400],
    ["zero days", { days: 0 }, 400],
    ["negative days", { days: -3 }, 400],
    ["absurd days", { days: 500 }, 400],
    ["non-integer days", { days: 2.5 }, 400],
    ["malformed date", { date: "20-10-2026" }, 400],
    ["impossible date", { date: "2026-02-31" }, 400],
    ["date before the order date", { date: "2026-10-01" }, 400],
    ["date far in the future", { date: "2099-01-01" }, 400],
  ]) {
    const res = await put(adminToken, body);
    const detail = res.status === 400 ? (await res.json()).error : "";
    check(`rejects ${label}`, res.status === expect, `${res.status} ${String(detail).slice(0, 60)}`);
  }
  check("still no estimate after invalid attempts", (await doc()).estimatedDelivery === undefined);

  // ---- set by day preset -------------------------------------------------
  const set5 = await put(adminToken, { days: 5 });
  const set5Body = await set5.json();
  check("admin can set a 5-day estimate", set5.ok, JSON.stringify(set5Body.estimatedDelivery ?? set5Body).slice(0, 110));
  // Order placed 2026-10-10 IST -> +5 days -> 2026-10-15.
  check("the date is computed from the order date", set5Body.estimatedDelivery?.date === "2026-10-15",
    String(set5Body.estimatedDelivery?.date));
  check("the preset is recorded", set5Body.estimatedDelivery?.days === 5);
  check("who set it is recorded", set5Body.estimatedDelivery?.setByEmail === adminEmail,
    String(set5Body.estimatedDelivery?.setByEmail));

  // ---- nothing else moved -----------------------------------------------
  let after = await doc();
  check("PAYMENT STATUS unchanged by setting an estimate",
    after.status === "paid" && after.razorpayPaymentId === "pay_est", `status=${after.status}`);
  check("DELIVERY STATUS unchanged", after.fulfilment === "confirmed", after.fulfilment);
  check("address unchanged", JSON.stringify(after.address) === JSON.stringify(BASELINE.address));
  check("total unchanged", after.amounts.total === 37500, String(after.amounts.total));
  check("items unchanged", JSON.stringify(after.items) === JSON.stringify(BASELINE.items));

  // ---- customer sees it --------------------------------------------------
  const seen = await customerView(ownerToken);
  check("the customer's order shows the estimate", seen.order.estimatedDeliveryDate === "2026-10-15",
    String(seen.order.estimatedDeliveryDate));
  check("the customer still sees Paid", seen.order.status === "paid");
  check("the customer still sees the delivery status", seen.order.fulfilment === "confirmed");
  check("internal estimate metadata is not exposed to the customer",
    !JSON.stringify(seen).includes("setByEmail") && !JSON.stringify(seen).includes(adminEmail));

  // ---- another customer cannot read it ----------------------------------
  const foreign = await fetch(`${BASE}/api/orders/${ref.id}`, { headers: { Authorization: `Bearer ${otherToken}` } });
  check("another customer cannot read this order at all", foreign.status === 404, String(foreign.status));

  // ---- update to an exact date ------------------------------------------
  const exact = await put(adminToken, { date: "2026-10-22" });
  const exactBody = await exact.json();
  check("admin can update the estimate to an exact date", exact.ok && exactBody.estimatedDelivery?.date === "2026-10-22",
    String(exactBody.estimatedDelivery?.date));
  check("an exact date records no preset", exactBody.estimatedDelivery?.days === null,
    String(exactBody.estimatedDelivery?.days));
  check("the customer sees the updated date",
    (await customerView(ownerToken)).order.estimatedDeliveryDate === "2026-10-22");

  after = await doc();
  check("PAYMENT STATUS unchanged by updating the estimate",
    after.status === "paid" && after.razorpayPaymentId === "pay_est");

  // ---- an estimate cannot smuggle other fields --------------------------
  const smuggle = await put(adminToken, {
    days: 3, status: "failed", razorpayPaymentId: "pay_forged", fulfilment: "delivered",
    amounts: { total: 1 }, address: { line1: "hacked" },
  });
  check("a smuggling attempt still succeeds as a plain estimate", smuggle.ok, String(smuggle.status));
  after = await doc();
  check("smuggled payment status was ignored", after.status === "paid", after.status);
  check("smuggled razorpayPaymentId was ignored", after.razorpayPaymentId === "pay_est", String(after.razorpayPaymentId));
  check("smuggled fulfilment was ignored", after.fulfilment === "confirmed", after.fulfilment);
  check("smuggled total was ignored", after.amounts.total === 37500, String(after.amounts.total));
  check("smuggled address was ignored", after.address.line1 === "2 Est Road", after.address.line1);

  // ---- fulfilment changes do not disturb the estimate -------------------
  const patch = await fetch(`${BASE}/api/admin/orders/${ref.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ fulfilment: "processing" }),
  });
  check("delivery status can still be advanced", patch.ok, String(patch.status));
  after = await doc();
  check("the estimate survives a fulfilment change", after.estimatedDelivery?.date === "2026-10-13",
    String(after.estimatedDelivery?.date));
  check("payment status survives a fulfilment change", after.status === "paid");

  // ---- clearing -----------------------------------------------------------
  const cleared = await put(adminToken, { clear: true });
  check("admin can remove the estimate", cleared.ok, String(cleared.status));
  after = await doc();
  check("the stored estimate is null after clearing", after.estimatedDelivery === null, JSON.stringify(after.estimatedDelivery));
  check("the customer falls back to the unset state",
    (await customerView(ownerToken)).order.estimatedDeliveryDate === null);
  check("clearing left payment and delivery status alone",
    after.status === "paid" && after.fulfilment === "processing", `${after.status}/${after.fulfilment}`);

  // ---- unknown order -----------------------------------------------------
  const missing = await fetch(`${BASE}/api/admin/orders/no-such-order-${stamp}/estimate`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ days: 5 }),
  });
  check("an unknown order returns 404", missing.status === 404, String(missing.status));
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  for (const id of created.orders) await db.collection("orders").doc(id).delete().catch(() => {});
  for (const uid of created.users) {
    await db.recursiveDelete(db.collection("users").doc(uid)).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`\ncleanup: removed ${created.orders.length} test order, ${created.users.length} test users`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
