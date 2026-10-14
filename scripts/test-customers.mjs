/**
 * End-to-end checks for customer management.
 *
 * Creates two throwaway Auth accounts and a paid order, verifies the admin
 * directory and the customer's own profile endpoint, then removes everything.
 *
 *   node scripts/test-customers.mjs http://localhost:3141
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

const BASE = process.argv[2] ?? "http://localhost:3141";
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

async function idTokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(data.error?.message ?? "token mint failed");
  return data.idToken;
}

const req = (path, token, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

const stamp = Date.now();
const created = { users: [], orders: [] };

async function main() {
  const adminEmail = (process.env.ADMIN_EMAILS ?? "").split(",")[0].trim();
  const adminUser = await auth.getUserByEmail(adminEmail);
  const adminToken = await idTokenFor(adminUser.uid);

  const alice = await auth.createUser({
    email: `qa-alice-${stamp}@example.invalid`, password: `Pw!${stamp}a`, displayName: "QA Alice",
  });
  created.users.push(alice.uid);
  const aliceToken = await idTokenFor(alice.uid);

  const bob = await auth.createUser({ email: `qa-bob-${stamp}@example.invalid`, password: `Pw!${stamp}b`, displayName: "QA Bob" });
  created.users.push(bob.uid);
  const bobToken = await idTokenFor(bob.uid);

  // A verified-paid order and an unpaid one, to prove only paid money counts.
  const seedOrder = async (uid, status, total) => {
    const ref = db.collection("orders").doc();
    created.orders.push(ref.id);
    await ref.set({
      orderId: ref.id, userId: uid,
      items: [{ id: "p1", name: "QA item", qty: 1, unitPrice: total, lineTotal: total }],
      amounts: { subtotal: total, discount: 0, shipping: 0, tax: 0, total },
      coupon: null,
      address: { fullName: "QA Alice", phone: "9811111111", line1: "1 QA St", line2: "", locality: "Area", city: "Lucknow", state: "UP", pincode: "226010", landmark: "" },
      phone: "+919811111111", status, paymentMethod: "razorpay",
      razorpayOrderId: "order_qa", razorpayPaymentId: status === "paid" ? "pay_qa" : null,
      fulfilment: "confirmed",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    return ref.id;
  };
  await seedOrder(alice.uid, "paid", 50000);
  await seedOrder(alice.uid, "created", 99900);

  // ---- 1. authorization --------------------------------------------------
  for (const [label, token] of [["anonymous", null], ["signed-in customer", aliceToken]]) {
    const list = await req("/api/admin/customers", token);
    check(`${label} cannot list customers`, list.status === 403, String(list.status));
    const detail = await req(`/api/admin/customers/${alice.uid}`, token);
    check(`${label} cannot read a customer record`, detail.status === 403, String(detail.status));
    const patch = await req(`/api/admin/customers/${alice.uid}`, token, {
      method: "PATCH", body: JSON.stringify({ displayName: "Hacked", reason: "x", confirm: true }),
    });
    check(`${label} cannot edit a customer profile`, patch.status === 403, String(patch.status));
  }

  // ---- 2. directory ------------------------------------------------------
  const listed = await (await req("/api/admin/customers", adminToken)).json();
  const aliceRow = listed.customers.find((c) => c.uid === alice.uid);
  check("admin can list customers", Array.isArray(listed.customers), `${listed.customers?.length} rows`);
  check("new account appears in the directory", Boolean(aliceRow), aliceRow ? "found" : "missing");
  check("directory shows the real display name", aliceRow?.name === "QA Alice", String(aliceRow?.name));
  check("directory shows the real email", aliceRow?.email === `qa-alice-${stamp}@example.invalid`);
  check("account creation date is populated", Boolean(aliceRow?.createdAt), String(aliceRow?.createdAt));
  check("order count includes both orders", aliceRow?.orderCount === 2, String(aliceRow?.orderCount));
  // 50000 paid + 99900 unpaid must total only the paid 50000.
  check("spend counts verified paid orders only", aliceRow?.totalSpent === 50000, `${aliceRow?.totalSpent} paise`);
  check("paid order count is correct", aliceRow?.paidOrderCount === 1, String(aliceRow?.paidOrderCount));

  const bobRow = listed.customers.find((c) => c.uid === bob.uid);
  check("a customer with no orders shows zero spend", bobRow?.orderCount === 0 && bobRow?.totalSpent === 0,
    `${bobRow?.orderCount} orders / ${bobRow?.totalSpent}`);

  const staffRow = listed.customers.find((c) => c.uid === adminUser.uid);
  check("staff accounts are excluded from the customer directory", !staffRow, staffRow ? "admin listed" : "excluded");

  const payload = JSON.stringify(listed);
  check("directory payload contains no credential material",
    !/passwordHash|passwordSalt|idToken|refreshToken|customClaims|tokensValidAfter/i.test(payload));

  // ---- 3. search and pagination -----------------------------------------
  const byName = await (await req(`/api/admin/customers?q=QA%20Alice`, adminToken)).json();
  check("search by name finds the customer", byName.customers.some((c) => c.uid === alice.uid), `${byName.total} hits`);
  const byEmail = await (await req(`/api/admin/customers?q=qa-bob-${stamp}`, adminToken)).json();
  check("search by email finds the customer", byEmail.customers.some((c) => c.uid === bob.uid), `${byEmail.total} hits`);
  const noHits = await (await req("/api/admin/customers?q=zzz-no-such-customer", adminToken)).json();
  check("search with no matches returns an empty page", noHits.customers.length === 0 && noHits.total === 0);
  check("pagination metadata is present", typeof listed.page === "number" && typeof listed.pageCount === "number",
    `page ${listed.page}/${listed.pageCount}`);

  // ---- 4. detail ---------------------------------------------------------
  const detail = (await (await req(`/api/admin/customers/${alice.uid}`, adminToken)).json()).customer;
  check("detail returns the order history", detail.orders.length === 2, `${detail.orders.length} orders`);
  check("detail order rows carry payment and fulfilment status",
    detail.orders.every((o) => o.status && o.fulfilment), JSON.stringify(detail.orders[0]).slice(0, 80));
  check("detail totals only verified paid orders", detail.totalSpent === 50000, `${detail.totalSpent}`);
  check("detail lists sign-in methods", Array.isArray(detail.providers) && detail.providers.length > 0, detail.providers?.join(","));
  check("detail payload contains no credential material",
    !/passwordHash|passwordSalt|idToken|refreshToken/i.test(JSON.stringify(detail)));

  const missing = await req(`/api/admin/customers/no-such-uid-${stamp}`, adminToken);
  check("unknown customer returns 404", missing.status === 404, String(missing.status));

  // Saved address should surface in the detail view.
  await req("/api/account/addresses", aliceToken, {
    method: "POST",
    body: JSON.stringify({
      address: { fullName: "QA Alice", phone: "9811111111", line1: "1 QA St", locality: "Area", city: "Lucknow", state: "UP", pincode: "226010" },
      label: "Home",
    }),
  });
  const withAddress = (await (await req(`/api/admin/customers/${alice.uid}`, adminToken)).json()).customer;
  check("detail shows the customer's saved addresses", withAddress.addresses.length === 1, `${withAddress.addresses.length}`);

  // ---- 5. admin profile correction is guarded and audited ---------------
  const noConfirm = await req(`/api/admin/customers/${alice.uid}`, adminToken, {
    method: "PATCH", body: JSON.stringify({ displayName: "QA Alicia", reason: "typo" }),
  });
  check("profile change without confirmation is refused", noConfirm.status === 400, String(noConfirm.status));
  const noReason = await req(`/api/admin/customers/${alice.uid}`, adminToken, {
    method: "PATCH", body: JSON.stringify({ displayName: "QA Alicia", confirm: true }),
  });
  check("profile change without a reason is refused", noReason.status === 400, String(noReason.status));
  const emptyName = await req(`/api/admin/customers/${alice.uid}`, adminToken, {
    method: "PATCH", body: JSON.stringify({ displayName: "   ", reason: "typo", confirm: true }),
  });
  check("empty name is refused", emptyName.status === 400, String(emptyName.status));

  const orderBefore = (await db.collection("orders").doc(created.orders[0]).get()).data();
  const ok = await req(`/api/admin/customers/${alice.uid}`, adminToken, {
    method: "PATCH",
    // Credential fields smuggled alongside must be ignored entirely.
    body: JSON.stringify({
      displayName: "QA Alicia", reason: "Customer asked for a spelling fix", confirm: true,
      email: "attacker@example.invalid", phoneNumber: "+919999999999", password: "hunter2", disabled: true,
    }),
  });
  check("admin can correct the display name", ok.ok, String(ok.status));

  const record = await auth.getUser(alice.uid);
  check("display name was updated", record.displayName === "QA Alicia", String(record.displayName));
  check("smuggled email change was ignored", record.email === `qa-alice-${stamp}@example.invalid`, String(record.email));
  check("smuggled phone change was ignored", !record.phoneNumber, String(record.phoneNumber));
  check("smuggled disable flag was ignored", record.disabled === false, String(record.disabled));

  const audited = (await (await req(`/api/admin/customers/${alice.uid}`, adminToken)).json()).customer;
  check("profile change is recorded in an audit trail", audited.profileHistory.length === 1, `${audited.profileHistory.length}`);
  check("audit entry records who, what and why",
    audited.profileHistory[0]?.byEmail === adminEmail &&
    audited.profileHistory[0]?.from === "QA Alice" &&
    audited.profileHistory[0]?.to === "QA Alicia" &&
    Boolean(audited.profileHistory[0]?.reason),
    audited.profileHistory[0]?.byEmail);

  const orderAfter = (await db.collection("orders").doc(created.orders[0]).get()).data();
  check("renaming a customer does not alter a historical order address",
    JSON.stringify(orderAfter.address) === JSON.stringify(orderBefore.address),
    orderAfter.address.fullName);
  check("renaming a customer does not alter order totals",
    orderAfter.amounts.total === orderBefore.amounts.total && orderAfter.status === orderBefore.status);

  // ---- 6. customer self-service profile ---------------------------------
  const anonProfile = await req("/api/account/profile", null);
  check("anonymous cannot read a profile", anonProfile.status === 401, String(anonProfile.status));

  const mine = await (await req("/api/account/profile", aliceToken)).json();
  check("customer can read their own profile", mine.profile?.uid === alice.uid, String(mine.profile?.uid));
  check("own profile shows the corrected name", mine.profile?.name === "QA Alicia", String(mine.profile?.name));
  check("own profile payload has no credential material",
    !/passwordHash|passwordSalt|refreshToken/i.test(JSON.stringify(mine)));

  const bobSees = await (await req("/api/account/profile", bobToken)).json();
  check("a customer only ever gets their own profile", bobSees.profile?.uid === bob.uid && bobSees.profile?.uid !== alice.uid,
    String(bobSees.profile?.uid));

  const rename = await req("/api/account/profile", aliceToken, {
    method: "PUT",
    body: JSON.stringify({ displayName: "Alice Renamed", email: "x@example.invalid", phoneNumber: "+919999999999" }),
  });
  check("customer can update their own name", rename.ok, String(rename.status));
  const afterSelf = await auth.getUser(alice.uid);
  check("self-update changed only the name",
    afterSelf.displayName === "Alice Renamed" && afterSelf.email === `qa-alice-${stamp}@example.invalid`,
    `${afterSelf.displayName} / ${afterSelf.email}`);

  const badSelf = await req("/api/account/profile", aliceToken, { method: "PUT", body: JSON.stringify({ displayName: "12345" }) });
  check("a numeric-only name is refused", badSelf.status === 400, String(badSelf.status));

  // ---- 7. orders with no current account are not reassigned -------------
  const ghostUid = `ghost-${stamp}`;
  const ghostRef = db.collection("orders").doc();
  created.orders.push(ghostRef.id);
  await ghostRef.set({
    orderId: ghostRef.id, userId: ghostUid,
    items: [{ id: "p1", name: "Ghost item", qty: 1, unitPrice: 12300, lineTotal: 12300 }],
    amounts: { subtotal: 12300, discount: 0, shipping: 0, tax: 0, total: 12300 },
    coupon: null, address: { fullName: "Ghost", phone: "9800000000", line1: "x", line2: "", city: "Lucknow", state: "UP", pincode: "226010" },
    phone: "+919800000000", status: "paid", paymentMethod: "razorpay",
    razorpayOrderId: "order_ghost", razorpayPaymentId: "pay_ghost",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  const after = await (await req("/api/admin/customers", adminToken)).json();
  const ghost = after.orphanOrders.find((g) => g.userId === ghostUid);
  check("an order with no current account is listed separately", Boolean(ghost), ghost ? `${ghost.orderCount} order(s)` : "missing");
  check("the orphan order is not attributed to any customer",
    after.customers.every((c) => c.uid !== ghostUid) &&
    (after.customers.find((c) => c.uid === alice.uid)?.totalSpent ?? 0) === 50000,
    `alice still ${after.customers.find((c) => c.uid === alice.uid)?.totalSpent}`);

  // ---- 8. dashboard metric ----------------------------------------------
  const stats = await (await req("/api/admin/stats", adminToken)).json();
  check("overview reports a real customer count", typeof stats.customers === "number" && stats.customers >= 2, String(stats.customers));
  check("overview still reports orders and subscribers",
    typeof stats.totalOrders === "number" && typeof stats.subscribers === "number");
}

try {
  await main();
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  for (const id of created.orders) await db.collection("orders").doc(id).delete().catch(() => {});
  for (const uid of created.users) {
    await db.recursiveDelete(db.collection("users").doc(uid)).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`\ncleanup: removed ${created.orders.length} orders, ${created.users.length} users`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
