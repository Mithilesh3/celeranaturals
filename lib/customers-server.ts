import type { UserRecord } from "firebase-admin/auth";
import { adminAuth, adminDb } from "./firebase-admin";
import { currentFulfilment } from "./fulfilment";
import { ORDERS_COLLECTION, type StoredOrder } from "./orders";
import { ADDRESSES_SUBCOLLECTION, USERS_COLLECTION } from "./saved-addresses";
import { getCustomerProfile, getCustomerProfiles, type CustomerProfileRecord } from "./customer-profile";
import type { CustomerSummary, OrphanOrderGroup, ProfileEvent } from "./customers";

/**
 * Customer directory. SERVER ONLY.
 *
 * Registered accounts come from Firebase Authentication — the actual account
 * store. Anonymous visitors are not customers and are not counted here; there
 * is no analytics integration, so visitor numbers are simply not reported.
 *
 * Spending is aggregated from orders whose stored status is "paid", which is
 * only ever set by verified Razorpay signature checking. A client-claimed
 * amount cannot influence these totals.
 */

/** Bounded so one request cannot pull an unbounded account list into memory. */
export const MAX_ACCOUNTS = 1000;
export const MAX_ORDERS_SCANNED = 2000;

export type OrderAggregate = {
  orderCount: number;
  paidOrderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
};

const emptyAggregate = (): OrderAggregate => ({ orderCount: 0, paidOrderCount: 0, totalSpent: 0, lastOrderAt: null });

/** Groups every order by its userId. The uid on an order is server-set at creation. */
export async function aggregateOrdersByUser(): Promise<{ map: Map<string, OrderAggregate>; capped: boolean }> {
  const snapshot = await adminDb()
    .collection(ORDERS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(MAX_ORDERS_SCANNED)
    .get();

  const map = new Map<string, OrderAggregate>();
  for (const doc of snapshot.docs) {
    const order = doc.data() as StoredOrder;
    if (!order.userId) continue;
    const entry = map.get(order.userId) ?? emptyAggregate();
    entry.orderCount += 1;
    // Only verified-paid orders contribute to money figures.
    if (order.status === "paid") {
      entry.paidOrderCount += 1;
      entry.totalSpent += order.amounts?.total ?? 0;
    }
    if (!entry.lastOrderAt || order.createdAt > entry.lastOrderAt) entry.lastOrderAt = order.createdAt;
    map.set(order.userId, entry);
  }
  return { map, capped: snapshot.size >= MAX_ORDERS_SCANNED };
}

/**
 * Maps an Auth record to the minimum a staff member needs. Password hashes,
 * salts, tokens and provider secrets on the record are deliberately not read.
 */
function toSummary(
  record: UserRecord,
  aggregate: OrderAggregate,
  profile?: CustomerProfileRecord,
): CustomerSummary {
  const toIso = (value: string | undefined) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  return {
    uid: record.uid,
    name: record.displayName?.trim() || null,
    phone: record.phoneNumber ?? null,
    email: record.email ?? null,
    createdAt: toIso(record.metadata?.creationTime),
    // Firebase writes this itself on every successful authentication, and
    // leaves it empty for an account that has never signed in. Our own
    // recorded value is only a fallback, never an override.
    lastSignInAt: toIso(record.metadata?.lastSignInTime) ?? profile?.lastAuthAt ?? null,
    // Null, not 0, when we have no record: the account may well have signed in
    // before sign-in counting existed.
    signInCount: profile?.signInCount ?? null,
    firstSignInAt: profile?.firstSignInAt ?? null,
    lastSignInProvider: profile?.lastSignInProvider
      ?? record.providerData[0]?.providerId
      ?? null,
    disabled: record.disabled === true,
    orderCount: aggregate.orderCount,
    paidOrderCount: aggregate.paidOrderCount,
    totalSpent: aggregate.totalSpent,
    lastOrderAt: aggregate.lastOrderAt,
  };
}

/** Lowercased admin allowlist, so staff accounts can be separated from customers. */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  );
}

