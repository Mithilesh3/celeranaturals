"use client";

import { useCallback, useEffect, useState } from "react";
import { getFirebaseAuth } from "../components/firebase";
import { formatINR } from "../../lib/money";
import { formatIST, addressLines } from "../../lib/orders";
import { STATUS_LABEL } from "../../lib/orders";
import { FULFILMENT_LABEL, type FulfilmentStatus } from "../../lib/fulfilment";
import {
  PROFILE_NAME_MAX, formatCustomerPhone, validateDisplayName,
  type CustomerDetail, type CustomerSummary, type OrphanOrderGroup,
} from "../../lib/customers";

/**
 * Customer directory for the admin panel.
 *
 * Every request is authorised server-side; this component only renders what
 * /api/admin/customers returns. Only the minimum needed to serve a customer is
 * shown — there are no credentials in the payload to display.
 */
async function api(path: string, init: RequestInit = {}) {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

const whenever = (iso: string | null) => (iso ? formatIST(iso) : "Not available");

export function Customers() {
  const [rows, setRows] = useState<CustomerSummary[] | null>(null);
  const [orphans, setOrphans] = useState<OrphanOrderGroup[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageCount: 1, capped: false, ordersCapped: false });
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null); setError("");
    const params = new URLSearchParams();
    if (applied.trim()) params.set("q", applied.trim());
    params.set("page", String(page));
    try {
      const response = await api(`/api/admin/customers?${params}`);
      if (!response.ok) { setError((await response.json()).error ?? "Could not load customers."); setRows([]); return; }
      const data = await response.json();
      setRows(data.customers);
      setOrphans(data.orphanOrders ?? []);
      setMeta({ total: data.total, page: data.page, pageCount: data.pageCount, capped: data.capped, ordersCapped: data.ordersCapped });
    } catch { setError("Network problem loading customers."); setRows([]); }
  }, [applied, page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2>Customers</h2>
        <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(search); }}>
          <input
            placeholder="Search name, mobile or email"
            value={search}
            aria-label="Search customers"
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="store-button store-button-secondary" type="submit">Search</button>
          {applied && (
            <button className="store-button store-button-secondary" type="button" onClick={() => { setSearch(""); setApplied(""); setPage(1); }}>
              Clear
            </button>
          )}
        </form>
      </div>

      {error && <p className="admin-state admin-state--error">{error}</p>}

      {rows === null ? <p className="admin-state">Loading customers…</p>
        : rows.length === 0 ? (
          <div className="admin-empty">
            <h3>{applied ? "No customers match that search" : "No registered customers yet"}</h3>
            <p>{applied
              ? "Try a different name, mobile number or email address."
              : "Customer accounts appear here once visitors sign up. Anonymous visitors are not tracked."}</p>
          </div>
        ) : (
          <>
            <div className="admin-customers">
              {rows.map((customer) => (
                <article className="admin-customer" key={customer.uid}>
                  <div className="admin-customer__main">
                    <h3>{customer.name ?? "No name provided"}</h3>
                    <p className="admin-customer__contact">
                      {formatCustomerPhone(customer.phone)}
                      {customer.email && <> · {customer.email}</>}
                    </p>
                    <p className="admin-customer__dates">
                      Joined {whenever(customer.createdAt)} · Last sign-in {whenever(customer.lastSignInAt)}
                      {/* Null means "not recorded yet", which is not the same
                          as zero logins, so it is never shown as a number. */}
                      {customer.signInCount !== null && <> · {customer.signInCount} sign-in{customer.signInCount === 1 ? "" : "s"}</>}
                    </p>
                  </div>
                  <div className="admin-customer__stats">
                    <span><strong>{customer.orderCount}</strong><small>orders</small></span>
                    {/* Paid orders only, so this is money actually taken. */}
                    <span><strong>{formatINR(customer.totalSpent)}</strong><small>paid</small></span>
                    <span><strong>{customer.lastOrderAt ? formatIST(customer.lastOrderAt).split(",")[0] : "—"}</strong><small>last order</small></span>
                  </div>
                  <div className="admin-customer__actions">
                    {customer.disabled && <span className="track-pill track-pill--cancelled">Disabled</span>}
                    <button type="button" className="panel__link" onClick={() => setSelected(customer.uid)}>View details</button>
                  </div>
                </article>
              ))}
            </div>

            <div className="admin-pager">
              <span>{meta.total} customer{meta.total === 1 ? "" : "s"} · page {meta.page} of {meta.pageCount}</span>
              <div>
                <button className="store-button store-button-secondary" type="button" disabled={meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
                <button className="store-button store-button-secondary" type="button" disabled={meta.page >= meta.pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </>
        )}

      {meta.capped && <p className="admin-note">Showing the first 1000 accounts. Narrow the search to find a specific customer.</p>}
      {meta.ordersCapped && <p className="admin-note">Order totals are aggregated from the 2000 most recent orders.</p>}

      {orphans.length > 0 && (
        <div className="admin-orphans">
          <h3>Orders without a current account</h3>
          {/* Never merged into a customer: ownership cannot be re-verified. */}
          <p className="admin-note">
            These orders were placed by accounts that no longer exist. They are listed separately and are not
            attributed to any current customer.
          </p>
          <ul>
            {orphans.map((group) => (
              <li key={group.userId}>
                <span className="admin-mono">{group.userId.slice(0, 10)}…</span>
                <span>{group.orderCount} order{group.orderCount === 1 ? "" : "s"}</span>
                <span>{formatINR(group.totalSpent)} paid</span>
                <span>{group.lastOrderAt ? formatIST(group.lastOrderAt) : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && <CustomerDetailPanel uid={selected} onClose={() => setSelected(null)} onUpdated={() => void load()} />}
    </section>
  );
}

function CustomerDetailPanel({ uid, onClose, onUpdated }: { uid: string; onClose: () => void; onUpdated: () => void }) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api(`/api/admin/customers/${encodeURIComponent(uid)}`);
      if (!response.ok) { setError((await response.json()).error ?? "Could not load this customer."); return; }
      setCustomer((await response.json()).customer);
    } catch { setError("Network problem."); }
  }, [uid]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true); setError("");
    try {
      const response = await api(`/api/admin/customers/${encodeURIComponent(uid)}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName: name, reason: reason.trim(), confirm: true }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not update the profile."); return; }
      setEditing(false); setConfirming(false); setReason("");
      await load(); onUpdated();
    } catch { setError("Network problem."); }
    finally { setBusy(false); }
  };

  const nameProblem = validateDisplayName(name);

  return (
    <div className="admin-drawer" role="dialog" aria-modal="true" aria-label="Customer details">
      <div className="admin-drawer__panel">
        <div className="admin-drawer__head">
          <h3>{customer?.name ?? "Customer"}</h3>
          <button type="button" aria-label="Close customer" onClick={onClose}>×</button>
        </div>

        {error && <p className="admin-state admin-state--error">{error}</p>}
        {!customer ? <p className="admin-state">Loading…</p> : (
          <>
            <dl className="admin-detail">
              <div><dt>Name</dt><dd>{customer.name ?? "Not provided"}</dd></div>
              <div><dt>Mobile</dt><dd>{formatCustomerPhone(customer.phone)}</dd></div>
              <div><dt>Email</dt><dd>{customer.email ?? "Not provided"}</dd></div>
              <div><dt>Account created</dt><dd>{whenever(customer.createdAt)}</dd></div>
              <div><dt>Last sign-in</dt><dd>{whenever(customer.lastSignInAt)}</dd></div>
              <div>
                <dt>Sign-ins recorded</dt>
                <dd>
                  {customer.signInCount === null
                    ? "Not recorded yet"
                    : `${customer.signInCount} since ${customer.firstSignInAt ? formatIST(customer.firstSignInAt) : "recording began"}`}
                </dd>
              </div>
              <div><dt>Sign-in methods</dt><dd>{customer.providers.join(", ") || "Not available"}</dd></div>
              <div><dt>Total paid</dt><dd><strong>{formatINR(customer.totalSpent)}</strong> across {customer.paidOrderCount} paid order{customer.paidOrderCount === 1 ? "" : "s"}</dd></div>
            </dl>

            <div className="admin-address">
              <div className="admin-address__head">
                <h4>Profile</h4>
                {!editing && (
                  <button type="button" className="panel__link" onClick={() => { setName(customer.name ?? ""); setReason(""); setConfirming(false); setEditing(true); }}>
                    Correct name
                  </button>
                )}
              </div>
              {editing ? (
                <>
                  <label className="checkout-field" htmlFor="cust-name">
                    <span>Display name</span>
                    <input id="cust-name" value={name} maxLength={PROFILE_NAME_MAX} disabled={busy} onChange={(event) => setName(event.target.value)} />
                    {nameProblem && <small className="phone-auth-error">{nameProblem}</small>}
                  </label>
                  <label className="checkout-field" htmlFor="cust-reason">
                    <span>Reason for this change (recorded in the audit trail)</span>
                    <input id="cust-reason" value={reason} maxLength={300} disabled={busy} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  {confirming ? (
                    <div className="admin-confirm">
                      <p>This changes the customer&rsquo;s profile name. Past order addresses are not affected. Continue?</p>
                      <button className="store-button store-button-primary" type="button" disabled={busy} onClick={() => void save()}>
                        {busy ? "Saving…" : "Yes, change name"}
                      </button>
                      <button className="store-button store-button-secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>Back</button>
                    </div>
                  ) : (
                    <div className="admin-address__actions">
                      <button className="store-button store-button-primary" type="button" disabled={busy || Boolean(nameProblem) || !reason.trim()} onClick={() => setConfirming(true)}>
                        Review change…
                      </button>
                      <button className="store-button store-button-secondary" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                  )}
                </>
              ) : (
                <p className="admin-note">
                  Only the display name can be corrected here. Mobile number and email are sign-in credentials and
                  are not editable from the admin panel.
                </p>
              )}

              {customer.profileHistory.length > 0 && (
                <ol className="admin-history admin-history--address">
                  {customer.profileHistory.map((event, index) => (
                    <li key={`${event.at}-${index}`}>
                      <strong>Name changed</strong>
                      <span>{formatIST(event.at)} · {event.byEmail ?? event.byUid}</span>
                      <em>{event.reason}</em>
                      <small>From: {event.from ?? "not set"}</small>
                      <small>To: {event.to ?? "not set"}</small>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="admin-address">
              <h4>Saved addresses</h4>
              {customer.addresses.length === 0 ? (
                <p className="admin-note">No saved addresses.</p>
              ) : (
                <ul className="admin-customer__addresses">
                  {customer.addresses.map((entry) => (
                    <li key={String(entry.id)}>
                      <strong>{String(entry.label ?? "Address")}{entry.isDefault ? " · Default" : ""}</strong>
                      <address className="order-address">
                        {addressLines(entry as never).map((line, index) => <span key={`${line}-${index}`}>{line}<br /></span>)}
                      </address>
                    </li>
                  ))}
                </ul>
              )}
              <p className="admin-note">Saved addresses are a convenience for the customer. Each order keeps its own address snapshot.</p>
            </div>

            <div className="admin-address">
              <h4>Order history</h4>
              {customer.orders.length === 0 ? (
                <p className="admin-note">No orders yet.</p>
              ) : (
                <ul className="admin-customer__orders">
                  {customer.orders.map((order) => (
                    <li key={order.orderId}>
                      <span className="admin-mono">{order.orderId}</span>
                      <span>{formatIST(order.createdAt)}</span>
                      <span>{formatINR(order.total)}</span>
                      <span className={`status-badge status-badge--${order.status}`}>{STATUS_LABEL[order.status as keyof typeof STATUS_LABEL] ?? order.status}</span>
                      <span className="track-pill">{FULFILMENT_LABEL[order.fulfilment as FulfilmentStatus] ?? order.fulfilment}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
