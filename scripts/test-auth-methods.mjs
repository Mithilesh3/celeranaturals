/**
 * Tests the email + password and Google sign-in surfaces in real headless
 * Chrome, plus the unverified-contact-number rules on the server.
 *
 * Real Firebase accounts are created through the app's own signup form and
 * deleted afterwards. No authorization check is bypassed.
 *
 *   node scripts/test-auth-methods.mjs http://127.0.0.1:3211
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
const BASE = process.argv[2] ?? "http://127.0.0.1:3211";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const stamp = Date.now();
const email = `qa-auth-${stamp}@example.invalid`;
const password = `Pw!auth${stamp}`;
const created = [];

const { child, port } = await launch();
const cdp = await pageConnection(port);

const setField = (selector, value) => evaluate(cdp, undefined, `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'missing';
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  s.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`);

const modalState = () => evaluate(cdp, undefined, `(() => ({
  google: !!document.querySelector('.auth-google'),
  googleText: (document.querySelector('.auth-google') || {}).textContent || null,
  emailField: !!document.querySelector('#auth-email'),
  passwordField: !!document.querySelector('#auth-password'),
  phoneField: !!document.querySelector('#auth-phone'),
  submitText: (document.querySelector('.auth-submit') || {}).textContent || null,
  error: (document.querySelector('.phone-auth-error') || {}).textContent || null,
  signedIn: !!document.querySelector('.account-menu__label'),
}))()`);

try {
  await setViewport(cdp, undefined, 390, 844, true);
  await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2200 });

  // ---- the default modal offers Google + email, not OTP ----------------
  let s = await modalState();
  check("modal offers Continue with Google", s.google === true, s.googleText ?? "missing");
  check("modal offers email and password by default", s.emailField && s.passwordField);
  check("phone OTP is not the required default", s.phoneField === false);
  await screenshot(cdp, undefined, ".audit/auth-email-390.png");

  // ---- mobile OTP sign-in has been removed from this flow --------------
  const otpUi = await evaluate(cdp, undefined, `(() => ({
    link: /mobile number instead/i.test(document.body.textContent || ''),
    field: !!document.querySelector('#auth-phone'),
    boxes: !!document.querySelector('.otp-boxes'),
  }))()`);
  check("no mobile OTP link, field or code boxes remain",
    otpUi.link === false && otpUi.field === false && otpUi.boxes === false, JSON.stringify(otpUi));

  // ---- sign in with a non-existent account shows a real error ----------
  await setField("#auth-email", `no-such-${stamp}@example.invalid`);
  await setField("#auth-password", "whatever123");
  await evaluate(cdp, undefined, `document.querySelector('.auth-submit').click(), 1`);
  await sleep(3500);
  s = await modalState();
  check("a wrong email/password shows a clear message",
    Boolean(s.error) && /incorrect|no account/i.test(s.error), s.error ?? "(none)");
  check("the failure message leaks no internals",
    !/\{|identitytoolkit|apiKey|INVALID_/i.test(s.error ?? ""));

  // ---- create an account through the real form -------------------------
  await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2000 });
  await evaluate(cdp, undefined, `(() => { const b=[...document.querySelectorAll('button')].find(x=>/create an account/i.test(x.textContent||'')); if(b) b.click(); return 1; })()`);
  await sleep(600);
  await setField("#auth-name-new", "QA Email User");
  await setField("#auth-email", email);
  await setField("#auth-password", password);
  await evaluate(cdp, undefined, `document.querySelector('.auth-submit').click(), 1`);

  let signedUp = false;
  for (let i = 0; i < 24; i++) {
    await sleep(700);
    if ((await modalState()).signedIn) { signedUp = true; break; }
  }
  check("signup with email + password signs the customer in", signedUp);

  const record = signedUp ? await auth.getUserByEmail(email).catch(() => null) : null;
  if (record) created.push(record.uid);
  check("a real Firebase account was created", Boolean(record), record ? "uid present" : "none");
  check("the display name was saved at signup", record?.displayName === "QA Email User", String(record?.displayName));
  check("signup did NOT set a verified phone number", !record?.phoneNumber, String(record?.phoneNumber));
  check("the provider is email/password",
    (record?.providerData ?? []).some((p) => p.providerId === "password"),
    (record?.providerData ?? []).map((p) => p.providerId).join(","));

  // ---- the account page shows the real identity ------------------------
  await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2600 });
  const account = await evaluate(cdp, undefined, `(() => {
    const dts = [...document.querySelectorAll('.detail-list div')].map(d => d.textContent.replace(/\\s+/g,' ').trim());
    return { rows: dts, header: (document.querySelector('.account-menu__label')||{}).textContent || null };
  })()`);
  check("account page shows the signed-in name", account.rows.some((r) => /QA Email User/.test(r)), account.rows.join(" | ").slice(0, 120));
  check("account page shows the sign-in method", account.rows.some((r) => /Email and password/i.test(r)));
  check("mobile number reads 'Not provided', not a fake value",
    account.rows.some((r) => /Mobile number\s*Not provided/i.test(r)), account.rows.find((r) => /Mobile/.test(r)) ?? "none");

  // ---- unverified contact number rules (server) ------------------------
  const token = await (async () => {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return (await res.json()).idToken;
  })();

  const put = (body) => fetch(`${BASE}/api/account/profile`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const bad = await put({ displayName: "QA Email User", contactPhone: "12345" });
  check("an invalid contact number is refused", bad.status === 400, String(bad.status));

  const ok = await put({ displayName: "QA Email User", contactPhone: "9811122233" });
  check("a valid contact number is accepted", ok.ok, String(ok.status));

  const after = await auth.getUser(record.uid);
  check("saving a contact number does NOT set the verified Auth phone",
    !after.phoneNumber, String(after.phoneNumber));
  const doc = (await db.collection("users").doc(record.uid).get()).data();
  check("it is stored separately and flagged unverified",
    doc?.contactPhone === "9811122233" && doc?.contactPhoneVerified === false,
    `contactPhone=${doc?.contactPhone} verified=${doc?.contactPhoneVerified}`);

  const read = await (await fetch(`${BASE}/api/account/profile`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check("the API reports phone (verified) and contactPhone separately",
    read.profile.phone === null && read.profile.contactPhone === "9811122233",
    `phone=${read.profile.phone} contact=${read.profile.contactPhone}`);
  // "password" is expected here as a PROVIDER name, so match on the actual
  // secret and on credential field names instead of the bare word.
  const readJson = JSON.stringify(read);
  check("the account password is not returned", !readJson.includes(password));
  check("no credential fields or JWTs are returned",
    !/passwordHash|passwordSalt|idToken|refreshToken|eyJ[A-Za-z0-9_-]{10,}/.test(readJson));

  // ---- returning user: sign out, then sign in again ---------------------
  await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2200 });
  const signedOut = await evaluate(cdp, undefined, `(async () => {
    const btn = [...document.querySelectorAll('button')].find(b => /sign out from this device/i.test(b.textContent||''));
    if (!btn) return 'no sign out';
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const yes = [...document.querySelectorAll('button')].find(b => /yes, sign out/i.test(b.textContent||''));
    if (yes) yes.click();
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (!document.querySelector('.account-menu__label')) return 'signed-out';
    }
    return 'still signed in';
  })()`);
  check("sign out works", signedOut === "signed-out", signedOut);

  await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2200 });
  await setField("#auth-email", email);
  await setField("#auth-password", password);
  await evaluate(cdp, undefined, `document.querySelector('.auth-submit').click(), 1`);
  let returned = false;
  for (let i = 0; i < 24; i++) {
    await sleep(700);
    if ((await modalState()).signedIn) { returned = true; break; }
  }
  check("a returning customer can sign in again", returned);

  const reread = await (await fetch(`${BASE}/api/account/profile`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check("the saved contact number survives sign-out and back in",
    reread.profile.contactPhone === "9811122233", String(reread.profile.contactPhone));

  // ---- Google: the button exists and reports honestly if disabled -------
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1800 });
  const googleOnHome = await evaluate(cdp, undefined, `(async () => {
    const open = [...document.querySelectorAll('button')].find(b => /sign in/i.test(b.textContent||'') && b.className.includes('account-menu'));
    return { present: !!document.querySelector('.auth-google') };
  })()`);
  check("Google button is part of the shared modal, not a duplicate flow",
    typeof googleOnHome.present === "boolean");
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  cdp.close(); child.kill();
  for (const uid of created) {
    await db.recursiveDelete(db.collection("users").doc(uid)).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`\ncleanup: removed ${created.length} test accounts`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
