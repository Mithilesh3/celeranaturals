// READ-ONLY. Reports the shape of existing order documents so the new address
// and tracking fields can be designed against reality. Never prints values.
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
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
const snap = await db.collection("orders").limit(50).get();
console.log("orders sampled:", snap.size);

const topKeys = new Map();
const addrKeys = new Map();
const statuses = new Map();
const fulfils = new Map();
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

for (const doc of snap.docs) {
  const d = doc.data();
  for (const k of Object.keys(d)) bump(topKeys, k);
  bump(statuses, String(d.status));
  bump(fulfils, d.fulfilment === undefined ? "(absent)" : String(d.fulfilment));
  if (d.address && typeof d.address === "object") {
    for (const [k, v] of Object.entries(d.address)) {
      bump(addrKeys, `${k}${typeof v === "string" && !v.trim() ? " (empty)" : ""}`);
    }
  } else {
    bump(addrKeys, "(no address object)");
  }
}

const show = (label, map) => {
  console.log(`\n${label}`);
  for (const [k, n] of [...map].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
};
show("top-level fields (count of docs containing)", topKeys);
show("address sub-fields", addrKeys);
show("payment status", statuses);
show("fulfilment", fulfils);

const users = await db.collection("users").limit(5).get();
console.log("\nusers collection docs sampled:", users.size);
process.exit(0);
