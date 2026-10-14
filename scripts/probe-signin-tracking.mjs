/**
 * READ-MOSTLY probe: does Firebase Auth's own metadata.lastSignInTime actually
 * advance on a successful sign-in, for each method this site uses?
 *
 * Creates throwaway accounts, signs in through the real Identity Toolkit REST
 * endpoints, and compares the Admin SDK's view before and after. Deletes
 * everything it creates. Prints no secrets.
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
const stamp = Date.now();
const created = [];

const meta = async (uid) => {
  const record = await auth.getUser(uid);
  return {
    creation: record.metadata.creationTime ?? null,
    lastSignIn: record.metadata.lastSignInTime ?? null,
    lastRefresh: record.metadata.lastRefreshTime ?? null,
  };
};

const show = (label, m) =>
  console.log(`  ${label.padEnd(16)} creation=${m.creation ?? "-"}  lastSignIn=${m.lastSignIn ?? "-"}`);

try {
  // ---- email / password (the admin sign-in method) ----------------------
  console.log("\n[1] email + password sign-in");
  const email = `probe-pw-${stamp}@example.invalid`;
  const password = `Pw!${stamp}`;
  const pwUser = await auth.createUser({ email, password });
  created.push(pwUser.uid);

  const before = await meta(pwUser.uid);
  show("after signup", before);

  // Wait so a changed timestamp is unambiguous rather than same-second.
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signin = await res.json();
  console.log("  REST sign-in ok:", Boolean(signin.idToken));

  const after = await meta(pwUser.uid);
  show("after sign-in", after);
  console.log("  >> lastSignInTime advanced:",
    before.lastSignIn !== after.lastSignIn || new Date(after.lastSignIn) > new Date(before.lastSignIn));

  // ---- custom token (what the test harnesses use) -----------------------
  console.log("\n[2] custom-token sign-in");
  const ctUser = await auth.createUser({ email: `probe-ct-${stamp}@example.invalid`, password });
  created.push(ctUser.uid);
  const ctBefore = await meta(ctUser.uid);
  show("after signup", ctBefore);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const custom = await auth.createCustomToken(ctUser.uid);
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const ctAfter = await meta(ctUser.uid);
  show("after sign-in", ctAfter);
  console.log("  >> lastSignInTime advanced:", ctBefore.lastSignIn !== ctAfter.lastSignIn);

  // ---- a phone-number account, never signed in --------------------------
  console.log("\n[3] account created but never signed in");
  const phoneUser = await auth.createUser({ phoneNumber: `+9198${String(stamp).slice(-8)}` });
  created.push(phoneUser.uid);
  const never = await meta(phoneUser.uid);
  show("never signed in", never);
  console.log("  >> lastSignInTime is", never.lastSignIn === null ? "null (honest gap)" : "populated");

  // ---- what the real accounts on this project look like -----------------
  console.log("\n[4] existing project accounts (counts only)");
  const page = await auth.listUsers(1000);
  const real = page.users.filter((u) => !/^probe-/.test(u.email ?? ""));
  const withSignIn = real.filter((u) => Boolean(u.metadata.lastSignInTime));
  const withName = real.filter((u) => Boolean(u.displayName?.trim()));
  console.log(`  accounts=${real.length}  with lastSignInTime=${withSignIn.length}  with displayName=${withName.length}`);
  for (const u of real) {
    console.log(`   provider=${u.providerData.map((p) => p.providerId).join("/") || "-"}  name=${u.displayName ? "set" : "MISSING"}  lastSignIn=${u.metadata.lastSignInTime ? "set" : "MISSING"}`);
  }
} finally {
  for (const uid of created) await auth.deleteUser(uid).catch(() => {});
  console.log(`\ncleanup: removed ${created.length} probe accounts`);
  process.exit(0);
}
