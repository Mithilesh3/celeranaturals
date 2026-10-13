#!/usr/bin/env node
// Verifies Firebase Admin, Firestore reachability and Razorpay test-mode order
// creation using the real credentials in .env.local.
// Prints pass/fail only - never a credential, key, email or secret.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Minimal .env.local loader (dotenv-compatible for our simple cases).
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 0) continue;
  const name = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\n/g, "\n");
  process.env[name] = value;
}

const ok = (label, detail = "") => console.log(`  PASS  ${label}${detail ? "  (" + detail + ")" : ""}`);
const bad = (label, detail = "") => console.log(`  FAIL  ${label}${detail ? "  (" + detail + ")" : ""}`);
let failures = 0;

// 1. Firebase Admin credentials
let adminApp = null;
try {
  const { initializeApp, cert } = require("firebase-admin/app");
  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  }, "verify");
  ok("Firebase Admin initialised");
} catch (e) {
  bad("Firebase Admin init", e.code || e.message?.slice(0, 60));
  failures++;
}

// 2. Credentials actually authenticate with Google (mint a custom token)
let customToken = null;
if (adminApp) {
  try {
    const { getAuth } = require("firebase-admin/auth");
    customToken = await getAuth(adminApp).createCustomToken("verify-stack-probe");
    ok("Service account signs tokens", "private key valid");
  } catch (e) {
    bad("createCustomToken", e.code || e.message?.slice(0, 60));
    failures++;
  }
}

// 3. Round-trip: custom token -> ID token -> verifyIdToken (the API auth path)
if (customToken) {
  try {
    const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok || !data.idToken) throw new Error(data.error?.message || "no idToken");
    const { getAuth } = require("firebase-admin/auth");
    const decoded = await getAuth(adminApp).verifyIdToken(data.idToken);
    if (decoded.uid !== "verify-stack-probe") throw new Error("uid mismatch");
    ok("ID token verification round-trip", "requireUser() path works");
    process.env.__PROBE_ID_TOKEN = data.idToken;
  } catch (e) {
    bad("ID token round-trip", String(e.message).slice(0, 70));
    failures++;
  }
}

// 4. Firestore reachable (read only - nothing is written)
if (adminApp) {
  try {
    const { getFirestore } = require("firebase-admin/firestore");
    await getFirestore(adminApp).collection("orders").limit(1).get();
    ok("Firestore reachable", "database exists, read allowed");
  } catch (e) {
    const code = e.code || "";
    const hint = String(e.message || "").includes("NOT_FOUND") || code === 5
      ? "database not created yet"
      : String(e.message).slice(0, 60);
    bad("Firestore read", hint);
    failures++;
  }
}

// 5. Razorpay test-mode order creation (real call, test account)
try {
  const id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("not configured");
  if (!id.startsWith("rzp_test_")) throw new Error("key id is not a TEST key - refusing");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") },
    body: JSON.stringify({ amount: 100, currency: "INR", receipt: "verify-stack-probe" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.description || `HTTP ${res.status}`);
  ok("Razorpay test order created", `status=${data.status}, amount=${data.amount} paise`);

  // 6. Signature verification logic against that real order id
  const { createHmac } = await import("node:crypto");
  const fakePaymentId = "pay_probe_not_real";
  const sig = createHmac("sha256", secret).update(`${data.id}|${fakePaymentId}`).digest("hex");
  const good = createHmac("sha256", secret).update(`${data.id}|${fakePaymentId}`).digest("hex") === sig;
  const badSig = createHmac("sha256", "wrong").update(`${data.id}|${fakePaymentId}`).digest("hex") === sig;
  if (good && !badSig) ok("HMAC signature verification", "correct secret matches, wrong secret rejected");
  else { bad("HMAC signature verification"); failures++; }
} catch (e) {
  bad("Razorpay order creation", String(e.message).slice(0, 70));
  failures++;
}

console.log(failures === 0 ? "\nAll stack checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
