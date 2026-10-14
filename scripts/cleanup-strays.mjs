// Identifies test orders left behind by an aborted harness run. Prints a
// minimal fingerprint only. Deletes solely with --delete, and solely when the
// order matches the harness fixture AND its owner no longer exists.
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
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();
const auth = getAuth();
const DELETE = process.argv.includes("--delete");

for (const doc of (await db.collection("orders").get()).docs) {
  const d = doc.data();
  // The harness fixture name, which no real customer uses.
  const isFixture = d.address?.fullName === "Test Customer";
  let ownerExists = true;
  try { await auth.getUser(d.userId); } catch { ownerExists = false; }
  const stray = isFixture && !ownerExists;
  console.log(`${doc.id}  fixture=${isFixture}  ownerExists=${ownerExists}  status=${d.status}  ${stray ? "STRAY" : "keep"}`);
  if (stray && DELETE) {
    await doc.ref.delete();
    console.log(`  deleted ${doc.id}`);
  }
}
process.exit(0);
