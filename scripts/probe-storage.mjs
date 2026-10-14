// READ-ONLY probe: is a Cloud Storage bucket actually reachable and writable?
// Writes one tiny object to a probe path and removes it. Prints no secrets.
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] ??= v;
}

const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
console.log("bucket env var present:", Boolean(bucketName));

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
    storageBucket: bucketName,
  });
}

try {
  const bucket = getStorage().bucket();
  const [exists] = await bucket.exists();
  console.log("bucket exists:", exists);
  if (exists) {
    const file = bucket.file(`_probe/${Date.now()}.txt`);
    await file.save("probe", { contentType: "text/plain" });
    console.log("write: OK");
    await file.delete();
    console.log("delete: OK");
    console.log("RESULT: Storage is configured and writable.");
  } else {
    console.log("RESULT: No such bucket. Storage is not provisioned.");
  }
} catch (error) {
  console.log("RESULT: Storage unavailable —", String(error.message).slice(0, 300));
}
process.exit(0);
