import type { Amounts, Paise } from "./money";

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
  qty: number;
  unitPrice: Paise;
  lineTotal: Paise;
};

export type OrderAddress = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

export type Order = {
  orderId: string;
  userId: string;
  items: OrderItem[];
  amounts: Amounts;
  address: OrderAddress;
  phone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const ORDERS_COLLECTION = "orders";

export const PINCODE = /^\d{6}$/;
export const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function validateAddress(address: Partial<OrderAddress>): string[] {
  const problems: string[] = [];
  if (!address.fullName?.trim()) problems.push("Full name is required.");
  if (!address.line1?.trim()) problems.push("Address line 1 is required.");
  if (!address.city?.trim()) problems.push("City is required.");
  if (!address.state?.trim()) problems.push("State is required.");
  if (!PINCODE.test(address.pincode ?? "")) problems.push("Pincode must be exactly 6 digits.");
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
