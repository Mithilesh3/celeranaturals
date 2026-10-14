/**
 * Customer records for the admin panel.
 *
 * Client-safe types only; the Firebase Auth listing and order aggregation live
 * in ./customers-server.
 *
 * Identity comes from the Firebase Auth user record, which is the only place
 * this site has ever stored a customer's name, phone or email. Nothing here is
 * derived from guesswork: a field that Firebase does not hold is reported as
 * null and rendered as "Not provided", never filled in.
 *
 * Deliberately NOT modelled: passwords, password hashes, ID tokens, refresh
 * tokens, provider credentials. The Admin SDK can expose some of that and none
 * of it is ever read, returned or logged.
 */

export type CustomerSummary = {
  uid: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** ISO. From the Auth record's creationTime. */
  createdAt: string | null;
  /**
   * ISO. From the Auth record's lastSignInTime, which Firebase itself writes
   * on every successful authentication. Null for an account that has been
   * created but has never signed in — shown as "Not available", never guessed.
   */
  lastSignInAt: string | null;
  /**
   * Successful sign-ins counted into our own profile record. Null for accounts
   * that have not signed in since sign-in recording was added, so an older
   * customer is never misreported as having zero logins.
   */
  signInCount: number | null;
  /** ISO. First sign-in we recorded; null for the same reason as above. */
  firstSignInAt: string | null;
  /** Most recent sign-in method Firebase reported, e.g. "phone", "password". */
  lastSignInProvider: string | null;
  disabled: boolean;
  /** Orders placed by this account, any payment status. */
  orderCount: number;
  /** Paise. Verified paid orders only — never the client's claimed amount. */
  totalSpent: number;
  paidOrderCount: number;
  lastOrderAt: string | null;
};

export type CustomerDetail = CustomerSummary & {
  providers: string[];
  addresses: Array<Record<string, unknown>>;
  orders: Array<{
    orderId: string;
    createdAt: string;
    total: number;
    status: string;
    fulfilment: string;
  }>;
  profileHistory: ProfileEvent[];
};

/** One entry per admin correction of a customer profile field. Append-only. */
export type ProfileEvent = {
  at: string;
  byUid: string;
  byEmail: string | null;
  field: string;
  from: string | null;
  to: string | null;
  reason: string;
};

/**
 * Orders whose owner no longer has a Firebase Auth account — for example an
 * account deleted after ordering. They are listed separately and are never
 * attached to a different customer, because ownership cannot be re-verified.
 */
export type OrphanOrderGroup = {
  userId: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
};

export const PROFILE_NAME_MAX = 80;

/**
 * A mobile number the customer typed into their profile.
 *
 * CRITICAL: this is NOT a verified number. Only `phone` — which comes from the
 * Firebase Auth record and can only be set by completing an OTP challenge — is
 * verified. The two are kept in separate fields precisely so a typed number can
 * never be mistaken for a verified one, and nothing authenticates or authorises
 * anything based on this value.
 */
export function validateContactPhone(value: unknown): string | null {
  if (typeof value !== "string") return "Mobile number must be text.";
  const digits = value.replace(/\D/g, "").slice(-10);
  if (!digits) return "Enter a mobile number.";
  if (!/^[6-9]\d{9}$/.test(digits)) return "Enter a valid 10-digit Indian mobile number.";
  return null;
}

export const cleanContactPhone = (value: string) => value.replace(/\D/g, "").slice(-10);

export function validateDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return "Name must be text.";
  const name = value.trim();
  if (!name) return "Name cannot be empty.";
  if (name.length > PROFILE_NAME_MAX) return `Name must be ${PROFILE_NAME_MAX} characters or fewer.`;
  // Digits and symbols are allowed (initials, hyphens), but a name made only of
  // digits is almost certainly a mistyped phone number.
  if (/^\d+$/.test(name)) return "Enter a name, not a number.";
  return null;
}

export const cleanDisplayName = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, PROFILE_NAME_MAX);

/** "+919811351137" -> "+91 98113 51137"; unknown shapes pass through. */
export function formatCustomerPhone(value: string | null | undefined): string {
  if (!value) return "Not provided";
  const digits = value.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : value;
}
