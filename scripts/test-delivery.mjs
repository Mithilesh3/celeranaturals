/**
 * End-to-end checks for the delivery address + tracking work.
 *
 * Uses real ID tokens: customer identities are throwaway Auth users created and
 * deleted by this script, and the admin token is minted for the account already
 * on ADMIN_EMAILS (no password is needed or stored). Every order it creates is
 * seeded and removed by the script, so pre-existing data is left untouched.
 *
 * Run against a dev server:  node scripts/test-delivery.mjs http://localhost:3123
 * Never prints secrets or env values.
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

const BASE = process.argv[2] ?? "http://localhost:3123";
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
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function idTokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`could not mint ID token (${data.error?.message ?? "unknown"})`);
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

const GOOD_ADDRESS = {
  fullName: "Test Customer", phone: "9811111111",
  line1: "12 Test Block, Sector 4", locality: "Gomti Nagar",
  city: "Lucknow", state: "Uttar Pradesh", pincode: "226010", landmark: "Near park",
};

const created = { orders: [], users: [] };

async function main() {
  // ---- identities -------------------------------------------------------
  const adminEmail = (process.env.ADMIN_EMAILS ?? "").split(",")[0].trim();
  const adminUser = await auth.getUserByEmail(adminEmail);
  const adminToken = await idTokenFor(adminUser.uid);

  const stamp = Date.now();
  const makeCustomer = async (tag) => {
    const user = await auth.createUser({ email: `test-${tag}-${stamp}@example.invalid`, password: `Pw!${stamp}${tag}` });
    created.users.push(user.uid);
    return { uid: user.uid, token: await idTokenFor(user.uid) };
  };
  const alice = await makeCustomer("a");
  const bob = await makeCustomer("b");

  // ---- 1. checkout address validation -----------------------------------
  const createOrder = (token, address, extra = {}) =>
    req("/api/orders/create", token, {
      method: "POST",
      body: JSON.stringify({ items: [{ id: "p1", qty: 1 }], address, ...extra }),
    });

  for (const [label, address] of [
    ["missing locality", { ...GOOD_ADDRESS, locality: "" }],
    ["bad PIN code", { ...GOOD_ADDRESS, pincode: "12" }],
    ["bad mobile", { ...GOOD_ADDRESS, phone: "1234567890" }],
    ["missing name", { ...GOOD_ADDRESS, fullName: "" }],
  ]) {
    const res = await createOrder(alice.token, address);
    const body = await res.json().catch(() => ({}));
    check(`checkout rejects ${label}`, res.status === 400, `${res.status} ${body.error ?? ""}`.slice(0, 90));
  }

  // Product id must exist, otherwise the 400 above would be meaningless.
  const probe = await createOrder(alice.token, GOOD_ADDRESS);
  const probeBody = await probe.json().catch(() => ({}));
  check("checkout accepts a complete address", probe.ok, probe.ok ? `order ${probeBody.orderId}` : `${probe.status} ${probeBody.error ?? ""}`.slice(0, 120));
  if (probe.ok) created.orders.push(probeBody.orderId);

  // ---- 2. address snapshot is normalised --------------------------------
  if (probe.ok) {
    const doc = await db.collection("orders").doc(probeBody.orderId).get();
    const stored = doc.data();
    const keys = Object.keys(stored.address).sort().join(",");
    check("stored address has exactly the known keys", keys === "city,fullName,landmark,line1,line2,locality,phone,pincode,state", keys);
    check("new order starts at fulfilment pending", stored.fulfilment === "pending", String(stored.fulfilment));
    check("new order is not paid", stored.status === "created", String(stored.status));
  }

  // Injected extra fields and oversized values must not survive.
  const injected = await createOrder(alice.token, {
    ...GOOD_ADDRESS,
    userId: "attacker", isAdmin: true, discount: 99999,
    line1: "X".repeat(500),
  });
  const injectedBody = await injected.json().catch(() => ({}));
  if (injected.ok) {
    created.orders.push(injectedBody.orderId);
    const stored = (await db.collection("orders").doc(injectedBody.orderId).get()).data();
    check("injected address fields are dropped",
      stored.address.userId === undefined && stored.address.isAdmin === undefined && stored.address.discount === undefined);
    check("oversized address field is truncated", stored.address.line1.length === 160, `len ${stored.address.line1.length}`);
    check("order owner comes from the token, not the body", stored.userId === alice.uid);
  } else {
    check("injected address fields are dropped", false, `create failed ${injected.status}`);
  }

  // ---- 3. legacy order with incomplete data -----------------------------
  const legacyRef = db.collection("orders").doc();
  created.orders.push(legacyRef.id);
  await legacyRef.set({
    orderId: legacyRef.id, userId: alice.uid,
    items: [{ id: "legacy", name: "Legacy item", qty: 1, unitPrice: 10000, lineTotal: 10000 }],
    amounts: { subtotal: 10000, discount: 0, shipping: 0, tax: 0, total: 10000 },
    coupon: null,
    // Deliberately the OLD shape: no locality, no landmark, empty line2.
    address: { fullName: "Old Record", phone: "9800000000", line1: "9 Old Street", line2: "", city: "Lucknow", state: "Uttar Pradesh", pincode: "226020" },
    phone: "+919800000000", status: "paid", paymentMethod: "razorpay",
    razorpayOrderId: "order_legacy", razorpayPaymentId: "pay_legacy",
    createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date().toISOString(),
    // no fulfilment field at all
  });
  const legacyRes = await req(`/api/orders/${legacyRef.id}`, alice.token);
  const legacyBody = await legacyRes.json().catch(() => ({}));
  check("legacy order (no fulfilment, no locality) still loads", legacyRes.ok, String(legacyRes.status));
  if (legacyRes.ok) {
    check("legacy order reads as pending", legacyBody.order.fulfilment === "pending", String(legacyBody.order.fulfilment));
    check("legacy order has no tracking", legacyBody.order.tracking === null);
  }

  // ---- 4. cross-customer isolation --------------------------------------
  const target = created.orders[0];
  const bobRes = await req(`/api/orders/${target}`, bob.token);
  check("customer B cannot read customer A's order", bobRes.status === 404, String(bobRes.status));
  const anonRes = await req(`/api/orders/${target}`, null);
  check("anonymous cannot read an order", anonRes.status === 401, String(anonRes.status));

  const bobList = await req("/api/orders", bob.token);
  const bobOrders = (await bobList.json()).orders ?? [];
  check("customer B's order list is empty", bobOrders.length === 0, `${bobOrders.length} orders`);

  // ---- 5. customers cannot act as admin ---------------------------------
  const custPatch = await req(`/api/admin/orders/${target}`, alice.token, {
    method: "PATCH", body: JSON.stringify({ fulfilment: "confirmed" }),
  });
  check("customer cannot change fulfilment", custPatch.status === 403, String(custPatch.status));
  const custAddr = await req(`/api/admin/orders/${target}/address`, alice.token, {
    method: "PUT", body: JSON.stringify({ address: GOOD_ADDRESS, reason: "x", confirm: true }),
  });
  check("customer cannot change the delivery address", custAddr.status === 403, String(custAddr.status));

  // ---- 6. admin address change is guarded and audited --------------------
  const NEW_ADDRESS = { ...GOOD_ADDRESS, line1: "44 Corrected Lane", locality: "Hazratganj", landmark: "" };
  const noConfirm = await req(`/api/admin/orders/${target}/address`, adminToken, {
    method: "PUT", body: JSON.stringify({ address: NEW_ADDRESS, reason: "Customer called" }),
  });
  check("address change without confirmation is refused", noConfirm.status === 400, String(noConfirm.status));
  const noReason = await req(`/api/admin/orders/${target}/address`, adminToken, {
    method: "PUT", body: JSON.stringify({ address: NEW_ADDRESS, confirm: true }),
  });
  check("address change without a reason is refused", noReason.status === 400, String(noReason.status));

  const before = (await db.collection("orders").doc(target).get()).data();
  const okAddr = await req(`/api/admin/orders/${target}/address`, adminToken, {
    method: "PUT",
    // Payment fields are smuggled in alongside; they must be ignored entirely.
    body: JSON.stringify({
      address: NEW_ADDRESS, reason: "Customer called to correct the street", confirm: true,
      status: "paid", razorpayPaymentId: "pay_forged", amounts: { total: 1 },
    }),
  });
  check("admin can correct the address", okAddr.ok, String(okAddr.status));
  const after = (await db.collection("orders").doc(target).get()).data();
  check("address was actually updated", after.address.line1 === "44 Corrected Lane", after.address.line1);
  check("previous address is kept in the audit trail",
    after.addressHistory?.length === 1 && after.addressHistory[0].from?.line1 === before.address.line1,
    `${after.addressHistory?.length ?? 0} entries`);
  check("audit entry records who and why",
    after.addressHistory?.[0]?.byEmail === adminEmail && Boolean(after.addressHistory[0].reason),
    after.addressHistory?.[0]?.byEmail ?? "no email");
  check("address endpoint cannot forge a paid payment",
    after.status === before.status && after.razorpayPaymentId === before.razorpayPaymentId,
    `status ${after.status}, paymentId ${String(after.razorpayPaymentId)}`);

  // ---- 7. fulfilment transitions ----------------------------------------
  const patch = (body) => req(`/api/admin/orders/${target}`, adminToken, { method: "PATCH", body: JSON.stringify(body) });

  const skip = await patch({ fulfilment: "delivered" });
  check("invalid transition pending -> delivered is refused", skip.status === 409, String(skip.status));

  const forgePaid = await patch({ fulfilment: "confirmed", status: "paid", razorpayPaymentId: "pay_forged2" });
  const afterForge = (await db.collection("orders").doc(target).get()).data();
  check("fulfilment PATCH cannot forge a paid payment",
    forgePaid.ok && afterForge.status === before.status && afterForge.razorpayPaymentId === before.razorpayPaymentId,
    `status ${afterForge.status}`);

  await patch({ fulfilment: "processing" });
  await patch({ fulfilment: "packed" });

  const shipNoTracking = await patch({ fulfilment: "shipped" });
  check("shipped without tracking is refused", shipNoTracking.status === 400, String(shipNoTracking.status));
  const shipBadNumber = await patch({ fulfilment: "shipped", courier: "Delhivery", trackingNumber: "!!" });
  check("shipped with an invalid tracking number is refused", shipBadNumber.status === 400, String(shipBadNumber.status));
  const shipBadUrl = await patch({
    fulfilment: "shipped", courier: "Delhivery", trackingNumber: "DL123456789",
    trackingUrl: "https://delhivery.com.evil.example/track",
  });
  check("untrusted tracking URL is refused", shipBadUrl.status === 400, String(shipBadUrl.status));
  const shipHttp = await patch({
    fulfilment: "shipped", courier: "Delhivery", trackingNumber: "DL123456789",
    trackingUrl: "http://delhivery.com/track",
  });
  check("non-https tracking URL is refused", shipHttp.status === 400, String(shipHttp.status));

  const shipped = await patch({
    fulfilment: "shipped", courier: "Delhivery", trackingNumber: "DL123456789",
    trackingUrl: "https://www.delhivery.com/track/package/DL123456789",
  });
  check("shipped with valid courier + tracking succeeds", shipped.ok, String(shipped.status));

  const addrAfterShip = await req(`/api/admin/orders/${target}/address`, adminToken, {
    method: "PUT", body: JSON.stringify({ address: GOOD_ADDRESS, reason: "late change", confirm: true }),
  });
  check("address cannot be changed after shipping", addrAfterShip.status === 409, String(addrAfterShip.status));

  // ---- 8. what the customer sees ----------------------------------------
  const custView = await req(`/api/orders/${target}`, alice.token);
  const custBody = await custView.json();
  check("customer sees the shipped status", custBody.order.fulfilment === "shipped", String(custBody.order.fulfilment));
  check("customer sees courier and tracking number",
    custBody.order.tracking?.courier === "Delhivery" && custBody.order.tracking?.number === "DL123456789");
  check("customer sees the trusted tracking URL", Boolean(custBody.order.tracking?.url));
  check("customer timeline has the recorded steps", (custBody.order.timeline?.length ?? 0) >= 4, `${custBody.order.timeline?.length ?? 0} entries`);

  const serialised = JSON.stringify(custBody);
  check("customer payload does not leak admin identity",
    !serialised.includes(adminEmail) && !serialised.includes(adminUser.uid) && !serialised.includes("addressHistory"));
  check("customer is told the address was corrected", custBody.order.addressEdited === true);
  check("delivery estimate is absent unless configured",
    process.env.DELIVERY_ESTIMATE_DAYS ? custBody.estimate !== null : custBody.estimate === null,
    `estimate ${custBody.estimate === null ? "null" : "present"}`);

  // ---- 9. Razorpay verification is unchanged and still strict -----------
  const forgedVerify = await req("/api/payments/verify", alice.token, {
    method: "POST",
    body: JSON.stringify({
      orderId: target, razorpay_order_id: "order_fake",
      razorpay_payment_id: "pay_fake", razorpay_signature: "deadbeef",
    }),
  });
  const afterVerify = (await db.collection("orders").doc(target).get()).data();
  check("forged payment signature is rejected", !forgedVerify.ok, String(forgedVerify.status));
  check("forged verification did not mark the order paid", afterVerify.status !== "paid", String(afterVerify.status));

  // ---- 10. saved addresses ---------------------------------------------
  const add = await req("/api/account/addresses", alice.token, {
    method: "POST", body: JSON.stringify({ address: GOOD_ADDRESS, label: "Home" }),
  });
  const addBody = await add.json();
  check("customer can save an address", add.ok, String(add.status));
  const savedId = addBody.id;

  const badSave = await req("/api/account/addresses", alice.token, {
    method: "POST", body: JSON.stringify({ address: { ...GOOD_ADDRESS, pincode: "1" }, label: "Bad" }),
  });
  check("invalid saved address is refused", badSave.status === 400, String(badSave.status));

  const aliceList = await req("/api/account/addresses", alice.token);
  const aliceAddrs = (await aliceList.json()).addresses;
  check("saved address is listed and defaulted", aliceAddrs.length === 1 && aliceAddrs[0].isDefault === true);

  const bobList2 = await req("/api/account/addresses", bob.token);
  const bobAddrs = (await bobList2.json()).addresses;
  check("customer B cannot see customer A's addresses", bobAddrs.length === 0, `${bobAddrs.length}`);

  const bobDelete = await req(`/api/account/addresses/${savedId}`, bob.token, { method: "DELETE" });
  const stillThere = (await (await req("/api/account/addresses", alice.token)).json()).addresses;
  check("customer B deleting A's address id has no effect",
    stillThere.length === 1, `B got ${bobDelete.status}, A still has ${stillThere.length}`);

  const edit = await req(`/api/account/addresses/${savedId}`, alice.token, {
    method: "PUT", body: JSON.stringify({ address: { ...GOOD_ADDRESS, city: "Kanpur" }, label: "Office" }),
  });
  const edited = (await (await req("/api/account/addresses", alice.token)).json()).addresses[0];
  check("customer can edit a saved address", edit.ok && edited.city === "Kanpur" && edited.label === "Office");

  // Editing the saved address must not disturb the order's own snapshot.
  const orderAfterEdit = (await db.collection("orders").doc(target).get()).data();
  check("editing a saved address does not change an existing order",
    orderAfterEdit.address.line1 === "44 Corrected Lane", orderAfterEdit.address.line1);

  const del = await req(`/api/account/addresses/${savedId}`, alice.token, { method: "DELETE" });
  const emptied = (await (await req("/api/account/addresses", alice.token)).json()).addresses;
  check("customer can delete a saved address", del.ok && emptied.length === 0, `${emptied.length} left`);
}

try {
  await main();
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  // Remove everything this run created; pre-existing data is untouched.
  for (const id of created.orders) await db.collection("orders").doc(id).delete().catch(() => {});
  for (const uid of created.users) {
    await db.recursiveDelete(db.collection("users").doc(uid)).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`\ncleanup: removed ${created.orders.length} test orders, ${created.users.length} test users`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
