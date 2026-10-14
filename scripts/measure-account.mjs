/**
 * Measures the /account page in a real browser, signed in, at desktop, tablet
 * and mobile widths. Reports total page height and per-card dead space so the
 * compaction work is driven by numbers rather than impressions.
 *
 * Seeds its own throwaway customer (with an order, a wishlist item and a saved
 * address so the page is realistically populated) and removes it afterwards.
 *
 *   node scripts/measure-account.mjs http://127.0.0.1:3251 [label]
 */
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
const BASE = process.argv[2] ?? "http://127.0.0.1:3251";
const LABEL = process.argv[3] ?? "before";

const MEASURE = `(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top + scrollY) }; };
  // Dead space = card height minus the bottom of its last visible child.
  const slack = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let lowest = r.top;
    for (const child of el.querySelectorAll('*')) {
      const c = child.getBoundingClientRect();
      if (c.height > 0 && c.bottom > lowest) lowest = c.bottom;
    }
    return Math.round(r.bottom - lowest);
  };
  const panels = [...document.querySelectorAll('.account-col > .panel, .account-col > section, .account-grid > .panel, .account-grid > section')]
    .map((p) => ({ label: (p.querySelector('.panel__heading, h2') || {}).textContent || '?',
                   h: Math.round(p.getBoundingClientRect().height) }));
  return {
    vw: innerWidth,
    pageH: Math.round(document.documentElement.scrollHeight),
    docOverflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    welcome: box('.account-welcome'),
    tabbar: box('.account-tabbar'),
    gapWelcomeToTabs: (() => { const w = document.querySelector('.account-welcome'), t = document.querySelector('.account-tabbar');
      if (!w || !t) return null; return Math.round(t.getBoundingClientRect().top - w.getBoundingClientRect().bottom); })(),
    grid: box('.account-grid'),
    panels,
    ordersSlack: slack('.account-col:nth-child(1) > :nth-child(1)') ?? slack('.account-grid__wide'),
    profileSlack: slack('.account-col:nth-child(2) > :nth-child(1)') ?? slack('.account-grid > section:nth-child(2)'),
    gridCols: (() => { const g = document.querySelector('.account-grid');
      return g ? getComputedStyle(g).gridTemplateColumns : null; })(),
  };
})()`;

const stamp = Date.now();
const user = await auth.createUser({ email: `qa-acct-${stamp}@example.invalid`, password: `Pw!${stamp}`, displayName: "Vijay Vishwakarma" });
const orderRef = db.collection("orders").doc();
await orderRef.set({
  orderId: orderRef.id, userId: user.uid,
  items: [{ id: "p1", name: "Celera Naturals Isabgol", qty: 2, unitPrice: 37500, lineTotal: 75000 }],
  amounts: { subtotal: 75000, discount: 0, shipping: 0, tax: 0, total: 75000 },
  coupon: null,
  address: { fullName: "Vijay Vishwakarma", phone: "9800000009", line1: "9 Account Road", line2: "", locality: "Gomti Nagar", city: "Lucknow", state: "Uttar Pradesh", pincode: "226010", landmark: "" },
  phone: "+919800000009", status: "paid", razorpayOrderId: "order_acct", razorpayPaymentId: "pay_acct",
  paymentMethod: "razorpay", fulfilment: "processing", fulfilmentHistory: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
await db.collection("users").doc(user.uid).collection("addresses").doc().set({
  fullName: "Vijay Vishwakarma", phone: "9800000009", line1: "9 Account Road", line2: "", locality: "Gomti Nagar",
  city: "Lucknow", state: "Uttar Pradesh", pincode: "226010", landmark: "",
  label: "Home", isDefault: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
await db.collection("users").doc(user.uid).set({ contactPhone: "9800000009", contactPhoneVerified: false }, { merge: true });

const { child, port } = await launch();
const cdp = await pageConnection(port);
const customToken = await auth.createCustomToken(user.uid);

try {
  await setViewport(cdp, undefined, 1280, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1500 });
  await evaluate(cdp, undefined, `(async () => {
    const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getAuth, signInWithCustomToken, setPersistence, browserLocalPersistence } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const app = getApps().length ? getApp() : initializeApp({
      apiKey: ${JSON.stringify(API_KEY)}, authDomain: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)},
      projectId: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)}, appId: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)},
    });
    const a = getAuth(app);
    await setPersistence(a, browserLocalPersistence);
    await signInWithCustomToken(a, ${JSON.stringify(customToken)});
    return 'ok';
  })()`);
  await sleep(1200);
  // A wishlist item so that card is populated too.
  await evaluate(cdp, undefined, `localStorage.setItem("cn_wishlist", JSON.stringify(["p1","p3"])), 1`);

  for (const [w, h] of [[1440, 900], [1280, 900], [768, 1024], [390, 844]]) {
    await setViewport(cdp, undefined, w, h, w < 900);
    await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2600 });
    // Wait for the page to stop growing: orders, profile and addresses all
    // load asynchronously, so a fixed delay gives irreproducible numbers.
    await evaluate(cdp, undefined, `(async () => {
      let last = -1, stable = 0;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 300));
        const h = document.documentElement.scrollHeight;
        stable = (h === last) ? stable + 1 : 0;
        last = h;
        if (stable >= 4) return h;
      }
      return last;
    })()`);
    const r = await evaluate(cdp, undefined, MEASURE);
    console.log(`\n@${w}  pageHeight=${r.pageH}px  overflowX=${r.docOverflowX}`);
    console.log(`   welcome h=${r.welcome?.h}  tabbar h=${r.tabbar?.h}  gap(welcome→tabs)=${r.gapWelcomeToTabs}`);
    console.log(`   grid cols: ${r.gridCols}`);
    for (const p of r.panels) console.log(`     card "${p.label.trim().slice(0, 22)}" h=${p.h}`);
    console.log(`   dead space: recentOrders=${r.ordersSlack}px  profile=${r.profileSlack}px`);
    await screenshot(cdp, undefined, `.audit/account-${LABEL}-${w}.png`);
    // Every tab must render its panels without overflow at this width.
    const tabs = await evaluate(cdp, undefined, `(async () => {
      const out = [];
      for (const label of ['Overview','My Orders','Profile','Wishlist']) {
        const btn = [...document.querySelectorAll('.account-tabbar button')].find(b => b.textContent.trim() === label);
        if (!btn) { out.push(label + ':MISSING'); continue; }
        btn.click();
        await new Promise(r => setTimeout(r, 700));
        const panels = document.querySelectorAll('[role=\"tabpanel\"] .panel').length;
        const over = Math.max(0, document.documentElement.scrollWidth - innerWidth);
        out.push(label + ':panels=' + panels + ',overflow=' + over);
      }
      const back = [...document.querySelectorAll('.account-tabbar button')].find(b => b.textContent.trim() === 'Overview');
      if (back) back.click();
      return out;
    })()`);
    console.log('   tabs: ' + tabs.join('  |  '));
  }
} finally {
  cdp.close(); child.kill();
  await orderRef.delete().catch(() => {});
  await db.recursiveDelete(db.collection("users").doc(user.uid)).catch(() => {});
  await auth.deleteUser(user.uid).catch(() => {});
  console.log("\ncleanup: removed the test customer, order and address");
  await sleep(300);
  process.exit(0);
}
