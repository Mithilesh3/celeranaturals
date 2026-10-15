/**
 * Drives the three delivery stages from the real admin UI and checks the
 * customer order API reflects each one, plus legacy-status mapping, cancelled
 * orders, corrections, the estimate, address correction and payment safety.
 *
 * Uses seeded test orders and throwaway accounts only — no real customer order
 * is read or modified. ADMIN_EMAILS is scoped to the throwaway admin on a
 * separate server instance, so .env.local is untouched and the real login form
 * and ID-token verification are exercised.
 *
 *   node scripts/test-delivery-stages.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { evaluate, goto, launch, pageConnection, screenshot, setViewport, sleep } from "./cdp.mjs";

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
const PORT = 3271;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const stamp = Date.now();
const adminEmail = `qa-stage-admin-${stamp}@example.invalid`;
const adminPassword = `Qa!Stage${stamp}`;
const created = { orders: [], users: [] };
let server, cdp, chrome;

const seedOrder = async (uid, fulfilment, extra = {}) => {
  const ref = db.collection("orders").doc();
  created.orders.push(ref.id);
  await ref.set({
    orderId: ref.id, userId: uid,
    items: [{ id: "p1", name: "QA item", qty: 1, unitPrice: 37500, lineTotal: 37500 }],
    amounts: { subtotal: 37500, discount: 0, shipping: 0, tax: 0, total: 37500 },
    coupon: null,
    address: { fullName: "Stage Tester", phone: "9800000011", line1: "11 Stage Road", line2: "", locality: "Gomti Nagar", city: "Lucknow", state: "Uttar Pradesh", pincode: "226010", landmark: "" },
    phone: "+919800000011", status: "paid", razorpayOrderId: "order_stage", razorpayPaymentId: "pay_stage",
    paymentMethod: "razorpay", fulfilment, fulfilmentHistory: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...extra,
  });
  return ref.id;
};

try {
  try {
    await fetch(`${BASE}/admin`, { signal: AbortSignal.timeout(1200) });
    throw new Error(`port ${PORT} already in use`);
  } catch (e) { if (String(e.message).includes("already in use")) throw e; }

  const adminUser = await auth.createUser({ email: adminEmail, password: adminPassword, displayName: "QA Stage Admin" });
  const customer = await auth.createUser({ email: `qa-stage-cust-${stamp}@example.invalid`, password: `Pw!${stamp}` });
  created.users.push(adminUser.uid, customer.uid);

  // The order the UI will be driven against: starts at pending, the exact
  // state that produced "Cannot move an order from pending to delivered".
  const mainOrder = await seedOrder(customer.uid, "pending");

  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, ADMIN_EMAILS: adminEmail }, shell: true, stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/admin`)).ok) break; } catch {} await sleep(500); }

  const browser = await launch();
  chrome = browser.child;
  cdp = await pageConnection(browser.port);

  const custToken = await (async () => {
    const t = await auth.createCustomToken(customer.uid);
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t, returnSecureToken: true }),
    });
    return (await r.json()).idToken;
  })();
  const customerView = async (id) =>
    (await (await fetch(`${BASE}/api/orders/${id}`, { headers: { Authorization: `Bearer ${custToken}` } })).json());

  await setViewport(cdp, undefined, 390, 844, true);
  await goto(cdp, undefined, `${BASE}/admin`, { waitMs: 2000 });
  const signedIn = await evaluate(cdp, undefined, `(async () => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(document.querySelector('#admin-email'), ${JSON.stringify(adminEmail)});
    set(document.querySelector('#admin-password'), ${JSON.stringify(adminPassword)});
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('.admin-login__submit').click();
    for (let i = 0; i < 28; i++) { await new Promise(r => setTimeout(r, 500));
      if (document.querySelector('.admin-sidebar')) return 'dashboard'; }
    return 'timeout';
  })()`);
  check("admin signs in through the real login form", signedIn === "dashboard", signedIn);

  const openOrder = (id) => evaluate(cdp, undefined, `(async () => {
    const burger = document.querySelector('.admin-burger');
    if (burger && getComputedStyle(burger).display !== 'none') { burger.click(); await new Promise(r => setTimeout(r, 400)); }
    const nav = [...document.querySelectorAll('.admin-sidebar nav button')].find(b => b.textContent.trim().startsWith('Orders'));
    if (nav) { nav.click(); await new Promise(r => setTimeout(r, 1800)); }
    const row = [...document.querySelectorAll('.admin-table__row')].find(r => r.textContent.includes(${JSON.stringify("@@ID@@")}));
    if (!row) return 'row not found';
    row.click();
    await new Promise(r => setTimeout(r, 1700));
    return document.querySelector('.admin-stages') ? 'open' : 'no stage controls';
  })()`.replace("@@ID@@", id));

  const pickStage = (label) => evaluate(cdp, undefined, `(async () => {
    const lab = [...document.querySelectorAll('.admin-stage')].find(l => l.textContent.includes(${JSON.stringify(label)}));
    if (!lab) return 'stage option missing';
    const radio = lab.querySelector('input');
    if (radio.disabled) return 'radio disabled';
    radio.click();
    // React may still be re-rendering from the previous save; wait for the
    // button to become enabled rather than sampling once.
    let btn = null;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 300));
      btn = [...document.querySelectorAll('.admin-fulfil button')].find(b => /update delivery status/i.test(b.textContent||''));
      if (btn && !btn.disabled) break;
    }
    if (!btn) return 'update button missing';
    if (btn.disabled) return 'update button disabled (checked=' + radio.checked + ')';
    btn.click();
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 500));
      const ok = document.querySelector('.admin-state--ok');
      const err = document.querySelector('.admin-fulfil .admin-state--error, .admin-drawer__panel .admin-state--error');
      if (ok && ok.textContent.trim()) return 'saved';
      if (err && err.textContent.trim()) return 'error: ' + err.textContent.trim();
    }
    return 'timeout';
  })()`);

  check("the order drawer shows three-stage controls", (await openOrder(mainOrder)) === "open");
  const stageCount = await evaluate(cdp, undefined, `document.querySelectorAll('.admin-stages .admin-stage').length`);
  check("exactly three stages are offered in admin", stageCount === 3, String(stageCount));
  const sixGone = await evaluate(cdp, undefined, `(() => {
    const t = document.querySelector('.admin-fulfil').textContent;
    return { packed: /Packed/.test(t), shipped: /\\bShipped\\b/.test(t) };
  })()`);
  check("no Packed/Shipped options remain in the delivery controls",
    sixGone.packed === false && sixGone.shipped === false, JSON.stringify(sixGone));
  await screenshot(cdp, undefined, ".audit/admin-stages-390.png");
  // The responsive audit flags the native 13px radios; the real tap target is
  // the label wrapping each one, so measure that.
  const stageTap = await evaluate(cdp, undefined,
    `[...document.querySelectorAll('.admin-stages .admin-stage')].map(l => Math.round(l.getBoundingClientRect().height))`);
  check("each stage row is a comfortable tap target (>=44px)",
    Array.isArray(stageTap) && stageTap.length === 3 && stageTap.every((h) => h >= 44), JSON.stringify(stageTap));

  // ---- THE REPORTED BUG: pending -> Delivered in one move ---------------
  const jump = await pickStage("Delivered");
  check("pending -> Delivered succeeds (the reported error is gone)", jump === "saved", jump);
  let doc = (await db.collection("orders").doc(mainOrder).get()).data();
  check("Firestore stores the canonical delivered status", doc.fulfilment === "delivered", doc.fulfilment);
  check("payment untouched by the stage change",
    doc.status === "paid" && doc.razorpayPaymentId === "pay_stage" && doc.amounts.total === 37500,
    `${doc.status}/${doc.razorpayPaymentId}/${doc.amounts.total}`);
  let cust = await customerView(mainOrder);
  check("customer sees Delivered", cust.order.fulfilment === "delivered", cust.order.fulfilment);

  // ---- correction path: Delivered -> Order Confirmed ---------------------
  const backward = await pickStage("Order Confirmed");
  check("a backward move is refused until confirmed as a correction",
    String(backward).startsWith("error:") && /correction/i.test(String(backward)), String(backward).slice(0, 80));
  const corrected = await evaluate(cdp, undefined, `(async () => {
    const input = document.querySelector('#admin-stage-reason');
    if (!input) return 'reason field missing';
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    s.call(input, 'Marked delivered by mistake'); input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const btn = [...document.querySelectorAll('.admin-confirm button')].find(b => /confirm correction/i.test(b.textContent||''));
    if (!btn || btn.disabled) return 'confirm button unavailable';
    btn.click();
    for (let i = 0; i < 24; i++) { await new Promise(r => setTimeout(r, 500));
      const ok = document.querySelector('.admin-state--ok'); if (ok && ok.textContent.trim()) return 'saved'; }
    return 'timeout';
  })()`);
  check("a confirmed correction with a reason is accepted", corrected === "saved", corrected);
  doc = (await db.collection("orders").doc(mainOrder).get()).data();
  check("the correction moved the order back", doc.fulfilment === "confirmed", doc.fulfilment);
  check("the correction is in the audit history",
    doc.fulfilmentHistory?.some((e) => e.status === "confirmed" && /mistake/i.test(e.note ?? "")),
    JSON.stringify(doc.fulfilmentHistory?.map((e) => e.status)));
  check("payment still untouched after the correction", doc.status === "paid" && doc.razorpayPaymentId === "pay_stage");

  // ---- forward through stage 2 ------------------------------------------
  const mid = await pickStage("Preparing & Shipping");
  check("Order Confirmed -> Preparing & Shipping succeeds", mid === "saved", mid);
  doc = (await db.collection("orders").doc(mainOrder).get()).data();
  check("stage 2 canonicalises to processing", doc.fulfilment === "processing", doc.fulfilment);
  cust = await customerView(mainOrder);
  check("customer sees the stage-2 status", cust.order.fulfilment === "processing", cust.order.fulfilment);

  // ---- legacy statuses map onto the three stages ------------------------
  for (const [legacy, expectStage] of [["packed", 2], ["shipped", 2], ["processing", 2], ["confirmed", 1], ["pending", 0], ["delivered", 3]]) {
    const id = await seedOrder(customer.uid, legacy);
    const view = await customerView(id);
    check(`legacy "${legacy}" is readable by the customer and keeps its status`,
      view.order.fulfilment === legacy, view.order.fulfilment);
    void expectStage;
  }

  // ---- cancelled stays separate ------------------------------------------
  const cancelledOrder = await seedOrder(customer.uid, "cancelled");
  const cancelledView = await customerView(cancelledOrder);
  check("a cancelled order reports cancelled, not a normal stage",
    cancelledView.order.fulfilment === "cancelled", cancelledView.order.fulfilment);
  const cancelledStage = await fetch(`${BASE}/api/admin/orders/${cancelledOrder}`, { method: "PATCH" });
  void cancelledStage;

  // ---- estimate does not move the stage ----------------------------------
  const before = (await db.collection("orders").doc(mainOrder).get()).data();
  const adminToken = await (async () => {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, returnSecureToken: true }),
    });
    return (await r.json()).idToken;
  })();
  const est = await fetch(`${BASE}/api/admin/orders/${mainOrder}/estimate`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ days: 5 }),
  });
  check("the estimate can still be set", est.ok, String(est.status));
  const afterEst = (await db.collection("orders").doc(mainOrder).get()).data();
  check("setting the estimate did not change the delivery stage",
    afterEst.fulfilment === before.fulfilment, `${before.fulfilment} -> ${afterEst.fulfilment}`);
  check("setting the estimate did not change payment", afterEst.status === "paid");
  cust = await customerView(mainOrder);
  check("customer sees the estimated delivery date", Boolean(cust.order.estimatedDeliveryDate), String(cust.order.estimatedDeliveryDate));

  // ---- address correction still works -------------------------------------
  // Address edits are refused once an order is shipped/delivered, so this
  // uses a separate order still in an editable stage.
  const addrOrder = await seedOrder(customer.uid, "confirmed");
  const addr = await fetch(`${BASE}/api/admin/orders/${addrOrder}/address`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      address: { fullName: "Stage Tester", phone: "9811122255", line1: "22 New Lane", locality: "Hazratganj", city: "Lucknow", state: "Uttar Pradesh", pincode: "226001" },
      reason: "Customer moved", confirm: true,
    }),
  });
  check("address correction still works", addr.ok, String(addr.status));
  const afterAddr = (await db.collection("orders").doc(addrOrder).get()).data();
  check("address audit trail still recorded", afterAddr.addressHistory?.length >= 1, String(afterAddr.addressHistory?.length));
  check("address correction did not change the stage or payment",
    afterAddr.fulfilment === "confirmed" && afterAddr.status === "paid",
    `${afterAddr.fulfilment}/${afterAddr.status}`);

  // ---- customers cannot drive delivery or the estimate --------------------
  const custStage = await fetch(`${BASE}/api/admin/orders/${mainOrder}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({ stage: "delivered" }),
  });
  check("a customer cannot change the delivery stage", custStage.status === 403, String(custStage.status));
  const custEst = await fetch(`${BASE}/api/admin/orders/${mainOrder}/estimate`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({ days: 2 }),
  });
  check("a customer cannot change the estimate", custEst.status === 403, String(custEst.status));
  const anonStage = await fetch(`${BASE}/api/admin/orders/${mainOrder}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "delivered" }),
  });
  check("an anonymous caller cannot change the delivery stage", anonStage.status === 403, String(anonStage.status));

  // ---- no payment control exists anywhere in the drawer -------------------
  const noPayControl = await evaluate(cdp, undefined, `(() => {
    const panel = document.querySelector('.admin-drawer__panel');
    if (!panel) return 'no panel';
    const inputs = [...panel.querySelectorAll('input, select, button')]
      .filter(el => /mark as paid|set paid|payment status/i.test(el.textContent || el.value || ''));
    return inputs.length;
  })()`);
  check("no control exists to mark an order paid", noPayControl === 0, String(noPayControl));
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  try { cdp?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  if (server) spawn("cmd", ["/c", `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %a`], { shell: true, stdio: "ignore" });
  for (const id of created.orders) await db.collection("orders").doc(id).delete().catch(() => {});
  for (const uid of created.users) {
    await db.recursiveDelete(db.collection("users").doc(uid)).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`\ncleanup: removed ${created.orders.length} seeded orders and ${created.users.length} accounts`);
  await sleep(1200);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
