/**
 * Delivery estimates.
 *
 * There is no courier API wired up, so the only honest estimate we can offer is
 * one the business has explicitly configured. If DELIVERY_ESTIMATE_DAYS is not
 * set, every surface says so rather than inventing a date.
 *
 * Set it in .env.local as a range of business days, e.g.
 *     DELIVERY_ESTIMATE_DAYS=5-7
 *
 * SERVER ONLY: the variable is read without a NEXT_PUBLIC prefix, so the
 * estimate is computed in API routes and sent to the browser as a value.
 */
export type DeliveryEstimate = {
  /** ISO dates, start and end of the window. */
  from: string;
  to: string;
  minDays: number;
  maxDays: number;
  /** The event the window is counted from. */
  basis: "dispatch" | "order";
};

function configuredRange(): { min: number; max: number } | null {
  const raw = (process.env.DELIVERY_ESTIMATE_DAYS ?? "").trim();
  if (!raw) return null;
  const match = /^(\d{1,2})\s*(?:-\s*(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > 60) return null;
  return { min, max };
}

export const isDeliveryEstimateConfigured = () => configuredRange() !== null;

/** Adds business days, skipping Saturdays and Sundays. Holidays are not modelled. */
function addBusinessDays(start: Date, days: number): Date {
  const date = new Date(start.getTime());
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

/**
 * Counts from dispatch when the parcel has shipped, otherwise from the order
 * date. Returns null when nothing is configured, when payment has not been
 * confirmed, or when the order is already finished — a delivered or cancelled
 * order has no estimate to give.
 */
export function deliveryEstimate(input: {
  createdAt: string;
  paid: boolean;
  fulfilment: string;
  shippedAt?: string | null;
}): DeliveryEstimate | null {
  const range = configuredRange();
  if (!range) return null;
  if (!input.paid) return null;
  if (input.fulfilment === "delivered" || input.fulfilment === "cancelled") return null;

  const shipped = input.fulfilment === "shipped" && input.shippedAt ? new Date(input.shippedAt) : null;
  const basisDate = shipped && !Number.isNaN(shipped.getTime()) ? shipped : new Date(input.createdAt);
  if (Number.isNaN(basisDate.getTime())) return null;

  return {
    from: addBusinessDays(basisDate, range.min).toISOString(),
    to: addBusinessDays(basisDate, range.max).toISOString(),
    minDays: range.min,
    maxDays: range.max,
    basis: shipped ? "dispatch" : "order",
  };
}

/** "12 Oct – 15 Oct" in IST, with no time component. */
export function formatEstimateWindow(estimate: DeliveryEstimate): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
  const from = fmt(estimate.from);
  const to = fmt(estimate.to);
  return from === to ? from : `${from} – ${to}`;
}