export async function listCustomers(): Promise<{
  customers: CustomerSummary[];
  orphanOrders: OrphanOrderGroup[];
  capped: boolean;
  ordersCapped: boolean;
}> {
  const { map: aggregates, capped: ordersCapped } = await aggregateOrdersByUser();

  const auth = adminAuth();
  const records: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(Math.min(1000, MAX_ACCOUNTS - records.length), pageToken);
    records.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken && records.length < MAX_ACCOUNTS);

  // One bulk read of the stored sign-in records for the accounts on this page.
  const profiles = await getCustomerProfiles(records.map((record) => record.uid));

  const staff = adminEmails();
  const seen = new Set<string>();
  const customers: CustomerSummary[] = [];
  for (const record of records) {
    seen.add(record.uid);
    // Staff logins are not customers and are left out of the directory.
    if (record.email && staff.has(record.email.toLowerCase())) continue;
    customers.push(toSummary(record, aggregates.get(record.uid) ?? emptyAggregate(), profiles.get(record.uid)));
  }

  // Orders whose owning account no longer exists. Never merged into a live
  // customer: ownership cannot be re-verified, so they stay separate.
  const orphanOrders: OrphanOrderGroup[] = [];
  for (const [userId, aggregate] of aggregates) {
    if (seen.has(userId)) continue;
    orphanOrders.push({
      userId,
      orderCount: aggregate.orderCount,
      totalSpent: aggregate.totalSpent,
      lastOrderAt: aggregate.lastOrderAt,
    });
  }

  customers.sort((a, b) => (b.lastOrderAt ?? b.createdAt ?? "").localeCompare(a.lastOrderAt ?? a.createdAt ?? ""));
  return { customers, orphanOrders, capped: records.length >= MAX_ACCOUNTS, ordersCapped };
}

export async function countCustomers(): Promise<number> {
  const auth = adminAuth();
  const staff = adminEmails();
  let count = 0;
  let pageToken: string | undefined;
  let scanned = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const record of page.users) {
      if (record.email && staff.has(record.email.toLowerCase())) continue;
      count += 1;
    }
    scanned += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken && scanned < MAX_ACCOUNTS);
  return count;
}

export async function getCustomer(uid: string) {
  const auth = adminAuth();
  let record: UserRecord;
  try {
    record = await auth.getUser(uid);
  } catch {
    return null;
  }

  const db = adminDb();
  const [orderSnapshot, addressSnapshot, profileSnapshot, signInProfile] = await Promise.all([
    db.collection(ORDERS_COLLECTION).where("userId", "==", uid).limit(100).get(),
    db.collection(USERS_COLLECTION).doc(uid).collection(ADDRESSES_SUBCOLLECTION).limit(20).get(),
    db.collection(USERS_COLLECTION).doc(uid).get(),
    getCustomerProfile(uid),
  ]);

  const aggregate = emptyAggregate();
  const orders = orderSnapshot.docs
    .map((doc) => doc.data() as StoredOrder)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((order) => {
      aggregate.orderCount += 1;
      if (order.status === "paid") {
        aggregate.paidOrderCount += 1;
        aggregate.totalSpent += order.amounts?.total ?? 0;
      }
      if (!aggregate.lastOrderAt || order.createdAt > aggregate.lastOrderAt) aggregate.lastOrderAt = order.createdAt;
      return {
        orderId: order.orderId,
        createdAt: order.createdAt,
        total: order.amounts?.total ?? 0,
        status: order.status,
        fulfilment: currentFulfilment(order.fulfilment),
      };
    });

  const profile = profileSnapshot.exists ? profileSnapshot.data() : undefined;

  return {
    ...toSummary(record, aggregate, signInProfile ?? undefined),
    // Which sign-in methods the account uses; no provider credentials.
    providers: record.providerData.map((provider) => provider.providerId),
    addresses: addressSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    orders,
    profileHistory: (profile?.profileHistory as ProfileEvent[] | undefined) ?? [],
  };
}
