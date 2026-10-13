#!/usr/bin/env node
// One-shot helper: copies client_email and private_key from a Firebase
// service-account JSON into .env.local. Prints confirmations only, never values.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const jsonPath = process.argv[2];

if (!jsonPath || !existsSync(jsonPath)) {
  console.error("Service-account JSON not found. Pass its path as the first argument.");
  process.exit(1);
}

const sa = JSON.parse(readFileSync(jsonPath, "utf8"));
const missing = ["client_email", "private_key"].filter((k) => !sa[k]);
if (missing.length) {
  console.error("Missing fields in the JSON: " + missing.join(", "));
  process.exit(1);
}
if (sa.type !== "service_account") {
  console.error("That file is not a service_account key.");
  process.exit(1);
}

// Re-escape real newlines so the value stays on a single .env line. The loader
// in lib/firebase-admin.ts converts \n back, and dotenv may expand it first --
// both paths end at real newlines, so either is safe.
const escapedKey = String(sa.private_key).replace(/\r/g, "").replace(/\n/g, "\\n");

const original = readFileSync(envPath, "utf8");
copyFileSync(envPath, envPath + ".bak");

const eol = original.includes("\r\n") ? "\r\n" : "\n";
const lines = original.split(/\r?\n/);

function upsert(name, rawValue) {
  const index = lines.findIndex((l) => l.trim().startsWith(name + "="));
  const entry = `${name}="${rawValue}"`;
  if (index >= 0) lines[index] = entry;
  else lines.push(entry);
}

// Strip any stray raw-JSON fragment lines that may have been pasted in.
const JSON_FRAGMENT = /^\s*(\{|\}|,)?\s*"(type|project_id|private_key_id|private_key|client_email|client_id|auth_uri|token_uri|auth_provider_x509_cert_url|client_x509_cert_url|universe_domain)"\s*:/;
let removed = 0;
for (let i = lines.length - 1; i >= 0; i--) {
  if (JSON_FRAGMENT.test(lines[i]) || /^\s*[{}],?\s*$/.test(lines[i])) { lines.splice(i, 1); removed++; }
}

const hadEmail = lines.some((l) => l.trim().startsWith("FIREBASE_CLIENT_EMAIL="));
const hadKey = lines.some((l) => l.trim().startsWith("FIREBASE_PRIVATE_KEY="));

if (!hadEmail && !hadKey) {
  if (lines[lines.length - 1]?.trim() !== "") lines.push("");
  lines.push("# Firebase Admin service account (server only - never NEXT_PUBLIC)");
}
upsert("FIREBASE_CLIENT_EMAIL", sa.client_email);
upsert("FIREBASE_PRIVATE_KEY", escapedKey);

while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
writeFileSync(envPath, lines.join(eol) + eol, "utf8");

console.log("Updated .env.local");
console.log("  JSON fragment lines removed : " + removed);
console.log("  FIREBASE_CLIENT_EMAIL       : " + (hadEmail ? "replaced" : "added"));
console.log("  FIREBASE_PRIVATE_KEY        : " + (hadKey ? "replaced" : "added"));
console.log("  private key PEM header ok   : " + /^-----BEGIN PRIVATE KEY-----/.test(sa.private_key));
console.log("  private key PEM footer ok   : " + /-----END PRIVATE KEY-----\s*$/.test(sa.private_key));
console.log("  service account project     : " + sa.project_id);
console.log("  backup written              : .env.local.bak");
