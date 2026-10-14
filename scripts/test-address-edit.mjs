/**
 * Drives the admin "Correct address" flow in a real browser, against a seeded
 * test order shaped like the project's existing legacy orders (no locality,
 * empty line2) — the exact shape the editor has to cope with.
 *
 * Authorization is not bypassed: a throwaway admin account is created and the
 * test server runs with ADMIN_EMAILS scoped to it, so .env.local is untouched
 * and the real login form + ID-token verification are exercised.
 *
 *   node scripts/test-address-edit.mjs
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
const PORT = 3221;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const stamp = Date.now();
const adminEmail = `qa-addr-admin-${stamp}@example.invalid`;
const adminPassword = `Qa!Addr${stamp}`;
let adminUser, customer, orderId, server, cdp, chrome;

try {
  try {
    await fetch(`${BASE}/admin`, { signal: AbortSignal.timeout(1200) });
    throw new Error(`port ${PORT} already in use`);
  } catch (e) { if (String(e.message).includes("already in use")) throw e; }

  adminUser = await auth.createUser({ email: adminEmail, password: adminPassword, displayName: "QA Addr Admin" });
  customer = await auth.createUser({ email: `qa-addr-cust-${stamp}@example.invalid`, password: `Pw!${stamp}` });

  // A PAID order in the legacy address shape: no locality, no landmark.
  const ref = db.collection("orders").doc();
  orderId = ref.id;
  await ref.set({
    orderId, userId: customer.uid,
    items: [{ id: "p1", name: "QA item", qty: 1, unitPrice: 37500, lineTotal: 37500 }],
    amounts: { subtotal: 37500, discount: 0, shipping: 0, tax: 0, total: 37500 },
    coupon: null,
    address: { fullName: "Old Name", phone: "9800000001", line1: "1 Old Street", line2: "", city: "Lucknow", state: "Uttar Pradesh", pincode: "226020" },
    phone: "+919800000001",
    status: "paid", razorpayOrderId: "order_qa_addr", razorpayPaymentId: "pay_qa_addr",
    paymentMethod: "razorpay", fulfilment: "confirmed", fulfilmentHistory: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, ADMIN_EMAILS: adminEmail }, shell: true, stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/admin`)).ok) break; } catch {} await sleep(500); }

  const browser = await launch();
  chrome = browser.child;
  cdp = await pageConnection(browser.port);

  await setViewport(cdp, undefined, 390, 844, true);
  await goto(cdp, undefined, `${BASE}/admin`, { waitMs: 2000 });

  const signedIn = await evaluate(cdp, undefined, `(async () => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(document.querySelector('#admin-email'), ${JSON.stringify(adminEmail)});
    set(document.querySelector('#admin-password'), ${JSON.stringify(adminPassword)});
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('.admin-login__submit').click();
    for (let i = 0; i < 28; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (document.querySelector('.admin-sidebar')) return 'dashboard';
    }
    return 'timeout';
  })()`);
  check("admin signs in through the real login form", signedIn === "dashboard", signedIn);

  // Open this specific order's drawer.
  const openedDrawer = await evaluate(cdp, undefined, `(async () => {
    const burger = document.querySelector('.admin-burger');
    if (burger && getComputedStyle(burger).display !== 'none') { burger.click(); await new Promise(r => setTimeout(r, 400)); }
    const nav = [...document.querySelectorAll('.admin-sidebar nav button')].find(b => b.textContent.trim().startsWith('Orders'));
    nav.click();
    await new Promise(r => setTimeout(r, 1800));
    const row = [...document.querySelectorAll('.admin-table__row')].find(r => r.textContent.includes(${JSON.stringify(orderId)}));
    if (!row) return 'order row not found';
    row.click();
    await new Promise(r => setTimeout(r, 1800));
    return document.querySelector('.admin-drawer__panel') ? 'open' : 'drawer did not open';
  })()`);
  check("the order drawer opens", openedDrawer === "open", openedDrawer);

  const statuses = await evaluate(cdp, undefined, `(() => {
    const txt = document.querySelector('.admin-drawer__panel').textContent.replace(/\\s+/g,' ');
    // Read the Payment status row directly rather than regexing whole-panel text.
    const rows = [...document.querySelectorAll('.admin-detail > div')]
      .map((d) => [d.querySelector('dt')?.textContent?.trim(), d.querySelector('dd')?.textContent?.replace(/\\s+/g, ' ').trim()]);
    const paymentRow = rows.find(([dt]) => /payment status/i.test(dt || ''));
    return { paymentRow, paidShown: /\\bPaid\\b/.test(paymentRow?.[1] || ''),
             fulfilShown: /Delivery status — currently Confirmed/.test(txt),
             correctBtn: !!([...document.querySelectorAll('.admin-address button')].find(b => /correct address/i.test(b.textContent||''))) };
  })()`);
  check("payment status shows Paid while fulfilment is Confirmed", statuses.paidShown && statuses.fulfilShown, JSON.stringify(statuses));
  check("the Correct address button is present", statuses.correctBtn === true);

  // ---- the reported problem: can the edit actually be submitted? -------
  const afterOpen = await evaluate(cdp, undefined, `(async () => {
    [...document.querySelectorAll('.admin-address button')].find(b => /correct address/i.test(b.textContent||'')).click();
    await new Promise(r => setTimeout(r, 600));
    const review = [...document.querySelectorAll('.admin-address button')].find(b => /review change/i.test(b.textContent||''));
    const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return false;
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
    set('#admin-addr-reason', 'Customer called to correct the street');
    await new Promise(r => setTimeout(r, 400));
    const review2 = [...document.querySelectorAll('.admin-address button')].find(b => /review change/i.test(b.textContent||''));
    return {
      formShown: !!document.querySelector('#admin-addr-line1'),
      prefilledLine1: (document.querySelector('#admin-addr-line1')||{}).value,
      prefilledLocality: (document.querySelector('#admin-addr-locality')||{}).value,
      reviewDisabledWithReason: review2 ? review2.disabled : null,
      blockingHint: (document.querySelector('.admin-address .admin-problems, .admin-address .admin-note--blocking') || {}).textContent || null,
    };
  })()`);
  console.log("   editor state:", JSON.stringify(afterOpen));
  check("clicking Correct address opens the editor", afterOpen.formShown === true);
  check("the existing address is prefilled", /Old Street/.test(afterOpen.prefilledLine1 ?? ""), afterOpen.prefilledLine1 ?? "");
  check("legacy order has no locality to prefill", afterOpen.prefilledLocality === "", `"${afterOpen.prefilledLocality}"`);
  check("with a reason typed but locality missing, the admin is told why they cannot submit",
    afterOpen.reviewDisabledWithReason === false || Boolean(afterOpen.blockingHint),
    `disabled=${afterOpen.reviewDisabledWithReason} hint=${afterOpen.blockingHint ?? "none"}`);
  await screenshot(cdp, undefined, ".audit/admin-address-editor.png");

  // ---- complete and save the correction --------------------------------
  const saved = await evaluate(cdp, undefined, `(async () => {
    const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return false;
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
    set('#admin-addr-fullName', 'Corrected Name');
    set('#admin-addr-phone', '9811122244');
    set('#admin-addr-line1', '44 Corrected Lane');
    set('#admin-addr-locality', 'Hazratganj');
    set('#admin-addr-city', 'Lucknow');
    set('#admin-addr-state', 'Uttar Pradesh');
    set('#admin-addr-pincode', '226001');
    await new Promise(r => setTimeout(r, 500));
    const review = [...document.querySelectorAll('.admin-address button')].find(b => /review change/i.test(b.textContent||''));
    if (!review) return 'no review button';
    if (review.disabled) return 'review still disabled';
    review.click();
    await new Promise(r => setTimeout(r, 500));
    const yes = [...document.querySelectorAll('.admin-address button')].find(b => /yes, change address/i.test(b.textContent||''));
    if (!yes) return 'no confirm button';
    yes.click();
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 500));
      const panel = document.querySelector('.admin-drawer__panel');
      if (panel && /44 Corrected Lane/.test(panel.textContent)) return 'saved';
      const err = document.querySelector('.admin-address .admin-state--error');
      if (err && err.textContent.trim()) return 'error: ' + err.textContent.trim();
    }
    return 'timeout';
  })()`);
  check("the corrected address saves from the UI", saved === "saved", saved);

  // ---- Firestore truth --------------------------------------------------
  const doc = (await db.collection("orders").doc(orderId).get()).data();
  check("Firestore has the corrected address", doc.address.line1 === "44 Corrected Lane", doc.address.line1);
  check("all edited fields were saved",
    doc.address.fullName === "Corrected Name" && doc.address.locality === "Hazratganj" &&
    doc.address.pincode === "226001" && doc.address.phone === "9811122244",
    JSON.stringify(doc.address));
  check("PAYMENT STATUS UNCHANGED by the address edit",
    doc.status === "paid" && doc.razorpayPaymentId === "pay_qa_addr",
    `status=${doc.status} paymentId=${doc.razorpayPaymentId}`);
  check("fulfilment unchanged by the address edit", doc.fulfilment === "confirmed", doc.fulfilment);
  check("audit history records the previous and new address",
    doc.addressHistory?.length === 1 && doc.addressHistory[0].from.line1 === "1 Old Street" &&
    doc.addressHistory[0].to.line1 === "44 Corrected Lane",
    `${doc.addressHistory?.length} entries`);
  check("audit history records who and when",
    doc.addressHistory[0].byEmail === adminEmail && Boolean(doc.addressHistory[0].at) && Boolean(doc.addressHistory[0].reason),
    doc.addressHistory[0].byEmail);

  // ---- the customer sees the corrected address -------------------------
  const custToken = await (async () => {
    const t = await auth.createCustomToken(customer.uid);
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t, returnSecureToken: true }),
    });
    return (await r.json()).idToken;
  })();
  const custView = await (await fetch(`${BASE}/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${custToken}` } })).json();
  check("the customer's order shows the corrected address",
    custView.order.address.line1 === "44 Corrected Lane" && custView.order.address.locality === "Hazratganj",
    custView.order.address.line1);
  check("the customer still sees Paid", custView.order.status === "paid", custView.order.status);
  check("the customer sees the independent delivery status", custView.order.fulfilment === "confirmed", custView.order.fulfilment);
  check("the customer payload hides the internal audit trail",
    !JSON.stringify(custView).includes("addressHistory") && !JSON.stringify(custView).includes(adminEmail));

  // ---- estimated delivery from the drawer UI ---------------------------
  const estimateSaved = await evaluate(cdp, undefined, `(async () => {
    const sel = document.querySelector('#admin-est-days');
    if (!sel) return 'estimate section missing';
    const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    s.call(sel, '7');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const preview = document.querySelector('.admin-estimate__preview');
    const previewText = preview ? preview.textContent.trim() : '(none)';
    const btn = [...document.querySelectorAll('.admin-estimate button')].find(b => /save estimate/i.test(b.textContent || ''));
    if (!btn || btn.disabled) return 'save button unavailable';
    btn.click();
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const cur = document.querySelector('.admin-estimate__current');
      if (cur && !/Not set yet/.test(cur.textContent)) {
        return 'saved:' + cur.textContent.trim().slice(0, 40) + ' |preview: ' + previewText;
      }
    }
    return 'timeout';
  })()`);
  check('estimated delivery can be set from the drawer UI', String(estimateSaved).startsWith('saved:'), String(estimateSaved));
  const withEstimate = (await db.collection('orders').doc(orderId).get()).data();
  check('the estimate persisted to Firestore', Boolean(withEstimate.estimatedDelivery?.date), String(withEstimate.estimatedDelivery?.date));
  check('setting the estimate did not touch payment status',
    withEstimate.status === 'paid' && withEstimate.razorpayPaymentId === 'pay_qa_addr', withEstimate.status);

  // ---- fulfilment update must not touch payment ------------------------
  const before = (await db.collection("orders").doc(orderId).get()).data();
  const movedOn = await evaluate(cdp, undefined, `(async () => {
    const sel = document.querySelector('#admin-next-status');
    if (!sel) return 'no selector';
    const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
    s.call(sel, 'processing');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const btn = [...document.querySelectorAll('.admin-fulfil button')].find(b => /update status/i.test(b.textContent||''));
    if (!btn || btn.disabled) return 'update button unavailable';
    btn.click();
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (/currently Processing/.test(document.querySelector('.admin-fulfil').textContent)) return 'moved';
    }
    return 'timeout';
  })()`);
  check("delivery status can be advanced from the UI", movedOn === "moved", movedOn);
  const after = (await db.collection("orders").doc(orderId).get()).data();
  check("PAYMENT STATUS UNCHANGED by the fulfilment update",
    after.status === before.status && after.razorpayPaymentId === before.razorpayPaymentId,
    `status=${after.status}`);
  check("the address survived the fulfilment update", after.address.line1 === "44 Corrected Lane");
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  try { cdp?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  if (server) spawn("cmd", ["/c", `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %a`], { shell: true, stdio: "ignore" });
  if (orderId) await db.collection("orders").doc(orderId).delete().catch(() => {});
  for (const u of [adminUser, customer]) {
    if (!u) continue;
    await db.recursiveDelete(db.collection("users").doc(u.uid)).catch(() => {});
    await auth.deleteUser(u.uid).catch(() => {});
  }
  console.log("\ncleanup: removed the test order and accounts");
  await sleep(1200);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
