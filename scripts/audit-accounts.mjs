// READ-ONLY. Confirms no throwaway test accounts were left behind by the
// harnesses. Prints counts and prefixes only, never full addresses.
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

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}

const page = await getAuth().listUsers(1000);
const isTest = (user) => /^(qa-|test-)/.test(user.email ?? "") || (user.email ?? "").endsWith("@example.invalid");
const leftovers = page.users.filter(isTest);

console.log("auth accounts total:", page.users.length);
console.log("leftover test accounts:", leftovers.length);
for (const user of leftovers) console.log("  stray:", (user.email ?? "").slice(0, 16) + "…");
process.exit(0);
