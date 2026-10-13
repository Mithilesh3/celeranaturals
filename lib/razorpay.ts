import { createHmac, timingSafeEqual } from "node:crypto";
import type { Paise } from "./money";

// Razorpay is reached over REST; no SDK package is required.
const RAZORPAY_API = "https://api.razorpay.com/v1";

/**
 * The key id is public by design (Razorpay sends it to the browser), so either
 * spelling is accepted. The SECRET is only ever read from the unprefixed name:
 * a NEXT_PUBLIC_ copy of the secret would be inlined into the client bundle,
 * so it is treated as a misconfiguration rather than honoured.
 */
export function razorpayKeyId(): string | undefined {
  return process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
}

export function razorpaySecretIsPublic(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_RAZORPAY_KEY_SECRET);
}

export function isRazorpayConfigured(): boolean {
  return Boolean(razorpayKeyId() && process.env.RAZORPAY_KEY_SECRET);
}

function authHeader(): string {
  const id = razorpayKeyId();
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

export async function createRazorpayOrder(amount: Paise, receipt: string): Promise<RazorpayOrder> {
  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    // Razorpay expects the smallest currency unit, which is already our internal format.
    body: JSON.stringify({ amount, currency: "INR", receipt, payment_capture: 1 }),
  });
  if (!response.ok) {
    throw new Error(`Razorpay order creation failed with status ${response.status}`);
  }
  return (await response.json()) as RazorpayOrder;
}

/** Constant-time compare so a mismatch cannot be probed by timing. */
function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The only thing that may mark an order paid.
 * signature == HMAC_SHA256(`${razorpayOrderId}|${razorpayPaymentId}`, KEY_SECRET)
 */
export function verifyPaymentSignature(razorpayOrderId: string, razorpayPaymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhooks are signed with a separate secret over the exact raw request body. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
