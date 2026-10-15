"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import "../../styles/admin.css";
import { useAuth } from "../components/auth-context";
import { getFirebaseAuth } from "../components/firebase";
import { formatINR } from "../../lib/money";
import {
  STATUS_LABEL, addressLines, formatIST, hasAddressDetails, normalizeAddress, validateAddress,
  type Order, type OrderAddress, type StoredOrder,
} from "../../lib/orders";
import {
  DELIVERY_STAGES, FULFILMENT_LABEL, deliveryStageLabel, eventActor, stageIndexOf,
  type DeliveryStageKey, type FulfilmentStatus,
} from "../../lib/fulfilment";

import {
  ESTIMATE_DAY_OPTIONS, ISO_DATE, addDays, formatEstimateDate, istDateKey,
} from "../../lib/delivery-estimate";
import { AddressFields, EMPTY_ADDRESS } from "../components/address-form";
import { Products } from "./products-admin";
import { Customers } from "./customers-admin";

type View = "overview" | "orders" | "products" | "customers" | "subscribers";

type Stats = {
  totalOrders: number; ordersToday: number; paidOrders: number;
  awaitingPacking: number; awaitingShipment: number; subscribers: number; customers: number;
  fulfilmentSampleCapped: boolean;
};
type OrderRow = {
  orderId: string; createdAt: string; customer: string; phone: string;
  total: number; payment: Order["status"]; fulfilment: FulfilmentStatus;
};
type Subscriber = { email: string; status: string; source: string; createdAt: string | null };

/** Every admin request carries a freshly minted ID token. */
async function authFetch(path: string, init: RequestInit = {}, forceRefresh = false) {
  // forceRefresh on the first authorization check: a cached token can be up to
  // an hour old and may predate an email change, which would deny a valid admin.
  const token = await getFirebaseAuth().currentUser?.getIdToken(forceRefresh);
  return fetch(path, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

function formatPhone(value: string | null | undefined) {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : value;
}

const navIcon = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true, focusable: "false" as const,
};
const NAV_ICON: Record<View | "signout", React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  orders: <><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>,
  products: <><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><circle cx="17" cy="17" r="3.4" /><path d="m19.4 19.4 2 2" /></>,
  customers: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  subscribers: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  signout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
};

/** The exact storefront logo asset, square, never stretched. */
function AdminLogo({ size }: { size: number }) {
  return (
    <Image
      className="admin-logo"
      src="/assets/images/brand/logo.png"
      alt="Celera Naturals"
      width={300}
      height={300}
      sizes={`${size}px`}
      style={{ width: size, height: size }}
      priority
    />
  );
}

/** Firebase codes are mapped so we never leak whether an account exists. */
function describeAuthError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  switch (code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled for this Firebase project.";
    default:
      return "Could not sign in. Please try again.";
  }
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const emailValid = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim());

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!emailValid) { setError("Enter a valid email address."); return; }
    if (!password) { setError("Enter your password."); return; }
    setBusy(true); setError("");
    try {
      // Credentials go straight to Firebase; nothing is stored by this app.
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      setPassword("");
      // onAuthStateChanged in AuthProvider takes over; the server then decides
      // whether this account is actually an admin.
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login">
      <section className="admin-login__brandside" aria-hidden="true">
        <AdminLogo size={88} />
        <p className="admin-login__wordmark">CELERA NATURALS</p>
        <p className="admin-login__tagline">By Celera Healthcare</p>
        <p className="admin-login__blurb">Natural wellness, managed with care.</p>
      </section>

      <section className="admin-login__formside">
        <div className="admin-login__card">
          <div className="admin-login__mobilebrand">
            <AdminLogo size={56} />
            <p>CELERA NATURALS</p>
          </div>

          <h1>Welcome Back</h1>
          <p className="admin-login__sub">Sign in to manage your Celera Naturals store.</p>

          <form onSubmit={submit} noValidate>
            <label htmlFor="admin-email">Email address</label>
            <div className="admin-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
              </svg>
              <input
                id="admin-email" type="email" autoComplete="username" placeholder="you@example.com"
                value={email} disabled={busy} aria-invalid={Boolean(error) && !emailValid}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
              />
            </div>

            <label htmlFor="admin-password">Password</label>
            <div className="admin-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                id="admin-password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                placeholder="Your password" value={password} disabled={busy}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
              />
              <button
                type="button" className="admin-input__toggle" disabled={busy}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >{showPassword ? "Hide" : "Show"}</button>
            </div>

            <p className="admin-login__error" role="alert" aria-live="assertive">{error}</p>

            <button className="admin-login__submit" type="submit" disabled={busy || !email.trim() || !password}>
              {busy ? <><span className="admin-spinner" aria-hidden="true" />Signing in…</> : "Sign In to Admin Panel"}
            </button>
          </form>

          <p className="admin-login__foot">Authorised staff only. Access is granted by email allowlist.</p>
        </div>
      </section>
    </main>
  );
}

