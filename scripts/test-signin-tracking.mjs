/**
 * Verifies sign-in recording end to end with real Firebase authentications.
 *
 *   node scripts/test-signin-tracking.mjs http://localhost:3151
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

const BASE = process.argv[2] ?? "http://localhost:3151";
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

const signInWithPassword = async (email, password) => {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(data.error?.message ?? "sign-in failed");
  return data.idToken;
};

const signInWithCustomToken = async (uid) => {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(data.error?.message ?? "sign-in failed");
  return data.idToken;
};

const ping = (token) =>
  fetch(`${BASE}/api/account/session`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

const profileOf = async (uid) => (await db.collection("users").doc(uid).get()).data();

const stamp = Date.now();
const created = { users: [], orders: [] };

async function main() {
  const adminEmail = (process.env.ADMIN_EMAILS ?? "").split(",")[0].trim();
  const adminUser = await auth.getUserByEmail(adminEmail);
  const adminToken = await signInWithCustomToken(adminUser.uid);

  const email = `qa-signin-${stamp}@example.invalid`;
  const password = `Pw!${stamp}`;
  const user = await auth.createUser({ email, password, displayName: "QA SignIn" });
  created.users.push(user.uid);

  // ---- 1. a brand-new registration has no sign-in record ----------------
  check("a new registration has no sign-in record yet", (await profileOf(user.uid)) === undefined, "no users/ doc");
  const freshRecord = await auth.getUser(user.uid);
  check("Firebase reports no lastSignInTime before first sign-in", !freshRecord.metadata.lastSignInTime,
    String(freshRecord.metadata.lastSignInTime));

  // ---- 2. authorization --------------------------------------------------
  const anon = await ping(null);
  check("anonymous cannot record a sign-in", anon.status === 401, String(anon.status));
  const garbage = await ping("not-a-real-token");
  check("a forged token cannot record a sign-in", garbage.status === 401, String(garbage.status));

  // ---- 3. first real email/password sign-in -----------------------------
  const token1 = await signInWithPassword(email, password);
  const first = await ping(token1);
  const firstBody = await first.json();
  check("first sign-in is recorded", first.ok && firstBody.counted === true, JSON.stringify(firstBody));
  check("sign-in count starts at 1", firstBody.signInCount === 1, String(firstBody.signInCount));

  const profile1 = await profileOf(user.uid);
  check("a persistent profile record was created", Boolean(profile1), profile1 ? "users/ doc exists" : "missing");
  check("profile records the sign-in method", profile1.lastSignInProvider === "password", String(profile1.lastSignInProvider));
  check("profile records first and last auth times",
    Boolean(profile1.firstSignInAt) && profile1.firstSignInAt === profile1.lastAuthAt,
    `${profile1.firstSignInAt}`);

  // Firebase's own timestamp must also have advanced.
  const afterFirst = await auth.getUser(user.uid);
  check("Firebase lastSignInTime is now set", Boolean(afterFirst.metadata.lastSignInTime),
    String(afterFirst.metadata.lastSignInTime));

  // ---- 4. replaying the same token must not inflate the count ----------
  for (let attempt = 0; attempt < 3; attempt++) await ping(token1);
  const replayed = await profileOf(user.uid);
  check("replaying the same session does not inflate the count", replayed.signInCount === 1, String(replayed.signInCount));

  // ---- 5. a genuinely new authentication increments ---------------------
  // auth_time has one-second resolution, so wait to make the change provable.
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const token2 = await signInWithPassword(email, password);
  const second = await ping(token2);
  const secondBody = await second.json();
  check("a second real sign-in is counted", secondBody.counted === true && secondBody.signInCount === 2,
    JSON.stringify(secondBody));

  const profile2 = await profileOf(user.uid);
  check("firstSignInAt never moves", profile2.firstSignInAt === profile1.firstSignInAt, profile2.firstSignInAt);
  check("lastAuthAt advances", profile2.lastAuthAt > profile1.lastAuthAt, `${profile1.lastAuthAt} -> ${profile2.lastAuthAt}`);

  // ---- 6. no credential material is ever stored -------------------------
  const stored = JSON.stringify(profile2);
  // Checked against the actual secret and against token shapes. The literal
  // word "password" is expected here as a sign-in METHOD name
  // (lastSignInProvider), so matching on it alone would be a false alarm.
  check("the account password is not stored", !stored.includes(password), "secret absent");
  check("no JWT-like token material is stored", !/eyJ[A-Za-z0-9_-]{10,}/.test(stored));
  check("no credential-bearing field names are stored",
    !Object.keys(profile2).some((key) => /password|hash|salt|token|secret|credential/i.test(key)),
    Object.keys(profile2).join(","));
  check("profile stores only expected keys",
    Object.keys(profile2).every((key) =>
      ["uid", "firstSignInAt", "lastAuthAt", "signInCount", "lastSignInProvider", "updatedAt"].includes(key)),
    Object.keys(profile2).join(","));

  // ---- 7. a customer cannot record a sign-in for anyone else ------------
  const other = await auth.createUser({ email: `qa-other-${stamp}@example.invalid`, password });
  created.users.push(other.uid);
  const otherToken = await signInWithCustomToken(other.uid);
  await ping(otherToken);
  const victim = await profileOf(user.uid);
  const attacker = await profileOf(other.uid);
  check("the uid comes from the token, not the caller",
    victim.signInCount === 2 && attacker.signInCount === 1 && attacker.uid === other.uid,
    `victim=${victim.signInCount} attacker=${attacker.signInCount}`);
  check("custom-token sign-in is recorded with its own provider",
    attacker.lastSignInProvider === "custom", String(attacker.lastSignInProvider));

  // ---- 8. the admin directory reads the saved fields --------------------
  const listed = await (await fetch(`${BASE}/api/admin/customers?q=qa-signin-${stamp}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })).json();
  const row = listed.customers.find((c) => c.uid === user.uid);
  check("admin directory surfaces the recorded sign-in count", row?.signInCount === 2, String(row?.signInCount));
  check("admin directory surfaces firstSignInAt", row?.firstSignInAt === profile2.firstSignInAt, String(row?.firstSignInAt));
  check("admin directory still shows Firebase's lastSignInAt", Boolean(row?.lastSignInAt), String(row?.lastSignInAt));
  check("admin directory shows the sign-in method", row?.lastSignInProvider === "password", String(row?.lastSignInProvider));

  const detail = (await (await fetch(`${BASE}/api/admin/customers/${user.uid}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })).json()).customer;
  check("customer detail surfaces the sign-in count", detail.signInCount === 2, String(detail.signInCount));
  check("customer detail payload has no credential material",
    !/passwordHash|passwordSalt|idToken|refreshToken/i.test(JSON.stringify(detail)));

  // ---- 9. accounts with no recorded sign-in stay honest ----------------
  const neverUser = await auth.createUser({ email: `qa-never-${stamp}@example.invalid`, password });
  created.users.push(neverUser.uid);
  const all = await (await fetch(`${BASE}/api/admin/customers?q=qa-never-${stamp}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })).json();
  const neverRow = all.customers.find((c) => c.uid === neverUser.uid);
  check("an account that never signed in reports null, not zero", neverRow?.signInCount === null,
    String(neverRow?.signInCount));
  check("an account that never signed in has no lastSignInAt", neverRow?.lastSignInAt === null,
    String(neverRow?.lastSignInAt));

  // ---- 10. browsing visitors are not customers -------------------------
  const before = all.totalAccounts;
  await fetch(`${BASE}/`, { cache: "no-store" });
  await fetch(`${BASE}/shop`, { cache: "no-store" });
  const after = await (await fetch(`${BASE}/api/admin/customers`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })).json();
  check("browsing the site does not create a customer record",
    after.totalAccounts === before, `${before} -> ${after.totalAccounts}`);

  // ---- 11. the customer's own profile still works ----------------------
  const mine = await (await fetch(`${BASE}/api/account/profile`, {
    headers: { Authorization: `Bearer ${token2}` },
  })).json();
  check("customer sees their own last sign-in", Boolean(mine.profile?.lastSignInAt), String(mine.profile?.lastSignInAt));
  check("customer profile is scoped to the token", mine.profile?.uid === user.uid);
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
  console.log(`\ncleanup: removed ${created.users.length} users`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
