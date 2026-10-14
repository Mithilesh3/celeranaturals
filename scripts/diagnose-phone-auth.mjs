/**
 * READ-ONLY diagnosis of Firebase phone OTP.
 *
 * Reads the authoritative Identity Platform config with the service account and
 * reproduces the failing Identity Toolkit call to capture its real error code.
 * Sends no SMS: the verification request deliberately carries an invalid
 * reCAPTCHA token, which Identity Toolkit rejects before any message is sent.
 *
 * Prints booleans, allowlists and error codes only — never key values.
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] ??= v;
}

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const PUBLIC_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const ADMIN_PROJECT = process.env.FIREBASE_PROJECT_ID ?? PUBLIC_PROJECT;
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";

const app = getApps().length ? getApps()[0] : initializeApp({
  credential: cert({
    projectId: ADMIN_PROJECT,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});

console.log("=== 1. configuration consistency");
console.log("  client projectId === admin projectId :", PUBLIC_PROJECT === ADMIN_PROJECT);
console.log("  authDomain matches project           :", AUTH_DOMAIN.startsWith(`${PUBLIC_PROJECT}.`) || AUTH_DOMAIN.includes(PUBLIC_PROJECT));
console.log("  service-account project matches      :", (process.env.FIREBASE_CLIENT_EMAIL ?? "").includes(ADMIN_PROJECT));
console.log("  api key present                      :", Boolean(API_KEY));

console.log("\n=== 2. Identity Toolkit public project config (what the browser sees)");
try {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${API_KEY}`);
  const data = await res.json();
  console.log("  http", res.status);
  console.log("  authorizedDomains:", (data.authorizedDomains ?? []).join(", ") || "(none)");
  console.log("  signIn methods advertised:", JSON.stringify(data.signIn ?? {}));
  if (data.error) console.log("  error:", data.error.message);
} catch (error) {
  console.log("  failed:", error.message);
}

console.log("\n=== 3. reCAPTCHA enforcement config (web client)");
for (const version of ["RECAPTCHA_ENTERPRISE"]) {
  const url = `https://identitytoolkit.googleapis.com/v2/recaptchaConfig?key=${API_KEY}&clientType=CLIENT_TYPE_WEB&version=${version}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(`  ${version}: http ${res.status}`, JSON.stringify(data).slice(0, 400));
}

console.log("\n=== 4. Admin Identity Platform config (authoritative)");
try {
  const token = await app.options.credential.getAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${ADMIN_PROJECT}/config`,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  const cfg = await res.json();
  console.log("  http", res.status);
  if (cfg.error) {
    console.log("  error:", cfg.error.status, "-", cfg.error.message.slice(0, 200));
  } else {
    console.log("  signIn.phoneNumber.enabled :", cfg.signIn?.phoneNumber?.enabled);
    console.log("  signIn.email.enabled       :", cfg.signIn?.email?.enabled);
    console.log("  testPhoneNumbers configured:", Object.keys(cfg.signIn?.phoneNumber?.testPhoneNumbers ?? {}).length);
    const sms = cfg.smsRegionConfig ?? {};
    if (sms.allowlistOnly) console.log("  smsRegionConfig: ALLOWLIST ->", (sms.allowlistOnly.allowedRegions ?? []).join(",") || "(empty)");
    else if (sms.allowByDefault) console.log("  smsRegionConfig: ALLOW-BY-DEFAULT, disallowed ->", (sms.allowByDefault.disallowedRegions ?? []).join(",") || "(none)");
    else console.log("  smsRegionConfig: (not set)");
    console.log("  recaptchaConfig.phoneEnforcementState:", cfg.recaptchaConfig?.phoneEnforcementState ?? "(unset)");
    console.log("  recaptchaConfig.useSmsBotScore       :", cfg.recaptchaConfig?.useSmsBotScore ?? "(unset)");
    console.log("  recaptchaConfig.useSmsTollFraudProtection:", cfg.recaptchaConfig?.useSmsTollFraudProtection ?? "(unset)");
    console.log("  authorizedDomains:", (cfg.authorizedDomains ?? []).join(", ") || "(none)");
  }
} catch (error) {
  console.log("  failed:", error.message.slice(0, 200));
}

console.log("\n=== 5. reproduce the failing call (no SMS: invalid reCAPTCHA token)");
const probeNumber = "+919000000000";
for (const body of [
  { label: "no recaptcha token", payload: { phoneNumber: probeNumber } },
  { label: "invalid recaptcha token", payload: { phoneNumber: probeNumber, recaptchaToken: "invalid-token-for-diagnosis" } },
]) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body.payload),
  });
  const data = await res.json();
  const err = data.error;
  console.log(`  ${body.label}: http ${res.status} ->`,
    err ? `${err.status ?? ""} ${err.message}` : `UNEXPECTED SUCCESS (sessionInfo ${data.sessionInfo ? "returned" : "absent"})`);
}

console.log("\n=== 6. billing / plan signal");
try {
  const token = await app.options.credential.getAccessToken();
  const res = await fetch(
    `https://cloudbilling.googleapis.com/v1/projects/${ADMIN_PROJECT}/billingInfo`,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  const info = await res.json();
  if (info.error) console.log("  billing API:", info.error.status, "-", info.error.message.slice(0, 160));
  else console.log("  billingEnabled:", info.billingEnabled === true);
} catch (error) {
  console.log("  failed:", error.message.slice(0, 160));
}

process.exit(0);
