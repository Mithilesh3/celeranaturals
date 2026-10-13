import { createHash } from "node:crypto";

export const NEWSLETTER_COLLECTION = "newsletterSubscribers";

/** RFC 5321 caps the whole address at 254 characters. */
export const MAX_EMAIL_LENGTH = 254;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function isValidEmail(normalized: string) {
  return normalized.length > 0 && normalized.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(normalized);
}

/**
 * Deterministic document id so the same address always maps to the same
 * document. Hashed rather than raw so the collection's key space does not
 * itself leak subscriber addresses.
 */
export function subscriberDocId(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail).digest("hex");
}

export type SubscriberStatus = "subscribed" | "unsubscribed";
export type SubscriberSource = "website_footer";