export default function AdminPage() {
  // Admin signs in with email/password here, not the storefront phone modal.
  const { user, initializing, signOut } = useAuth();
  const [view, setView] = useState<View>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Bumped by the header refresh action; remounts the active list so it refetches.
  const [refreshKey, setRefreshKey] = useState(0);
  const [authorised, setAuthorised] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState("");
  const [denial, setDenial] = useState("");

  // Authorisation is decided by the server. The client only reflects the answer.
  const loadStats = useCallback(async () => {
    setStatsError("");
    try {
      const response = await authFetch("/api/admin/stats", {}, true);
      if (response.status === 403) {
        // Surface the server's reason so a misconfiguration is obvious.
        setDenial((await response.json().catch(() => ({}))).error ?? "");
        setAuthorised(false);
        return;
      }
      if (!response.ok) { setAuthorised(true); setStatsError((await response.json()).error ?? "Could not load dashboard."); return; }
      setAuthorised(true);
      setStats(await response.json());
    } catch {
      setAuthorised(true);
      setStatsError("Network problem. Try again.");
    }
  }, []);

  useEffect(() => {
    if (initializing || !user) { setAuthorised(null); return; }
    void loadStats();
  }, [initializing, user, loadStats]);

  if (initializing || (user && authorised === null)) {
    return <main className="admin-gate"><span className="admin-spinner admin-spinner--dark" aria-hidden="true" /><p>Checking your access…</p></main>;
  }

  // Signed out: the email/password screen. The phone OTP modal is not used here.
  if (!user) return <AdminLogin />;

  if (authorised === false) {
    return (
      <main className="admin-gate">
        <AdminLogo size={64} />
        <h1>Not authorised</h1>
        <p>{denial || "This account does not have admin access."}</p>
        <p className="admin-gate__who">Signed in as <strong>{user.email ?? "unknown"}</strong></p>
        <div className="admin-gate__actions">
          <button className="store-button store-button-primary" type="button" onClick={async () => { await signOut(); }}>Sign out</button>
          <Link className="store-button store-button-secondary" href="/">Back to the store</Link>
        </div>
      </main>
    );
  }

  const NAV: Array<{ id: View; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders" },
    { id: "products", label: "Products" },
    { id: "customers", label: "Customers" },
    { id: "subscribers", label: "Newsletter Subscribers" },
  ];

  return (
    <div className={`admin${collapsed ? " is-collapsed" : ""}`}>
      <aside className={`admin-sidebar${navOpen ? " is-open" : ""}`}>
        <div className="admin-brand">
          <AdminLogo size={36} />
          <span><strong>CELERA NATURALS</strong><small>Admin Panel</small></span>
          <button className="admin-drawer-close" type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)}>×</button>
        </div>

        <nav id="admin-nav" aria-label="Admin sections">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "is-active" : ""}
              aria-current={view === item.id ? "page" : undefined}
              title={item.label}
              onClick={() => { setView(item.id); setNavOpen(false); }}
            >
              <svg {...navIcon}>{NAV_ICON[item.id]}</svg>
              <span className="admin-navlabel">{item.label}</span>
            </button>
          ))}
          <button type="button" className="admin-signout" title="Sign Out" onClick={async () => { await signOut(); }}>
            <svg {...navIcon}>{NAV_ICON.signout}</svg>
            <span className="admin-navlabel">Sign Out</span>
          </button>
        </nav>

        <button
          className="admin-collapse"
          type="button"
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((v) => !v)}
        >
          <svg {...navIcon}><path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} /></svg>
          <span className="admin-navlabel">Collapse</span>
        </button>
      </aside>

      {navOpen && <button className="admin-scrim" type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}

      <div className="admin-main">
        <header className="admin-header">
          <button className="admin-burger" type="button" aria-label="Open admin navigation" aria-expanded={navOpen} aria-controls="admin-nav" onClick={() => setNavOpen(true)}>
            <svg {...navIcon}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="admin-title">
            <nav className="admin-crumb" aria-label="Breadcrumb">
              <span>Admin</span><span aria-hidden="true">/</span><span aria-current="page">{NAV.find((n) => n.id === view)?.label}</span>
            </nav>
            <h1>{NAV.find((n) => n.id === view)?.label}</h1>
          </div>
          <button
            className="admin-refresh"
            type="button"
            disabled={refreshing}
            aria-label="Refresh dashboard data"
            onClick={async () => { setRefreshing(true); try { await loadStats(); setRefreshKey((k) => k + 1); } finally { setRefreshing(false); } }}
          >
            <svg {...navIcon} className={refreshing ? "is-spinning" : undefined}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v5h-5" /></svg>
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
          <p className="admin-identity" title={user.email ?? undefined}>{user.email ?? formatPhone(user.phoneNumber)}</p>
        </header>

        <div className="admin-content">
          {view === "overview" && <Overview stats={stats} error={statsError} onRetry={loadStats} />}
          {view === "orders" && <Orders key={`orders-${refreshKey}`} />}
          {view === "products" && <Products key={`products-${refreshKey}`} />}
          {view === "customers" && <Customers key={`customers-${refreshKey}`} />}
          {view === "subscribers" && <Subscribers key={`subscribers-${refreshKey}`} />}
        </div>
      </div>
    </div>
  );
}

