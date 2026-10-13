import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { NEWSLETTER_COLLECTION, isValidEmail, normalizeEmail, subscriberDocId } from "../../../../lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_048;

/**
 * Best-effort per-instance throttle. Serverless instances are not shared, so
 * this slows casual abuse only and is NOT a real rate limiter. A production
 * deployment should put a proper limiter or CAPTCHA in front of this route.
 */
const RECENT = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function throttled(key: string): boolean {
  const now = Date.now();
  const hits = (RECENT.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  hits.push(now);
  RECENT.set(key, hits);
  if (RECENT.size > 5_000) RECENT.clear(); // crude bound; this map is not a store
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Subscriptions are not available right now." }, { status: 503 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }

  let body: { email?: unknown };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  if (typeof body.email !== "string") {
    return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Keyed on the hash, never the address itself.
  const id = subscriberDocId(email);
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  if (throttled(forwarded.split(",")[0].trim() || id)) {
    return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
  }

  const ref = adminDb().collection(NEWSLETTER_COLLECTION).doc(id);

  try {
    // The transaction makes two simultaneous submissions of the same address
    // resolve to a single document rather than racing to overwrite each other.
    const alreadySubscribed = await adminDb().runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) return true;
      tx.set(ref, {
        email,
        status: "subscribed",
        source: "website_footer",
        createdAt: FieldValue.serverTimestamp(),
      });
      return false;
    });

    return NextResponse.json({ alreadySubscribed }, { status: alreadySubscribed ? 200 : 201 });
  } catch {
    // Deliberately opaque, and the address is never written to the log.
    return NextResponse.json({ error: "Could not save your subscription. Please try again." }, { status: 500 });
  }
}
