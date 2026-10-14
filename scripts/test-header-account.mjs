/**
 * Tests the mobile drawer's account behaviour in real headless Chrome, at the
 * four small widths the brief calls out.
 *
 * The signed-in state is established with a Firebase custom token for a
 * throwaway account, exchanged through the real client SDK, so the header
 * reacts to genuine Firebase auth state — no UI flag is faked and no
 * authentication check is bypassed. The account is deleted afterwards.
 *
 * Phone OTP cannot be exercised here: the project has no billing, so Identity
 * Toolkit refuses real numbers (see scripts/diagnose-phone-auth.mjs).
 *
 *   node scripts/test-header-account.mjs http://127.0.0.1:3201
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
const BASE = process.argv[2] ?? "http://127.0.0.1:3201";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const openDrawer = () => evaluate(cdp, undefined, `(async () => {
  const toggle = document.querySelector('.mobile-toggle');
  if (!toggle || getComputedStyle(toggle).display === 'none') return 'no hamburger';
  toggle.click();
  await new Promise(r => setTimeout(r, 450));
  return document.querySelector('.mobile-menu.open') ? 'open' : 'did not open';
})()`);

const drawerState = () => evaluate(cdp, undefined, `(() => {
  const menu = document.querySelector('.mobile-menu');
  const signin = document.querySelector('.mobile-menu-signin');
  const acct = document.querySelector('.mobile-account--in');
  const nav = menu ? menu.querySelector('nav') : null;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const cs = signin ? getComputedStyle(signin) : null;
  return {
    open: !!document.querySelector('.mobile-menu.open'),
    signin: rect(signin),
    signinText: signin ? signin.textContent.replace(/\\s+/g, ' ').trim() : null,
    signinBg: cs ? cs.backgroundColor : null,
    account: rect(acct),
    accountName: acct ? (acct.querySelector('.mobile-account__name strong') || {}).textContent : null,
    accountLinks: [...document.querySelectorAll('.mobile-account__links a')].map(a => a.textContent.trim()),
    hasSignOut: !!document.querySelector('.mobile-account-signout'),
    navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
    menuW: rect(menu) ? rect(menu).w : null,
    bodyOverflow: getComputedStyle(document.body).overflow,
    navLinks: nav ? [...nav.querySelectorAll('a, summary')].map(a => a.textContent.trim()).filter(Boolean) : [],
    headerAccountLabel: (document.querySelector('.account-menu__label, .account-menu button') || {}).textContent || null,
  };
})()`);

const { child, port } = await launch();
const cdp = await pageConnection(port);
const stamp = Date.now();
let user;

try {
  // ---- guest -----------------------------------------------------------
  for (const width of [320, 360, 390, 430]) {
    await setViewport(cdp, undefined, width, 780, true);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 1600 });
    const opened = await openDrawer();
    if (opened !== "open") { check(`drawer opens @${width}`, false, opened); continue; }
    const s = await drawerState();

    check(`@${width} drawer shows a Sign In / Create Account button`,
      Boolean(s.signin) && /Sign In \/ Create Account/i.test(s.signinText ?? ""), s.signinText ?? "missing");
    check(`@${width} the button is full width`, s.signin && s.signin.w >= s.menuW - 48, `btn ${s.signin?.w} of ${s.menuW}`);
    check(`@${width} the button is green, not a plain text link`,
      /rgb\(20,\s*91,\s*58\)|rgb\(13,\s*67,\s*44\)/.test(s.signinBg ?? ""), s.signinBg ?? "none");
    check(`@${width} the button is comfortably tappable`, s.signin && s.signin.h >= 44, `${s.signin?.h}px`);
    check(`@${width} it sits above the navigation links`,
      s.signin && s.navTop !== null && s.signin.top < s.navTop, `btn ${s.signin?.top} vs nav ${s.navTop}`);
    check(`@${width} background scrolling is locked while open`, s.bodyOverflow === "hidden", s.bodyOverflow);
    check(`@${width} Home/Products/Categories/About/Contact/Brochure remain`,
      ["Home", "Products", "Categories", "About", "Contact"].every((l) => s.navLinks.includes(l)) &&
      s.navLinks.some((l) => /brochure/i.test(l)), s.navLinks.join("|"));
    if (width === 390) await screenshot(cdp, undefined, ".audit/drawer-guest-390.png");
  }

  // ---- the button opens the existing auth modal ------------------------
  await setViewport(cdp, undefined, 390, 780, true);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1500 });
  await openDrawer();
  const opened = await evaluate(cdp, undefined, `(async () => {
    document.querySelector('.mobile-menu-signin').click();
    await new Promise(r => setTimeout(r, 900));
    return {
      modal: !!document.querySelector('#auth-email') || !!document.querySelector('input[inputmode="numeric"]'),
      drawerClosed: !document.querySelector('.mobile-menu.open'),
      duplicateForms: document.querySelectorAll('input[autocomplete="tel-national"]').length,
    };
  })()`);
  check("the button opens the existing auth modal", opened.modal === true, JSON.stringify(opened));
  check("the drawer closes when the modal opens", opened.drawerClosed === true);
  check("no duplicate sign-in form is rendered", opened.duplicateForms <= 1, `${opened.duplicateForms} phone fields`);

  // ---- Escape closes the drawer ----------------------------------------
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1400 });
  await openDrawer();
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(500);
  const afterEsc = await drawerState();
  check("Escape closes the drawer", afterEsc.open === false);
  check("page scrolling is restored after closing", afterEsc.bodyOverflow !== "hidden", afterEsc.bodyOverflow);

  // ---- signed in --------------------------------------------------------
  user = await auth.createUser({
    uid: `qa-hdr-${stamp}`, displayName: "QA Shopper",
    email: `qa-hdr-${stamp}@example.invalid`, password: `Pw!${stamp}`,
  });
  const customToken = await auth.createCustomToken(user.uid);

  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1500 });
  // Signs in through the app's own Firebase config and persistence, so the
  // app's onAuthStateChanged is what drives the header.
  const signedIn = await evaluate(cdp, undefined, `(async () => {
    const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ${JSON.stringify(customToken)}, returnSecureToken: true }),
    });
    const data = await res.json();
    return data.idToken ? 'token-ok' : JSON.stringify(data).slice(0, 120);
  })()`);
  check("a test session can be minted for the signed-in checks", signedIn === "token-ok", signedIn);

  // Drive the real client SDK via the app's own sign-in surface instead of
  // writing storage by hand: load the page with the token handed to the SDK.
  await evaluate(cdp, undefined, `(async () => {
    const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getAuth, signInWithCustomToken, setPersistence, browserLocalPersistence } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const app = getApps().length ? getApp() : initializeApp({
      apiKey: ${JSON.stringify(API_KEY)},
      authDomain: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)},
      projectId: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)},
      appId: ${JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_APP_ID)},
    });
    const a = getAuth(app);
    await setPersistence(a, browserLocalPersistence);
    await signInWithCustomToken(a, ${JSON.stringify(customToken)});
    return 'signed-in';
  })()`);
  await sleep(1200);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 2600 });

  await openDrawer();
  const inState = await drawerState();
  check("signed in, the drawer shows the account section", Boolean(inState.account), JSON.stringify(inState.account));
  check("the guest Sign In button is gone", inState.signin === null, inState.signinText ?? "absent");
  check("the customer's name is shown", /QA Shopper/.test(inState.accountName ?? ""), inState.accountName ?? "none");
  check("account links are present and expanded",
    ["My Profile", "My Orders", "Saved Addresses", "Wishlist"].every((l) => inState.accountLinks.some((x) => x.includes(l))),
    inState.accountLinks.join("|"));
  check("Sign Out is available", inState.hasSignOut === true);
  check("site navigation is still available alongside the account section",
    ["Home", "Products", "About", "Contact"].every((l) => inState.navLinks.includes(l)), inState.navLinks.join("|"));
  check("account section sits above the navigation",
    inState.account && inState.navTop !== null && inState.account.top < inState.navTop,
    `acct ${inState.account?.top} vs nav ${inState.navTop}`);
  await screenshot(cdp, undefined, ".audit/drawer-signedin-390.png");

  // ---- header reflects auth without a refresh ---------------------------
  const headerBefore = await evaluate(cdp, undefined, `(document.querySelector('.account-menu__label') || {}).textContent || null`);
  check("the header shows an account control when signed in", headerBefore !== null, String(headerBefore));

  const afterSignOut = await evaluate(cdp, undefined, `(async () => {
    const btn = document.querySelector('.mobile-account-signout');
    if (!btn) return 'no sign out button';
    btn.click();
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (document.querySelector('.mobile-menu-signin') || document.querySelector('.account-menu__signin, .icon-btn[aria-label*="Sign"]')) return 'guest-restored';
    }
    return 'still signed in';
  })()`);
  // Sign-out navigates home and closes the drawer, so reopen to inspect it.
  await sleep(800);
  await openDrawer();
  const guestAgain = await drawerState();
  check("signing out restores the guest Sign In button without a reload",
    Boolean(guestAgain.signin) && guestAgain.account === null,
    `${afterSignOut}; signin=${Boolean(guestAgain.signin)} account=${Boolean(guestAgain.account)}`);
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  cdp.close(); child.kill();
  if (user) {
    await getFirestore().recursiveDelete(getFirestore().collection("users").doc(user.uid)).catch(() => {});
    await auth.deleteUser(user.uid).catch(() => {});
    console.log("removed the throwaway test account");
  }
  await sleep(400);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
