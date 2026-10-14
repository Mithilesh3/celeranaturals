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
 * Only deliveryEstimate() and isDeliveryEstimateConfigured() read that
 * variable, and only ever on the server — it has no NEXT_PUBLIC prefix, so in
 * a browser bundle it would simply be undefined.
 *
 * Everything else here (the per-order estimate type, the day presets, the date
 * helpers and resolveEstimateInput) is pure and client-safe, so the admin
 * drawer and the server route validate against exactly the same rules.
 */
/**
 * Per-order estimate set by an operator in the admin panel.
 *
 * This is purely a delivery-time promise. It carries no payment or fulfilment
 * meaning, and the endpoint that writes it accepts nothing else, so setting it
 * cannot alter payment status, delivery status, the address or the total.
 *
 * `date` is a calendar date, stored as YYYY-MM-DD rather than a timestamp:
 * "arriving on the 18th" must not shift to the 17th or 19th when read in a
 * different timezone.
 */
export type OrderDeliveryEstimate = {
  date: string;
  /** The preset used, when one was, purely so the admin UI can show it again. */
  days: number | null;
  setAt: string;
  setByEmail: string | null;
};

/** Presets offered in the admin drawer. An exact date is also allowed. */
export const ESTIMATE_DAY_OPTIONS = [2, 3, 5, 7, 10] as const;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date in IST for a timestamp, as YYYY-MM-DD. */
export function istDateKey(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const ist = new Date(date.getTime() + (5 * 60 + 30) * 60_000);
  return ist.toISOString().slice(0, 10);
}

/** Adds whole calendar days to a YYYY-MM-DD key, staying in date space. */
export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Validates an admin estimate request. Either `days` (a preset) or an explicit
 * `date` must be supplied; the result is always a concrete calendar date so the
 * stored value never depends on when it is read.
 */
export function resolveEstimateInput(
  input: { days?: unknown; date?: unknown },
  orderCreatedAt: string,
): { ok: true; date: string; days: number | null } | { ok: false; error: string } {
  const hasDays = input.days !== undefined && input.days !== null && input.days !== "";
  const hasDate = typeof input.date === "string" && input.date.trim() !== "";

  if (hasDays && hasDate) return { ok: false, error: "Choose either a number of days or a specific date, not both." };
  if (!hasDays && !hasDate) return { ok: false, error: "Choose a delivery estimate." };

  if (hasDays) {
    const days = Number(input.days);
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      return { ok: false, error: "Delivery estimate must be between 1 and 90 days." };
    }
    const from = istDateKey(orderCreatedAt) || istDateKey();
    return { ok: true, date: addDays(from, days), days };
  }

  const date = (input.date as string).trim();
  if (!ISO_DATE.test(date)) return { ok: false, error: "Enter the date as YYYY-MM-DD." };
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || date !== parsed.toISOString().slice(0, 10)) {
    return { ok: false, error: "That date does not exist." };
  }
  // A delivery date before the order was placed is a typo, not a promise.
  const orderDay = istDateKey(orderCreatedAt);
  if (orderDay && date < orderDay) return { ok: false, error: "The estimate cannot be before the order date." };
  if (date > addDays(istDateKey(), 365)) return { ok: false, error: "The estimate is too far in the future." };
  return { ok: true, date, days: null };
}

/** "18 Oct 2026" from a YYYY-MM-DD key, with no timezone shifting. */
export function formatEstimateDate(dateKey: string): string {
  if (!ISO_DATE.test(dateKey)) return dateKey;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(new Date(`${dateKey}T00:00:00Z`));
  } catch {
    return dateKey;
  }
}

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
