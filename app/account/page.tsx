"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/auth-context";
import { useStore } from "../components/store-context";
import { getFirebaseAuth } from "../components/firebase";
import { STATUS_LABEL, formatIST, type CustomerOrder } from "../../lib/orders";
import { FULFILMENT_LABEL } from "../../lib/fulfilment";
import { formatINR } from "../../lib/money";
import { SavedAddresses } from "../components/saved-addresses";
import { ProfileCard } from "../components/profile-card";
import { useCatalog } from "../components/catalog-context";

/** Lucide "log-out", matching the inline SVG convention used elsewhere. */
const LogOutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
  </svg>
);

/** "+919811351137" -> "+91 98113 51137" */
function formatPhone(value: string | null | undefined) {
  if (!value) return "Not available";
  const digits = value.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : value;
}

type TabId = "overview" | "orders" | "profile" | "wishlist";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "My Orders" },
  { id: "profile", label: "Profile" },
  { id: "wishlist", label: "Wishlist" },
];

// The header account menu links to /account#acc-*, so those anchors must
// continue to select the right tab rather than silently doing nothing.
const HASH_TO_TAB: Record<string, TabId> = {
  "#acc-profile": "profile",
  "#acc-orders": "orders",
  "#acc-wishlist": "wishlist",
  "#acc-addresses": "overview",
};