function Overview({ stats, error, onRetry }: { stats: Stats | null; error: string; onRetry: () => void }) {
  if (error) {
    return <div className="admin-card admin-state"><p>{error}</p><button className="store-button store-button-secondary" type="button" onClick={onRetry}>Retry</button></div>;
  }
  if (!stats) return <div className="admin-card admin-state"><p>Loading figures…</p></div>;

  const cards = [
    { label: "Total orders", value: stats.totalOrders },
    { label: "Orders today", value: stats.ordersToday },
    { label: "Verified paid", value: stats.paidOrders },
    { label: "Awaiting packing", value: stats.awaitingPacking },
    { label: "Awaiting shipment", value: stats.awaitingShipment },
    { label: "Customers", value: stats.customers ?? 0 },
    { label: "Subscribers", value: stats.subscribers },
  ];

  return (
    <>
      <div className="admin-stats">
        {cards.map((card) => (
          <div className="admin-card admin-stat" key={card.label}>
            <p className="admin-stat__label">{card.label}</p>
            <p className="admin-stat__value">{card.value}</p>
          </div>
        ))}
      </div>
      {stats.fulfilmentSampleCapped && (
        <p className="admin-note">Packing and shipment counts are computed from the 500 most recent paid orders.</p>
      )}
      <Orders compact />
    </>
  );
}

function Orders({ compact = false }: { compact?: boolean }) {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null); setError("");
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (payment !== "all") params.set("payment", payment);
    if (search.trim()) params.set("q", search.trim());
    try {
      const response = await authFetch(`/api/admin/orders?${params}`);
      if (!response.ok) { setError((await response.json()).error ?? "Could not load orders."); setRows([]); return; }
      const data = await response.json();
      setRows(data.orders);
      setNextCursor(data.nextCursor);
    } catch { setError("Network problem."); setRows([]); }
  }, [cursor, payment, search]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2>{compact ? "Recent orders" : "Orders"}</h2>
        {!compact && (
          <div className="admin-filters">
            <label className="store-sr-only" htmlFor="admin-order-search">Search orders</label>
            <input id="admin-order-search" type="search" placeholder="Order ID, name or phone" value={search}
              onChange={(event) => { setSearch(event.target.value); setCursor(null); }} />
            <label className="store-sr-only" htmlFor="admin-payment-filter">Payment status</label>
            <select id="admin-payment-filter" value={payment} onChange={(event) => { setPayment(event.target.value); setCursor(null); }}>
              <option value="all">All payments</option>
              <option value="paid">Paid</option>
              <option value="created">Awaiting payment</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>

      {rows === null ? <p className="admin-state">Loading orders…</p>
        : error ? <p className="admin-state">{error}</p>
        : rows.length === 0 ? <p className="admin-state">No orders match this view.</p>
        : (
          <>
            <div className="admin-table" role="table">
              <div className="admin-table__head" role="row">
                <span role="columnheader">Order</span>
                <span role="columnheader">Date</span>
                <span role="columnheader">Customer</span>
                <span role="columnheader">Total</span>
                <span role="columnheader">Payment</span>
                <span role="columnheader">Fulfilment</span>
              </div>
              {rows.map((row) => (
                <button className="admin-table__row" role="row" key={row.orderId} onClick={() => setSelected(row.orderId)}>
                  <span role="cell" data-label="Order" className="admin-mono">{row.orderId}</span>
                  <span role="cell" data-label="Date">{formatIST(row.createdAt)}</span>
                  <span role="cell" data-label="Customer">{row.customer || "—"}</span>
                  <span role="cell" data-label="Total">{formatINR(row.total)}</span>
                  <span role="cell" data-label="Payment"><em className={`status-badge status-badge--${row.payment}`}>{STATUS_LABEL[row.payment]}</em></span>
                  <span role="cell" data-label="Fulfilment"><em className={`admin-pill admin-pill--${row.fulfilment}`}>{FULFILMENT_LABEL[row.fulfilment]}</em></span>
                </button>
              ))}
            </div>
            {!compact && (
              <div className="admin-pager">
                <button className="store-button store-button-secondary" type="button" disabled={!cursor} onClick={() => setCursor(null)}>First page</button>
                <button className="store-button store-button-secondary" type="button" disabled={!nextCursor} onClick={() => setCursor(nextCursor)}>Next page</button>
              </div>
            )}
          </>
        )}

      {selected && <OrderDetail orderId={selected} onClose={() => setSelected(null)} onUpdated={() => void load()} />}
    </section>
  );
}

