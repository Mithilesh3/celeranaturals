/**
 * Fulfilment status model. Deliberately free of server-only imports so the
 * admin UI can use the labels and transition rules without pulling
 * firebase-admin (and its gRPC/fs dependencies) into the browser bundle.
 *
 * Fulfilment is separate from payment: an order can be paid but unpacked, or
 * packed while payment is still outstanding.
 */
export const FULFILMENT_STATUSES = [
  "pending", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled",
] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

export const FULFILMENT_LABEL: Record<FulfilmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Forward-only, with cancellation allowed until the parcel ships. */
const TRANSITIONS: Record<FulfilmentStatus, FulfilmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Orders written before this feature existed have no field; treat as pending. */
export const currentFulfilment = (value: unknown): FulfilmentStatus =>
  FULFILMENT_STATUSES.includes(value as FulfilmentStatus) ? (value as FulfilmentStatus) : "pending";

export function canTransition(from: FulfilmentStatus, to: FulfilmentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const nextStatuses = (from: FulfilmentStatus): FulfilmentStatus[] => TRANSITIONS[from] ?? [];

export type FulfilmentEvent = {
  status: FulfilmentStatus;
  at: string;
  byUid: string;
  /** Admins sign in with email; phone is kept for events written earlier. */
  byEmail: string | null;
  byPhone: string | null;
  note?: string;
};

/** Best available identifier for an audit entry, whichever was recorded. */
export const eventActor = (event: Pick<FulfilmentEvent, "byEmail" | "byPhone" | "byUid">) =>
  event.byEmail || event.byPhone || event.byUid;

/**
 * The step order shown to customers. `cancelled` is deliberately not a step:
 * it ends the journey rather than advancing along it, so the UI renders it as
 * a separate terminal state instead of a sixth dot.
 */
export const DELIVERY_STEPS: FulfilmentStatus[] = [
  "pending", "confirmed", "processing", "packed", "shipped", "delivered",
];

export const stepIndex = (status: FulfilmentStatus) => DELIVERY_STEPS.indexOf(status);

export type Tracking = {
  courier: string;
  number: string;
  at: string;
  /** Only ever a vetted courier URL; see trustedTrackingUrl. */
  url?: string | null;
};

/**
 * Courier domains whose tracking pages we are willing to send a customer to.
 * An operator can paste any URL; only one matching this list is ever rendered
 * as a link, so a mistyped or hostile address cannot become an outbound link
 * from an order page.
 */
export const TRUSTED_TRACKING_HOSTS = [
  "bluedart.com", "delhivery.com", "dtdc.com", "ecomexpress.in", "xpressbees.com",
  "shiprocket.in", "shiprocket.co", "indiapost.gov.in", "fedex.com", "dhl.com",
  "bluedart.co.in", "gati.com", "trackon.in", "safexpress.com", "amazon.in",
];

/**
 * Returns the URL only if it is https and served by a trusted courier host.
 * Returns null for anything else — including http, userinfo tricks such as
 * `https://delhivery.com@evil.example`, and lookalike hosts like
 * `delhivery.com.evil.example`.
 */
export function trustedTrackingUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { return null; }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  const trusted = TRUSTED_TRACKING_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  return trusted ? parsed.toString() : null;
}

export function validateTracking(courier: unknown, numberValue: unknown): string | null {
  if (typeof courier !== "string" || !courier.trim()) return "Courier name is required.";
  if (courier.trim().length > 60) return "Courier name is too long.";
  if (typeof numberValue !== "string" || !numberValue.trim()) return "Tracking number is required.";
  if (!/^[A-Za-z0-9-]{4,40}$/.test(numberValue.trim())) {
    return "Tracking number must be 4-40 letters, digits or hyphens.";
  }
  return null;
}
