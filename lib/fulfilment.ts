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
 * The three delivery stages shown to both admins and customers.
 *
 * The underlying FulfilmentStatus union is unchanged, so orders written before
 * this existed — which may hold processing, packed or shipped — keep working.
 * Those older values simply map onto stage 2.
 *
 * `cancelled` is deliberately not a stage: it ends the journey rather than
 * advancing along it, and is rendered as a separate terminal state.
 */
export const DELIVERY_STAGES = [
  { key: "confirmed", label: "Order Confirmed", hint: "We have confirmed your order." },
  { key: "preparing", label: "Preparing & Shipping", hint: "Your order is being prepared and sent out." },
  { key: "delivered", label: "Delivered", hint: "Delivered." },
] as const;

export type DeliveryStageKey = (typeof DELIVERY_STAGES)[number]["key"];

/**
 * The status actually stored when an admin picks a stage. Stage 2 canonicalises
 * to "processing" rather than "shipped" so the three-stage flow never demands
 * courier details; tracking stays optional and is entered separately.
 */
const STAGE_CANONICAL: Record<DeliveryStageKey, FulfilmentStatus> = {
  confirmed: "confirmed",
  preparing: "processing",
  delivered: "delivered",
};

export const canonicalForStage = (stage: DeliveryStageKey): FulfilmentStatus => STAGE_CANONICAL[stage];

export const isDeliveryStageKey = (value: unknown): value is DeliveryStageKey =>
  DELIVERY_STAGES.some((stage) => stage.key === value);

/**
 * How far along an order is, as a stage index:
 *   0 = awaiting confirmation (legacy "pending"; stage 1 not yet complete)
 *   1 = Order Confirmed
 *   2 = Preparing & Shipping  (processing | packed | shipped)
 *   3 = Delivered
 *  -1 = cancelled, which sits outside the normal progression
 */
export function stageIndexOf(status: FulfilmentStatus): number {
  switch (status) {
    case "cancelled": return -1;
    case "pending": return 0;
    case "confirmed": return 1;
    case "processing":
    case "packed":
    case "shipped": return 2;
    case "delivered": return 3;
    default: return 0;
  }
}

/** The stage key an order currently sits on, or null when not yet started/cancelled. */
export function currentStageKey(status: FulfilmentStatus): DeliveryStageKey | null {
  const index = stageIndexOf(status);
  return index >= 1 && index <= 3 ? DELIVERY_STAGES[index - 1].key : null;
}

/**
 * The three-stage wording for any stored status — the single label used by
 * every badge, so a legacy "packed" order never shows six-stage vocabulary.
 */
export function deliveryStageLabel(status: FulfilmentStatus): string {
  if (status === "cancelled") return "Cancelled";
  const key = currentStageKey(status);
  return key ? DELIVERY_STAGES.find((entry) => entry.key === key)!.label : "Awaiting confirmation";
}

export const stageTargetIndex = (stage: DeliveryStageKey) =>
  DELIVERY_STAGES.findIndex((entry) => entry.key === stage) + 1;

/**
 * Whether moving to `stage` is a normal forward step. Backward moves are not
 * forbidden outright — they are corrections, and the route requires an explicit
 * flag plus a reason so they land in the audit trail.
 */
export function isForwardStage(from: FulfilmentStatus, stage: DeliveryStageKey): boolean {
  return stageTargetIndex(stage) > stageIndexOf(from);
}

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