function OrderDetail({ orderId, onClose, onUpdated }: { orderId: string; onClose: () => void; onUpdated: () => void }) {
  type AdminOrder = StoredOrder & { fulfilment: FulfilmentStatus };
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<FulfilmentStatus | "">("");
  // Three-stage delivery controls.
  const [stage, setStage] = useState<DeliveryStageKey | "">("");
  const [stageSaved, setStageSaved] = useState("");
  const [needsCorrection, setNeedsCorrection] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [courier, setCourier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Estimated delivery: a presentational promise, saved through its own
  // endpoint that writes nothing else on the order.
  const [estimateDays, setEstimateDays] = useState<string>("");
  const [estimateDate, setEstimateDate] = useState("");
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const [estimateSaved, setEstimateSaved] = useState("");

  // Address correction is a separate, explicitly confirmed action.
  const [editingAddress, setEditingAddress] = useState(false);
  const [draft, setDraft] = useState<OrderAddress>(EMPTY_ADDRESS);
  const [reason, setReason] = useState("");
  const [addressError, setAddressError] = useState("");
  const [addressBusy, setAddressBusy] = useState(false);
  const [confirmAddress, setConfirmAddress] = useState(false);

  const load = useCallback(async () => {
    const response = await authFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`);
    if (!response.ok) { setError((await response.json()).error ?? "Could not load the order."); return; }
    setOrder((await response.json()).order);
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  // The drawer owns the viewport while it is open: the page behind it must not
  // scroll, and Escape closes it. The previous overflow value is restored so
  // this cannot leave the admin page stuck when the drawer unmounts.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  /**
   * Saves a delivery stage. The server canonicalises the stage and decides
   * whether it is a forward step or a correction; this only passes the choice
   * along, plus the reason when a correction has been confirmed.
   */
  const applyStage = async (asCorrection = false) => {
    if (!stage || busy) return;
    setBusy(true); setError(""); setStageSaved("");
    try {
      const response = await authFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          ...(asCorrection ? { correction: true, note: correctionReason.trim() } : {}),
          ...(courier.trim() || trackingNumber.trim()
            ? { courier, trackingNumber, ...(trackingUrl.trim() ? { trackingUrl: trackingUrl.trim() } : {}) }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Update failed.");
        // The server flags a backward move so the reason field can appear.
        if (data.needsCorrection) setNeedsCorrection(true);
        return;
      }
      setStage(""); setNeedsCorrection(false); setCorrectionReason(""); setTrackingUrl("");
      setStageSaved("Delivery status updated.");
      await load(); onUpdated();
    } catch {
      setError("Network problem. The delivery status was not changed.");
    } finally { setBusy(false); }
  };

  /** Cancelling keeps the older explicit-status path. */
  const apply = async () => {
    if (!target || busy) return;
    setBusy(true); setError("");
    try {
      const response = await authFetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfilment: target }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Update failed."); return; }
      setTarget(""); setConfirming(false);
      await load(); onUpdated();
    } finally { setBusy(false); }
  };

  const saveAddress = async () => {
    if (addressBusy) return;
    setAddressBusy(true); setAddressError("");
    try {
      const response = await authFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/address`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // confirm is sent only from the explicit confirmation step below.
        body: JSON.stringify({ address: draft, reason: reason.trim(), confirm: true }),
      });
      const data = await response.json();
      if (!response.ok) { setAddressError(data.error ?? "Could not update the address."); return; }
      setEditingAddress(false); setConfirmAddress(false); setReason("");
      await load(); onUpdated();
    } catch { setAddressError("Network problem. Please try again."); }
    finally { setAddressBusy(false); }
  };

  const destructive = target === "cancelled";
  const saveEstimate = async (clear = false) => {
    if (estimateBusy || !order) return;
    setEstimateBusy(true); setEstimateError(""); setEstimateSaved("");
    try {
      const response = await authFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/estimate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear
          ? { clear: true }
          : estimateDate ? { date: estimateDate } : { days: Number(estimateDays) }),
      });
      const data = await response.json();
      if (!response.ok) { setEstimateError(data.error ?? "Could not save the estimate."); return; }
      setEstimateSaved(clear ? "Estimate removed." : "Estimate saved.");
      await load(); onUpdated();
    } catch { setEstimateError("Network problem. Please try again."); }
    finally { setEstimateBusy(false); }
  };

  // Previewed with the same helpers the server uses, so what the operator sees
  // before saving is what gets stored.
  const estimatePreview = order
    ? estimateDate
      ? (ISO_DATE.test(estimateDate) ? formatEstimateDate(estimateDate) : "")
      : estimateDays
        ? formatEstimateDate(addDays(istDateKey(order.createdAt), Number(estimateDays)))
        : ""
    : "";

  // The same validation the server applies, surfaced inline so the operator can
  // see exactly what is missing instead of facing a disabled button.
  const addressBlockers = [
    ...validateAddress(normalizeAddress(draft)),
    ...(reason.trim() ? [] : ["A reason for the change is required."]),
  ];

  const addressEditable = order
    ? !["shipped", "delivered", "cancelled"].includes(order.fulfilment)
    : false;

  return (
    <div className="admin-drawer admin-drawer--order" role="dialog" aria-modal="true" aria-label={`Order ${orderId}`}>
      <div className="admin-drawer__panel">
        {/* Header and footer stay put; only the middle column scrolls, and
            only when the content genuinely does not fit. */}
        <div className="admin-drawer__head">
          <div className="admin-drawer__title">
            <h3 className="admin-mono">{orderId}</h3>
            {order && (
              <p className="admin-drawer__sub">
                {formatIST(order.createdAt)}
                {" · "}
                <em className={`status-badge status-badge--${order.status}`}>{STATUS_LABEL[order.status]}</em>
              </p>
            )}
          </div>
          <button type="button" aria-label="Close order" onClick={onClose}>×</button>
        </div>

        {error && <p className="admin-state admin-state--error">{error}</p>}
        {!order ? <p className="admin-state">Loading…</p> : (
          <>
            <div className="admin-drawer__body">
              <div className="admin-drawer__cols">
                <section className="admin-drawer__col">
                <dl className="admin-detail">
                  <div><dt>Customer</dt><dd>{order.address?.fullName || "—"}</dd></div>
                  <div><dt>Phone</dt><dd>{formatPhone(order.address?.phone || order.phone)}</dd></div>
                  <div><dt>Payment method</dt><dd>{order.paymentMethod === "cod" ? "Cash on delivery" : "Razorpay"}</dd></div>
                  <div><dt>Payment status</dt><dd><em className={`status-badge status-badge--${order.status}`}>{STATUS_LABEL[order.status]}</em> <small>verified by signature only</small></dd></div>
                  {order.razorpayPaymentId && <div><dt>Razorpay payment</dt><dd className="admin-mono">{order.razorpayPaymentId}</dd></div>}
                  {order.tracking && (
                    <div><dt>Tracking</dt><dd>
                      {order.tracking.courier} · <span className="admin-mono">{order.tracking.number}</span>
                      {order.tracking.url && <> · <a href={order.tracking.url} target="_blank" rel="noopener noreferrer">courier page</a></>}
                    </dd></div>
                  )}
                </dl>

                <div className="admin-address">
                  <div className="admin-address__head">
                    <h4>Delivery address</h4>
                    {!editingAddress && addressEditable && (
                      <button type="button" className="panel__link" onClick={() => {
                        setDraft({ ...EMPTY_ADDRESS, ...(order.address ?? {}) });
                        setReason(""); setAddressError(""); setConfirmAddress(false); setEditingAddress(true);
                      }}>Correct address</button>
                    )}
                  </div>

                  {addressError && <p className="admin-state admin-state--error">{addressError}</p>}

                  {editingAddress ? (
                    <>
                      <AddressFields address={draft} onChange={setDraft} disabled={addressBusy} idPrefix="admin-addr" />
                      <label className="checkout-field" htmlFor="admin-addr-reason">
                        <span>Reason for this change (recorded in the audit trail)</span>
                        <input id="admin-addr-reason" value={reason} maxLength={300} disabled={addressBusy} onChange={(event) => setReason(event.target.value)} />
                      </label>
                      {confirmAddress ? (
                        <div className="admin-confirm">
                          <p>This changes where the parcel is delivered. The previous address is kept in the audit trail. Continue?</p>
                          <button className="store-button store-button-primary" type="button" disabled={addressBusy} onClick={() => void saveAddress()}>
                            {addressBusy ? "Saving…" : "Yes, change address"}
                          </button>
                          <button className="store-button store-button-secondary" type="button" disabled={addressBusy} onClick={() => setConfirmAddress(false)}>Back</button>
                        </div>
                      ) : (
                        <>
                          {/* Orders placed before `locality` existed have none,
                              so the submit was sitting disabled with nothing on
                              screen to say why — the editor looked broken.
                              The blocking reasons are now listed. */}
                          {addressBlockers.length > 0 && (
                            <ul className="admin-problems" aria-live="polite">
                              {addressBlockers.map((problem) => <li key={problem}>{problem}</li>)}
                            </ul>
                          )}
                          <div className="admin-address__actions">
                            <button
                              className="store-button store-button-primary"
                              type="button"
                              disabled={addressBusy || addressBlockers.length > 0}
                              onClick={() => setConfirmAddress(true)}
                            >Review change…</button>
                            <button className="store-button store-button-secondary" type="button" disabled={addressBusy} onClick={() => setEditingAddress(false)}>Cancel</button>
                          </div>
                        </>
                      )}
                    </>
                  ) : !hasAddressDetails(order.address) ? (
                    <p className="admin-note">Address details unavailable for this order.</p>
                  ) : (
                    <address className="order-address">
                      {addressLines(order.address).map((line, index) => <span key={`${line}-${index}`}>{line}<br /></span>)}
                    </address>
                  )}

                  {!editingAddress && !addressEditable && (
                    <p className="admin-note">The address can no longer be changed once an order is shipped, delivered or cancelled.</p>
                  )}

                  {Boolean(order.addressHistory?.length) && (
                    <ol className="admin-history admin-history--address">
                      {order.addressHistory!.map((event, index) => (
                        <li key={`${event.at}-${index}`}>
                          <strong>Address changed</strong>
                          <span>{formatIST(event.at)} · {eventActor(event)}</span>
                          <em>{event.reason}</em>
                          <small>From: {event.from ? addressLines(event.from).join(", ") : "no address on record"}</small>
                          <small>To: {addressLines(event.to).join(", ")}</small>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="admin-address admin-estimate">
                  <div className="admin-address__head">
                    <h4>Estimated delivery</h4>
                    {order.estimatedDelivery && (
                      <button type="button" className="panel__link panel__link--danger" disabled={estimateBusy}
                        onClick={() => void saveEstimate(true)}>Remove</button>
                    )}
                  </div>

                  <p className="admin-estimate__current">
                    {order.estimatedDelivery
                      ? <><strong>{formatEstimateDate(order.estimatedDelivery.date)}</strong>
                          {order.estimatedDelivery.days ? <small> · {order.estimatedDelivery.days}-day estimate</small> : null}
                          {order.estimatedDelivery.setByEmail && <small> · set by {order.estimatedDelivery.setByEmail}</small>}</>
                      : <em>Not set yet — the customer is told it will be updated soon.</em>}
                  </p>

                  <div className="admin-estimate__row">
                    <label className="checkout-field" htmlFor="admin-est-days">
                      <span>Days from order date</span>
                      <select
                        id="admin-est-days"
                        value={estimateDays}
                        disabled={estimateBusy || Boolean(estimateDate)}
                        onChange={(event) => { setEstimateDays(event.target.value); setEstimateError(""); setEstimateSaved(""); }}
                      >
                        <option value="">Choose…</option>
                        {ESTIMATE_DAY_OPTIONS.map((days) => <option key={days} value={days}>{days} days</option>)}
                      </select>
                    </label>
                    <label className="checkout-field" htmlFor="admin-est-date">
                      <span>Or an exact date</span>
                      <input
                        id="admin-est-date"
                        type="date"
                        value={estimateDate}
                        disabled={estimateBusy || Boolean(estimateDays)}
                        onChange={(event) => { setEstimateDate(event.target.value); setEstimateError(""); setEstimateSaved(""); }}
                      />
                    </label>
                  </div>

                  {estimatePreview && (
                    <p className="admin-estimate__preview">Will be saved as <strong>{estimatePreview}</strong></p>
                  )}
                  {estimateError && <p className="admin-state admin-state--error">{estimateError}</p>}
                  {estimateSaved && <p className="admin-state admin-state--ok" role="status">{estimateSaved}</p>}

                  <div className="admin-address__actions">
                    <button
                      className="store-button store-button-primary"
                      type="button"
                      disabled={estimateBusy || (!estimateDays && !estimateDate)}
                      onClick={() => void saveEstimate(false)}
                    >{estimateBusy ? "Saving…" : "Save estimate"}</button>
                    {(estimateDays || estimateDate) && (
                      <button className="store-button store-button-secondary" type="button" disabled={estimateBusy}
                        onClick={() => { setEstimateDays(""); setEstimateDate(""); setEstimateError(""); setEstimateSaved(""); }}>Clear</button>
                    )}
                  </div>
                  {/* Stated so nobody expects this to move the order along. */}
                  <p className="admin-note">This is a delivery promise only. It does not change payment or delivery status.</p>
                </div>
                </section>

                <section className="admin-drawer__col">
                <div className="admin-lines">
                  {order.items.map((item) => (
                    <p key={item.id}><span>{item.name} × {item.qty}</span><strong>{formatINR(item.lineTotal)}</strong></p>
                  ))}
                  <p><span>Subtotal</span><strong>{formatINR(order.amounts.subtotal)}</strong></p>
                  {(order.amounts.discount ?? 0) > 0 && <p><span>Discount{order.coupon ? ` (${order.coupon.code})` : ""}</span><strong>−{formatINR(order.amounts.discount)}</strong></p>}
                  <p><span>Shipping</span><strong>{formatINR(order.amounts.shipping)}</strong></p>
                  <p><span>Tax</span><strong>{formatINR(order.amounts.tax)}</strong></p>
                  <p className="admin-lines__total"><span>Total</span><strong>{formatINR(order.amounts.total)}</strong></p>
                </div>

                {Boolean(order.fulfilmentHistory?.length) && (
                  <ol className="admin-history">
                    {order.fulfilmentHistory!.map((event, index) => (
                      <li key={`${event.at}-${index}`}>
                        <strong>{FULFILMENT_LABEL[event.status]}</strong>
                        <span>{formatIST(event.at)} · {eventActor(event)}</span>
                        {event.note && <em>{event.note}</em>}
                      </li>
                    ))}
                  </ol>
                )}
                </section>
              </div>
            </div>

            {/* Pinned below the scroll area so the status control and its
                button are reachable without scrolling. */}
            <div className="admin-drawer__foot">
                <div className="admin-fulfil">
                  <div className="admin-fulfil__row">
                    <h4>Delivery status — currently {deliveryStageLabel(order.fulfilment)}</h4>
                  </div>

                  {/* Exactly three stages, the same three the customer sees. */}
                  <div className="admin-stages" role="radiogroup" aria-label="Delivery stage">
                    {DELIVERY_STAGES.map((entry, index) => {
                      const reached = stageIndexOf(order.fulfilment);
                      const state = order.fulfilment === "cancelled" ? "off"
                        : index + 1 < reached ? "done" : index + 1 === reached ? "current" : "todo";
                      return (
                        <label key={entry.key} className={`admin-stage admin-stage--${state}${stage === entry.key ? " is-chosen" : ""}`}>
                          <input
                            type="radio"
                            name="delivery-stage"
                            value={entry.key}
                            checked={stage === entry.key}
                            disabled={busy || order.fulfilment === "cancelled"}
                            onChange={() => { setStage(entry.key); setError(""); setStageSaved(""); setNeedsCorrection(false); }}
                          />
                          <span>
                            <strong>{entry.label}</strong>
                            <small>{state === "done" ? "Completed" : state === "current" ? "Current stage" : "Not yet reached"}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Optional at any stage; no longer gated on "shipped". */}
                  <details className="admin-tracking-toggle">
                    <summary>Courier and tracking (optional)</summary>
                    <div className="admin-tracking">
                      <input placeholder="Courier" value={courier} disabled={busy} onChange={(e) => setCourier(e.target.value)} />
                      <input placeholder="Tracking number" value={trackingNumber} disabled={busy} onChange={(e) => setTrackingNumber(e.target.value)} />
                      <input placeholder="Tracking URL (optional)" value={trackingUrl} disabled={busy} inputMode="url" onChange={(e) => setTrackingUrl(e.target.value)} />
                      <small className="admin-note">A tracking URL is shown to the customer as a link only if it is an https page on a recognised courier domain.</small>
                    </div>
                  </details>

                  {needsCorrection && (
                    <div className="admin-confirm">
                      <p>This moves the order backwards. Give a reason; it is recorded in the order history.</p>
                      <label className="store-sr-only" htmlFor="admin-stage-reason">Reason for the correction</label>
                      <input id="admin-stage-reason" value={correctionReason} maxLength={300} disabled={busy}
                        placeholder="Reason for this correction" onChange={(e) => setCorrectionReason(e.target.value)} />
                      <button className="store-button store-button-primary" type="button"
                        disabled={busy || !correctionReason.trim()} onClick={() => void applyStage(true)}>
                        {busy ? "Saving…" : "Confirm correction"}
                      </button>
                      <button className="store-button store-button-secondary" type="button" disabled={busy}
                        onClick={() => { setNeedsCorrection(false); setCorrectionReason(""); setError(""); }}>Cancel</button>
                    </div>
                  )}

                  {!needsCorrection && (
                    <button className="store-button store-button-primary" type="button" disabled={!stage || busy}
                      onClick={() => void applyStage(false)}>
                      {busy ? "Updating…" : "Update Delivery Status"}
                    </button>
                  )}

                  {stageSaved && <p className="admin-state admin-state--ok" role="status">{stageSaved}</p>}

                  {order.fulfilment !== "cancelled" && order.fulfilment !== "delivered" && (
                    destructive && confirming ? (
                      <div className="admin-confirm">
                        <p>Cancelling cannot be undone. Continue?</p>
                        <button className="store-button store-button-primary" type="button" disabled={busy} onClick={apply}>{busy ? "Cancelling…" : "Yes, cancel order"}</button>
                        <button className="store-button store-button-secondary" type="button" disabled={busy} onClick={() => { setConfirming(false); setTarget(""); }}>Keep order</button>
                      </div>
                    ) : (
                      <button className="store-button store-button-secondary admin-cancel-order" type="button" disabled={busy}
                        onClick={() => { setTarget("cancelled"); setConfirming(true); }}>Cancel this order…</button>
                    )
                  )}
                  <p className="admin-note">Payment status cannot be changed here. It is set only by verified Razorpay confirmation.</p>
                </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Subscribers() {
  const [rows, setRows] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null); setError("");
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (status !== "all") params.set("status", status);
    if (search.trim()) params.set("q", search.trim());
    try {
      const response = await authFetch(`/api/admin/subscribers?${params}`);
      if (!response.ok) { setError((await response.json()).error ?? "Could not load subscribers."); setRows([]); return; }
      const data = await response.json();
      setRows(data.subscribers); setNextCursor(data.nextCursor);
    } catch { setError("Network problem."); setRows([]); }
  }, [cursor, status, search]);

  useEffect(() => { void load(); }, [load]);

  const exportCsv = async () => {
    const response = await authFetch(`/api/admin/subscribers?format=csv${status !== "all" ? `&status=${status}` : ""}`);
    if (!response.ok) { setError("Export failed."); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "newsletter-subscribers.csv";
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2>Newsletter Subscribers</h2>
        <div className="admin-filters">
          <label className="store-sr-only" htmlFor="admin-sub-search">Search subscribers</label>
          <input id="admin-sub-search" type="search" placeholder="Search email" value={search} onChange={(e) => { setSearch(e.target.value); setCursor(null); }} />
          <label className="store-sr-only" htmlFor="admin-sub-status">Status</label>
          <select id="admin-sub-status" value={status} onChange={(e) => { setStatus(e.target.value); setCursor(null); }}>
            <option value="all">All statuses</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
          <button className="store-button store-button-secondary" type="button" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {rows === null ? <p className="admin-state">Loading subscribers…</p>
        : error ? <p className="admin-state">{error}</p>
        : rows.length === 0 ? <p className="admin-state">No subscribers match this view.</p>
        : (
          <>
            <div className="admin-table admin-table--subs" role="table">
              <div className="admin-table__head" role="row">
                <span role="columnheader">Email</span><span role="columnheader">Status</span>
                <span role="columnheader">Source</span><span role="columnheader">Subscribed</span>
              </div>
              {rows.map((row) => (
                <div className="admin-table__row" role="row" key={row.email}>
                  <span role="cell" data-label="Email" className="admin-break">{row.email}</span>
                  <span role="cell" data-label="Status"><em className="admin-pill admin-pill--confirmed">{row.status}</em></span>
                  <span role="cell" data-label="Source">{row.source || "—"}</span>
                  <span role="cell" data-label="Subscribed">{row.createdAt ? formatIST(row.createdAt) : "—"}</span>
                </div>
              ))}
            </div>
            <div className="admin-pager">
              <button className="store-button store-button-secondary" type="button" disabled={!cursor} onClick={() => setCursor(null)}>First page</button>
              <button className="store-button store-button-secondary" type="button" disabled={!nextCursor} onClick={() => setCursor(nextCursor)}>Next page</button>
            </div>
          </>
        )}
    </section>
  );
}
