import type { Amounts, Paise } from "./money";
import { currentFulfilment, type FulfilmentEvent, type FulfilmentStatus, type Tracking } from "./fulfilment";
import type { OrderDeliveryEstimate } from "./delivery-estimate";

export type OrderStatus = "created" | "pending" | "paid" | "failed" | "cancelled";

/** COD is modelled from day one; it is deliberately not offered in the UI yet. */
export type PaymentMethod = "razorpay" | "cod";

/**
 * Name and price are snapshotted at order time. An order must never be
 * rendered from live catalogue data, because prices change.
 */
export type OrderItem = {
  id: string;
  name: string;
  /** Snapshotted at order time; null for products that had no SKU. */
  sku?: string | null;
  qty: number;
  unitPrice: Paise;
  lineTotal: Paise;
};

/**
 * Delivery address snapshot.
 *
 * `line2` predates `locality` and `landmark`. Orders written before those
 * existed carry an empty `line2` and no `locality`/`landmark` at all, so every
 * consumer must treat the newer fields as possibly undefined. Nothing is
 * backfilled: an old order's delivery destination is history, not a record to
 * rewrite.
 */
export type OrderAddress = {
  fullName: string;
  phone: string;
  /** House / flat number, building and street. */
  line1: string;
  /** Legacy free-form second line. Retained for existing orders. */
  line2: string;
  /** Locality / area / sector. Absent on orders placed before this field existed. */
  locality?: string;
  city: string;
  state: string;
  pincode: string;
  /** Optional landmark. */
  landmark?: string;
};

const trimTo = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

/**
 * Coerces untrusted input into exactly the known address keys.
 *
 * The request body is never spread into Firestore directly: without this, a
 * caller could attach arbitrary fields to the stored address snapshot.
 */
export function normalizeAddress(input: unknown): OrderAddress {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    fullName: trimTo(raw.fullName, 80),
    phone: trimTo(raw.phone, 20).replace(/\D/g, "").slice(-10),
    line1: trimTo(raw.line1, 160),
    line2: trimTo(raw.line2, 160),
    locality: trimTo(raw.locality, 120),
    city: trimTo(raw.city, 80),
    state: trimTo(raw.state, 80),
    pincode: trimTo(raw.pincode, 10).replace(/\D/g, "").slice(0, 6),
    landmark: trimTo(raw.landmark, 120),
  };
}

/** Legacy orders may be missing most of this; callers show an honest fallback. */
export function hasAddressDetails(address: Partial<OrderAddress> | null | undefined): boolean {
  return Boolean(address && (address.line1?.trim() || address.city?.trim() || address.pincode?.trim()));
}

/** Display lines, skipping whatever a given record does not have. */
export function addressLines(address: Partial<OrderAddress>): string[] {
  const region = [address.city, address.state].filter((part) => part?.trim()).join(", ");
  const regionLine = [region, address.pincode?.trim()].filter(Boolean).join(" ");
  return [
    address.line1,
    address.line2,
    address.locality,
    address.landmark?.trim() ? `Landmark: ${address.landmark.trim()}` : "",
    regionLine,
  ].map((part) => (part ?? "").trim()).filter(Boolean);
}

/** One entry per delivery-address correction. Never overwritten, only appended. */
export type AddressEvent = {
  at: string;
  byUid: string;
  byEmail: string | null;
  byPhone: string | null;
  from: OrderAddress | null;
  to: OrderAddress;
  reason: string;
};

/** Snapshot of the coupon as applied, so a later registry change cannot alter history. */
export type AppliedCoupon = {
  code: string;
  label: string;
  discount: Paise;
};

export type Order = {
  orderId: string;
  userId: string;
  items: OrderItem[];
  amounts: Amounts;
  coupon: AppliedCoupon | null;
  address: OrderAddress;
  phone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * What a document can additionally carry once fulfilment has been worked on.
 * All optional: orders placed before fulfilment tracking existed have none of
 * it, and `currentFulfilment` treats an absent value as "pending".
 */
export type StoredOrder = Order & {
  fulfilment?: FulfilmentStatus;
  fulfilmentHistory?: FulfilmentEvent[];
  tracking?: Tracking;
  addressHistory?: AddressEvent[];
  /** Per-order delivery promise set by an operator. Carries no payment meaning. */
  estimatedDelivery?: OrderDeliveryEstimate;
};

/**
 * The shape sent to the order's owner.
 *
 * Built by allowlist rather than by deleting fields, so a future addition to
 * the document cannot leak by default. In particular the operator identities in
 * `fulfilmentHistory` and the whole `addressHistory` audit trail are internal:
 * customers see what happened and when, not which staff account did it.
 */
export type CustomerOrder = Order & {
  fulfilment: FulfilmentStatus;
  timeline: Array<{ status: FulfilmentStatus; at: string; note?: string }>;
  tracking: Tracking | null;
  addressEdited: boolean;
  /** Date only (YYYY-MM-DD), or null when an operator has not set one yet. */
  estimatedDeliveryDate: string | null;
};

export function toCustomerOrder(stored: StoredOrder): CustomerOrder {
  return {
    orderId: stored.orderId,
    userId: stored.userId,
    items: stored.items,
    amounts: stored.amounts,
    coupon: stored.coupon ?? null,
    address: stored.address,
    phone: stored.phone,
    status: stored.status,
    paymentMethod: stored.paymentMethod,
    razorpayOrderId: stored.razorpayOrderId,
    razorpayPaymentId: stored.razorpayPaymentId,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    fulfilment: currentFulfilment(stored.fulfilment),
    timeline: (stored.fulfilmentHistory ?? []).map((event) => ({
      status: event.status,
      at: event.at,
      ...(event.note ? { note: event.note } : {}),
    })),
    tracking: stored.tracking ?? null,
    addressEdited: Boolean(stored.addressHistory?.length),
    // Only the date reaches the customer; who set it and when stay internal.
    estimatedDeliveryDate: stored.estimatedDelivery?.date ?? null,
  };
}

export const ORDERS_COLLECTION = "orders";

export const PINCODE = /^\d{6}$/;
export const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function validateAddress(address: Partial<OrderAddress>): string[] {
  const problems: string[] = [];
  if (!address.fullName?.trim()) problems.push("Full name is required.");
  if (!INDIAN_MOBILE.test((address.phone ?? "").replace(/\D/g, "").slice(-10))) {
    problems.push("Enter a valid 10-digit Indian mobile number.");
  }
  if (!address.line1?.trim()) problems.push("House / flat and street is required.");
  if (!address.locality?.trim()) problems.push("Locality or area is required.");
  if (!address.city?.trim()) problems.push("City is required.");
  if (!address.state?.trim()) problems.push("State is required.");
  if (!PINCODE.test(address.pincode ?? "")) problems.push("PIN code must be exactly 6 digits.");
  return problems;
}

/** Human-readable IST, never a raw GMT string. */
export function formatIST(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  created: "Awaiting payment",
  pending: "Payment processing",
  paid: "Paid",
  failed: "Payment failed",
  cancelled: "Cancelled",
};
