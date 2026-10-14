import type { Paise } from "./money";

/**
 * Server-side coupon registry — the single source of truth.
 *
 * Coupons are validated and the discount recomputed on the server in
 * /api/orders/create. A code supplied by the browser is only ever a *claim*;
 * the amount it is worth is never taken from the client, so a tampered request
 * cannot manufacture a discount.
 *
 * This file is imported only by server code. To add a coupon, append an entry
 * below and redeploy. Codes are compared case-insensitively.
 */
export type Coupon = {
  /** Stored uppercase; user input is upper-cased before lookup. */
  code: string;
  type: "percent" | "flat";
  /** percent: 1-100.  flat: amount in paise. */
  value: number;
  /** Optional minimum order subtotal, in paise, before the coupon applies. */
  minOrderPaise?: number;
  /** Optional ISO date-time after which the coupon stops working. */
  expiresAt?: string;
  /** Shown to the customer when the coupon is applied. */
  label: string;
};

/**
 * Intentionally empty. No coupon codes have been supplied for this store yet,
 * and inventing one would mean shipping a discount nobody authorised.
 * Add real entries here, for example:
 *   { code: "WELCOME10", type: "percent", value: 10, label: "10% off your order" }
 */
export const COUPONS: Coupon[] = [];

export const normalizeCouponCode = (raw: string) => raw.trim().toUpperCase();

export type CouponResult =
  | { ok: true; coupon: Coupon; discount: Paise }
  | { ok: false; error: string };

/** Validates a claimed code against the registry and computes what it is worth. */
export function applyCoupon(rawCode: string, subtotal: Paise, now = new Date()): CouponResult {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: "Enter a coupon code." };

  const coupon = COUPONS.find((candidate) => candidate.code.toUpperCase() === code);
  if (!coupon) return { ok: false, error: "That coupon code is not valid." };

  if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
    return { ok: false, error: "That coupon has expired." };
  }
  if (coupon.minOrderPaise && subtotal < coupon.minOrderPaise) {
    return { ok: false, error: "Your order does not meet this coupon's minimum value." };
  }

  const raw = coupon.type === "percent"
    ? Math.round((subtotal * coupon.value) / 100)
    : coupon.value;
  const discount = Math.max(0, Math.min(raw, subtotal));
  if (discount <= 0) return { ok: false, error: "That coupon cannot be applied to this order." };

  return { ok: true, coupon, discount };
}
