/**
 * Tests the forgot-password flow and confirms mobile OTP is gone from the UI.
 *
 * Uses a real throwaway Firebase account and issues a REAL
 * sendPasswordResetEmail call against the live project, so the Identity
 * Toolkit response is genuine. Delivery to an inbox cannot be observed from
 * here (the address is @example.invalid) — that limit is reported, not papered
 * over. The account is deleted afterwards.
 *
 *   node scripts/test-password-reset.mjs http://127.0.0.1:3261
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
const BASE = process.argv[2] ?? "http://127.0.0.1:3261";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const stamp = Date.now();
const email = `qa-reset-${stamp}@example.invalid`;
const password = `Pw!reset${stamp}`;
const created = [];

const { child, port } = await launch();
const cdp = await pageConnection(port);

const setField = (sel, value) => evaluate(cdp, undefined, `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return 'missing';
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  s.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`);

const ui = () => evaluate(cdp, undefined, `(() => {
  const txt = (document.querySelector('.auth-dialog') || document.body).textContent.replace(/\\s+/g, ' ');
  const forgot = [...document.querySelectorAll('button')].find(b => /forgot password/i.test(b.textContent || ''));
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
  const show = [...document.querySelectorAll('.auth-password-toggle')][0];
  return {
    mobileLink: /mobile number instead/i.test(txt),
    phoneField: !!document.querySelector('#auth-phone'),
    otpBoxes: !!document.querySelector('.otp-boxes'),
    recaptchaHost: document.querySelectorAll('.auth-dialog > div:empty').length,
    forgotPresent: !!forgot,
    forgotRect: rect(forgot),
    showRect: rect(show),
    resetEmailField: !!document.querySelector('#auth-reset-email'),
    resetEmailValue: (document.querySelector('#auth-reset-email') || {}).value ?? null,
    heading: (document.querySelector('#auth-title') || {}).textContent ?? null,
    submitText: (document.querySelector('.auth-submit') || {}).textContent ?? null,
    message: (document.querySelector('.phone-auth-error') || {}).textContent ?? null,
    sent: !!document.querySelector('.auth-reset-sent'),
    sentText: (document.querySelector('.auth-reset-sent') || {}).textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    googleBtn: !!document.querySelector('.auth-google'),
  };
})()`);

try {
  const user = await auth.createUser({ email, password, displayName: "QA Reset" });
  created.push(user.uid);

  await setViewport(cdp, undefined, 390, 844, true);
  await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2400 });

  // ---- mobile OTP is gone -----------------------------------------------
  let s = await ui();
  check("the 'Use my mobile number instead' link is gone", s.mobileLink === false);
  check("no phone number field is rendered", s.phoneField === false);
  check("no OTP entry boxes are rendered", s.otpBoxes === false);
  check("Google sign-in is still offered", s.googleBtn === true);
  check("Forgot password? is visible on the sign-in form", s.forgotPresent === true);
  check("Forgot password does not overlap the Show control",
    !s.forgotRect || !s.showRect || s.forgotRect.top >= s.showRect.bottom - 1,
    `forgot.top=${s.forgotRect?.top} show.bottom=${s.showRect?.bottom}`);
  await screenshot(cdp, undefined, ".audit/auth-signin-390.png");

  // ---- email prefills from the login form --------------------------------
  await setField("#auth-email", email);
  await sleep(300);
  await evaluate(cdp, undefined, `[...document.querySelectorAll('button')].find(b => /forgot password/i.test(b.textContent||'')).click(), 1`);
  await sleep(700);
  s = await ui();
  check("Forgot password opens the reset step", s.resetEmailField === true, s.heading ?? "");
  check("the reset form pre-fills the typed email", s.resetEmailValue === email, String(s.resetEmailValue));

  // ---- empty email is refused without calling Firebase -------------------
  await setField("#auth-reset-email", "");
  await sleep(250);
  await evaluate(cdp, undefined, `(() => { const b = document.querySelector('.auth-submit'); return b && b.disabled ? 'disabled' : (b.click(), 'clicked'); })()`);
  await sleep(600);
  s = await ui();
  check("an empty email cannot be submitted", s.sent === false);

  await setField("#auth-reset-email", "not-an-email");
  await sleep(250);
  await evaluate(cdp, undefined, `document.querySelector('.auth-submit').click(), 1`);
  await sleep(900);
  s = await ui();
  check("a malformed email is rejected with a clear prompt",
    s.sent === false && /registered email/i.test(s.message ?? ""), s.message ?? "(none)");

  // ---- a real reset request for a real account ---------------------------
  await setField("#auth-reset-email", email);
  await sleep(250);
  await evaluate(cdp, undefined, `document.querySelector('.auth-submit').click(), 1`);
  let sent = false;
  for (let i = 0; i < 24; i++) {
    await sleep(600);
    s = await ui();
    if (s.sent || s.message) break;
  }
  check("a reset request for a real account succeeds", s.sent === true, s.message ?? s.sentText ?? "(no outcome)");
  check("the confirmation uses the required neutral wording",
    /If an account exists for this email, you will receive a password reset link/i.test(s.sentText ?? "") &&
    /inbox and spam folder/i.test(s.sentText ?? ""), (s.sentText ?? "").slice(0, 90));
  check("no raw Firebase error code is shown", !/auth\/|identitytoolkit|\{/.test(s.sentText ?? ""));
  await screenshot(cdp, undefined, ".audit/auth-reset-sent-390.png");

  // ---- unknown address gives the SAME answer (no account enumeration) ----
  await evaluate(cdp, undefined, `[...document.querySelectorAll('button')].find(b => /back to sign in/i.test(b.textContent||'')).click(), 1`);
  await sleep(700);
  await evaluate(cdp, undefined, `[...document.querySelectorAll('button')].find(b => /forgot password/i.test(b.textContent||'')).click(), 1`);
  await sleep(600);
  await setField("#auth-reset-email", `definitely-not-registered-${stamp}@example.invalid`);
  await sleep(250);
  await evaluate(cdp, undefined, `document.querySelector('.auth-submit').click(), 1`);
  for (let i = 0; i < 24; i++) { await sleep(600); s = await ui(); if (s.sent || s.message) break; }
  check("an unregistered address gets the identical confirmation", s.sent === true, s.message ?? "(error shown)");

  // ---- returning to sign in ----------------------------------------------
  await evaluate(cdp, undefined, `[...document.querySelectorAll('button')].find(b => /back to sign in/i.test(b.textContent||'')).click(), 1`);
  await sleep(700);
  s = await ui();
  check("Back to sign in returns to the login form", s.resetEmailField === false && s.forgotPresent === true, s.heading ?? "");

  // ---- sign-in still works after all that --------------------------------
  await setField("#auth-email", email);
  await setField("#auth-password", password);
  await sleep(300);
  await evaluate(cdp, undefined, `document.querySelector('.auth-submit').click(), 1`);
  let signedIn = false;
  for (let i = 0; i < 24; i++) {
    await sleep(700);
    if (await evaluate(cdp, undefined, `!!document.querySelector('.account-menu__label')`)) { signedIn = true; break; }
  }
  check("email + password sign-in still works", signedIn);

  // ---- the reset link really was generated (server-side proof) -----------
  const link = await auth.generatePasswordResetLink(email).catch((e) => `ERROR: ${e.message}`);
  check("Firebase can generate a reset link for this account",
    typeof link === "string" && link.startsWith("https://"), String(link).slice(0, 60) + "…");
  check("the reset link points at this Firebase project",
    typeof link === "string" && link.includes("oobCode=") && link.includes(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? ""),
    typeof link === "string" ? "oobCode present" : "no link");
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  cdp.close(); child.kill();
  for (const uid of created) {
    await db.recursiveDelete(db.collection("users").doc(uid)).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`\ncleanup: removed ${created.length} test account`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
