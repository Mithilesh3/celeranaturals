/**
 * Exercises the delivery-estimate branch that only runs when
 * DELIVERY_ESTIMATE_DAYS is configured. Seeds a paid test order, reads it back
 * through the API as its owner, then removes everything it created.
 *
 * Expects a server started with DELIVERY_ESTIMATE_DAYS set.
 *   node scripts/test-estimate.mjs http://localhost:3125
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

const BASE = process.argv[2] ?? "http://localhost:3125";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}
const auth = getAuth();
const db = getFirestore();

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const stamp = Date.now();
const user = await auth.createUser({ email: `test-est-${stamp}@example.invalid`, password: `Pw!${stamp}` });
const custom = await auth.createCustomToken(user.uid);
const token = (await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: custom, returnSecureToken: true }),
})).json()).idToken;

const base = {
  userId: user.uid,
  items: [{ id: "p1", name: "Test", qty: 1, unitPrice: 10000, lineTotal: 10000 }],
  amounts: { subtotal: 10000, discount: 0, shipping: 0, tax: 0, total: 10000 },
  coupon: null,
  address: { fullName: "Est Test", phone: "9811111111", line1: "1 Road", line2: "", locality: "Area", city: "Lucknow", state: "UP", pincode: "226010", landmark: "" },
  phone: "+919811111111", paymentMethod: "razorpay",
  razorpayOrderId: "order_est", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const seed = async (extra) => {
  const ref = db.collection("orders").doc();
  await ref.set({ orderId: ref.id, ...base, ...extra });
  return ref;
};

const get = async (id) => (await (await fetch(`${BASE}/api/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json());

const refs = [];
try {
  const paid = await seed({ status: "paid", razorpayPaymentId: "pay_est", fulfilment: "confirmed" });
  refs.push(paid);
  const a = await get(paid.id);
  check("paid order gets an estimate when configured", a.estimate !== null, JSON.stringify(a.estimate?.basis ?? null));
  check("estimate is counted from the order date before dispatch", a.estimate?.basis === "order");
  check("estimate window is a valid forward range",
    new Date(a.estimate.from) > new Date(base.createdAt) && new Date(a.estimate.to) >= new Date(a.estimate.from));

  const shipped = await seed({
    status: "paid", razorpayPaymentId: "pay_est2", fulfilment: "shipped",
    tracking: { courier: "Delhivery", number: "DL999", at: new Date().toISOString(), url: null },
  });
  refs.push(shipped);
  const b = await get(shipped.id);
  check("shipped order counts the estimate from dispatch", b.estimate?.basis === "dispatch", String(b.estimate?.basis));

  const unpaid = await seed({ status: "created", razorpayPaymentId: null, fulfilment: "pending" });
  refs.push(unpaid);
  check("unpaid order gets no estimate", (await get(unpaid.id)).estimate === null);

  const delivered = await seed({ status: "paid", razorpayPaymentId: "pay_est3", fulfilment: "delivered" });
  refs.push(delivered);
  check("delivered order gets no estimate", (await get(delivered.id)).estimate === null);

  const cancelled = await seed({ status: "paid", razorpayPaymentId: "pay_est4", fulfilment: "cancelled" });
  refs.push(cancelled);
  check("cancelled order gets no estimate", (await get(cancelled.id)).estimate === null);
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  for (const ref of refs) await ref.delete().catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
  console.log(`\ncleanup: removed ${refs.length} test orders, 1 test user`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
