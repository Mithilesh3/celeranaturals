#!/usr/bin/env node
// Reports which environment variable NAMES are set in .env.local.
// It never prints a value, only presence. Run with:  node scripts/check-env.mjs
import { readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(root, ".env.local");

let text = "";
let stat = null;
try {
  text = readFileSync(file, "utf8");
  stat = statSync(file);
} catch {
  console.error("MISSING: .env.local does not exist at the project root.");
  process.exit(1);
}

const present = new Set(
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")).trim())
    .filter((name) => {
      const index = text.indexOf(`${name}=`);
      const value = text.slice(index + name.length + 1).split(/\r?\n/)[0].trim();
      return name && value.length > 0;
    })
);

const GROUPS = [
  { title: "Firebase web (phone sign-in)", required: true, names: [
    "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "NEXT_PUBLIC_FIREBASE_APP_ID",
  ] },
  { title: "Razorpay (checkout)", required: true, names: ["RAZORPAY_KEY_SECRET"] },
  { title: "Firebase Admin (order auth + storage)", required: true, names: ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] },
  { title: "Optional", required: false, names: ["NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", "RAZORPAY_WEBHOOK_SECRET", "FIREBASE_PROJECT_ID"] },
];

console.log(`.env.local  ${stat.size} bytes, last saved ${stat.mtime.toLocaleString()}`);
console.log("(if that timestamp looks old, your editor has unsaved changes)\n");

let missing = 0;
for (const group of GROUPS) {
  console.log(group.title);
  for (const name of group.names) {
    const ok = present.has(name);
    if (!ok && group.required) missing++;
    console.log(`  ${ok ? "set    " : group.required ? "MISSING" : "unset  "}  ${name}`);
  }
  console.log("");
}

// The key id may legitimately carry either spelling.
const keyId = present.has("RAZORPAY_KEY_ID") || present.has("NEXT_PUBLIC_RAZORPAY_KEY_ID");
if (!keyId) missing++;
console.log(`Razorpay key id\n  ${keyId ? "set    " : "MISSING"}  RAZORPAY_KEY_ID (or NEXT_PUBLIC_RAZORPAY_KEY_ID)\n`);

if (present.has("NEXT_PUBLIC_RAZORPAY_KEY_SECRET")) {
  console.error("DANGER: NEXT_PUBLIC_RAZORPAY_KEY_SECRET is set. That prefix ships the secret to the browser.");
  console.error("        Rename it to RAZORPAY_KEY_SECRET and regenerate the key in the Razorpay dashboard.\n");
  missing++;
}

console.log(missing === 0
  ? "All required variables are set. Restart the dev server to pick them up."
  : `${missing} required variable(s) missing. Checkout will return 503 until they are set and the server restarted.`);
process.exit(missing === 0 ? 0 : 1);
