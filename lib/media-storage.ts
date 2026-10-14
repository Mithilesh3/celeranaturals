import { getStorage } from "firebase-admin/storage";
import { ensureAdminApp, isAdminConfigured } from "./firebase-admin";

/**
 * Image upload target.
 *
 * SERVER ONLY. Uploads go to Cloud Storage for Firebase. Image bytes are never
 * written to Firestore: a document only ever holds the resulting path or URL.
 *
 * Cloud Storage has to be provisioned for the project before this can work. On
 * the Spark (free) plan a default bucket is not available, so an honest
 * "not configured" is reported rather than accepting an upload that would be
 * lost. Admins can still pick from the repository media library or reference an
 * allowlisted https image URL.
 */
export type StorageStatus =
  | { available: true; bucket: string }
  | { available: false; reason: string; setup: string[] };

const SETUP_STEPS = [
  "In the Firebase console, open Build > Storage and click Get started.",
  "Cloud Storage requires the project to be on the Blaze (pay-as-you-go) plan. Enabling it is a billing change — do not enable it without explicit approval.",
  "Once the bucket exists, set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET in .env.local to the bucket name shown in the console and restart the server.",
  "Deploy storage.rules so that only the Admin SDK writes product images and reads are public.",
];

let cached: StorageStatus | null = null;

/**
 * Checked once per process and cached: a bucket is not provisioned or
 * de-provisioned mid-request, and probing on every page load would add a
 * network round trip to the admin UI.
 */
export async function getStorageStatus(): Promise<StorageStatus> {
  if (cached) return cached;

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (!isAdminConfigured() || !bucketName) {
    cached = { available: false, reason: "No storage bucket is configured for this project.", setup: SETUP_STEPS };
    return cached;
  }

  try {
    const [exists] = await getStorage(ensureAdminApp()).bucket(bucketName).exists();
    cached = exists
      ? { available: true, bucket: bucketName }
      : { available: false, reason: "The configured storage bucket does not exist yet.", setup: SETUP_STEPS };
  } catch (error) {
    cached = {
      available: false,
      reason: `Storage could not be reached: ${error instanceof Error ? error.message.slice(0, 160) : "unknown error"}`,
      setup: SETUP_STEPS,
    };
  }
  return cached;
}

/**
 * Stores an image and returns a stable https URL.
 *
 * Only called once getStorageStatus() reports available, so this never
 * pretends to have persisted something it could not.
 */
export async function uploadProductImage(
  bytes: Buffer,
  contentType: string,
  filename: string,
): Promise<string> {
  const status = await getStorageStatus();
  if (!status.available) throw new Error(status.reason);

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
  const objectPath = `product-images/${Date.now()}-${safeName}`;
  const file = getStorage(ensureAdminApp()).bucket(status.bucket).file(objectPath);

  await file.save(bytes, { contentType, resumable: false, metadata: { cacheControl: "public, max-age=31536000, immutable" } });
  await file.makePublic();

  return `https://storage.googleapis.com/${status.bucket}/${encodeURI(objectPath)}`;
}