/** One fetch shared by the Overview and Orders tabs. */
function useOrders(enabled: boolean) {
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        const response = await fetch("/api/orders", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) { setFailed(true); setOrders([]); return; }
        const data = await response.json();
        setOrders(data.orders as CustomerOrder[]);
      } catch {
        if (!cancelled) { setFailed(true); setOrders([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return { orders, failed };
}

function OrderRows({ orders }: { orders: CustomerOrder[] }) {
  return (
    <ul className="order-list">
      {orders.map((order) => (
        <li key={order.orderId}>
          <Link href={`/order/${order.orderId}`}>
            <span className="order-list__top">
              <span className="order-list__id">{order.orderId}</span>
              {/* Payment and delivery are separate facts and are badged separately. */}
              <span className="order-list__badges">
                <span className={`status-badge status-badge--${order.status}`}>{STATUS_LABEL[order.status]}</span>
                <span className={`track-pill track-pill--${order.fulfilment}`}>{FULFILMENT_LABEL[order.fulfilment]}</span>
              </span>
            </span>
            <span className="order-list__meta">
              {formatIST(order.createdAt)} · {order.items.reduce((sum, item) => sum + item.qty, 0)} item(s)
              {order.tracking?.number && <> · {order.tracking.courier}</>}
            </span>
            <span className="order-list__total">{formatINR(order.amounts.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NoOrders() {
  return (
    <div className="empty-state">
      <span className="empty-state__mark" aria-hidden="true">◦</span>
      <h3>No orders yet</h3>
      <p>When you place an order it will appear here with its status and receipt.</p>
      <Link className="store-button store-button-primary" href="/shop">Start shopping</Link>
    </div>
  );
}

export default function AccountPage() {
  const { user, initializing, configured, openAuth, signOut } = useAuth();
  const { wishlist, ready: storeReady } = useStore();
  const { byId } = useCatalog();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const { orders, failed } = useOrders(Boolean(user));

  useEffect(() => {
    if (!initializing && configured && !user) openAuth({ returnTo: "/account" });
  }, [initializing, configured, user, openAuth]);

  // Keep the tab in step with the hash, both on load and on later changes.
  const syncFromHash = useCallback(() => {
    const next = HASH_TO_TAB[window.location.hash];
    if (next) setTab(next);
  }, []);
  useEffect(() => {
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [syncFromHash]);

  const savedProducts = useMemo(
    () => wishlist.map((id) => byId.get(id)).filter((p) => p !== undefined),
    [wishlist, byId],
  );

  const displayName = user?.displayName?.trim() || formatPhone(user?.phoneNumber) || "there";
  const recentOrders = orders?.slice(0, 3) ?? [];

  const signOutAction = (
    <div className="account-signout">
      {confirmingSignOut ? (
        <>
          <span className="account-signout__prompt">Sign out of this device?</span>
          <div className="account-signout__row">
            <button
              className="account-signout__btn account-signout__btn--confirm"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await signOut();
                  // /account requires auth, so leave for home.
                  router.push("/");
                } finally { setBusy(false); }
              }}
            >{busy ? "Signing out…" : "Yes, sign out"}</button>
            <button className="account-signout__btn account-signout__btn--cancel" type="button" disabled={busy} onClick={() => setConfirmingSignOut(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button className="account-signout__btn" type="button" onClick={() => setConfirmingSignOut(true)}>
          <LogOutIcon />Sign Out from This Device
        </button>
      )}
    </div>
  );

  const profileCard = <ProfileCard enabled={Boolean(user)} />;

  const wishlistCard = (
    <section className="panel" aria-labelledby="acc-wishlist">
      <h2 id="acc-wishlist" className="panel__heading">Wishlist</h2>
      {!storeReady ? <p className="panel__hint">Loading…</p>
        : savedProducts.length === 0 ? (
          <>
            <p className="panel__hint">You haven&rsquo;t saved any products yet. Tap the heart on a product to keep it here.</p>
            <Link className="store-button store-button-secondary panel__action" href="/shop">Browse products</Link>
          </>
        ) : (
          <>
            <p className="account-stat"><strong>{savedProducts.length}</strong> saved {savedProducts.length === 1 ? "product" : "products"}</p>
            <p className="panel__hint">Saved products are kept on this device.</p>
            <Link className="store-button store-button-secondary panel__action" href="/wishlist">View wishlist</Link>
          </>
        )}
    </section>
  );

  const addressesCard = <SavedAddresses enabled={Boolean(user)} />;

  return (
    <main className="store-page site-redesign account-page">
      <div className="store-container">
        <nav className="store-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">My Account</span>
        </nav>

        <header className="page-head">
          <div>
            <h1>My Account</h1>
            <p className="store-lede">Manage your profile, orders and saved products.</p>
          </div>
        </header>

        {initializing ? (
          <section className="panel"><div className="empty-state"><p>Loading your account…</p></div></section>
        ) : !user ? (
          <section className="panel">
            <div className="empty-state">
              <span className="empty-state__mark" aria-hidden="true">◦</span>
              <h3>Sign in to view your account</h3>
              <p>Your cart and wishlist stay on this device either way.</p>
              <button className="store-button store-button-primary" type="button" onClick={() => openAuth({ returnTo: "/account" })}>
                Sign in
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="account-welcome">
              <span className="account-welcome__avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <p className="account-welcome__greeting">Welcome back</p>
                <p className="account-welcome__name">{displayName}</p>
              </div>
            </div>

            <div className="account-tabbar" role="tablist" aria-label="Account sections">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`acct-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`acct-panel-${id}`}
                  className={tab === id ? "is-active" : ""}
                  onClick={() => setTab(id)}
                >{label}</button>
              ))}
            </div>

            <div id={`acct-panel-${tab}`} role="tabpanel" aria-labelledby={`acct-tab-${tab}`} tabIndex={-1}>
              {tab === "overview" && (
                <>
                  <div className="account-grid">
                    <section className="panel account-grid__wide" aria-labelledby="acc-orders">
                      <div className="panel__headrow">
                        <h2 id="acc-orders" className="panel__heading">Recent orders</h2>
                        {Boolean(orders?.length) && (
                          <button type="button" className="panel__link" onClick={() => setTab("orders")}>View all orders</button>
                        )}
                      </div>
                      {orders === null ? <p className="panel__hint">Loading your orders…</p>
                        : failed ? <p className="panel__hint">Could not load your orders right now. Please try again shortly.</p>
                        : orders.length === 0 ? <NoOrders />
                        : <OrderRows orders={recentOrders} />}
                    </section>

                    {profileCard}
                    {wishlistCard}
                    {addressesCard}
                  </div>
                  {signOutAction}
                </>
              )}

              {tab === "orders" && (
                <>
                  <section className="panel" aria-labelledby="acc-orders-all">
                    <h2 id="acc-orders-all" className="panel__heading">Order history</h2>
                    {orders === null ? <p className="panel__hint">Loading your orders…</p>
                      : failed ? <p className="panel__hint">Could not load your orders right now. Please try again shortly.</p>
                      : orders.length === 0 ? <NoOrders />
                      : <OrderRows orders={orders} />}
                  </section>
                  {signOutAction}
                </>
              )}

              {tab === "profile" && (
                <>
                  <div className="account-grid account-grid--two">
                    {profileCard}
                    {addressesCard}
                  </div>
                  {signOutAction}
                </>
              )}

              {tab === "wishlist" && (
                <>
                  <div className="account-grid account-grid--one">{wishlistCard}</div>
                  {signOutAction}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
