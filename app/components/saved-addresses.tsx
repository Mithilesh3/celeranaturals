"use client";

import { useCallback, useEffect, useState } from "react";
import { getFirebaseAuth } from "./firebase";
import { AddressFields, EMPTY_ADDRESS, addressIncomplete } from "./address-form";
import { addressLines, type OrderAddress } from "../../lib/orders";
import type { SavedAddress } from "../../lib/saved-addresses";

/**
 * Saved addresses for the signed-in customer.
 *
 * Everything goes through /api/account/addresses, which resolves the owner
 * from a verified ID token — this component never sends a uid, so it cannot
 * reach another customer's records even if its state were tampered with.
 *
 * Saving an address here does not alter any existing order: orders keep the
 * address snapshot taken when they were placed.
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

export function useSavedAddresses(enabled: boolean) {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await api("/api/account/addresses");
      if (!response.ok) { setFailed(true); setAddresses([]); return; }
      const data = await response.json();
      setFailed(false);
      setAddresses(data.addresses as SavedAddress[]);
    } catch { setFailed(true); setAddresses([]); }
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);
  return { addresses, failed, reload: load };
}

export function SavedAddresses({ enabled }: { enabled: boolean }) {
  const { addresses, failed, reload } = useSavedAddresses(enabled);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<OrderAddress>(EMPTY_ADDRESS);
  const [label, setLabel] = useState("Home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const startNew = () => { setEditing("new"); setDraft(EMPTY_ADDRESS); setLabel("Home"); setError(""); };
  const startEdit = (entry: SavedAddress) => {
    setEditing(entry.id);
    setDraft({ ...EMPTY_ADDRESS, ...entry });
    setLabel(entry.label);
    setError("");
  };

  const save = async () => {
    if (busy || addressIncomplete(draft)) return;
    setBusy(true); setError("");
    try {
      const response = editing === "new"
        ? await api("/api/account/addresses", { method: "POST", body: JSON.stringify({ address: draft, label }) })
        : await api(`/api/account/addresses/${encodeURIComponent(editing!)}`, { method: "PUT", body: JSON.stringify({ address: draft, label }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not save this address."); return; }
      setEditing(null);
      await reload();
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  };

  const act = async (path: string, init: RequestInit) => {
    setBusy(true); setError("");
    try {
      const response = await api(path, init);
      if (!response.ok) { setError((await response.json()).error ?? "Could not update addresses."); return; }
      await reload();
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <section className="panel address-book" aria-labelledby="acc-addresses">
      <div className="panel__headrow">
        <h2 id="acc-addresses" className="panel__heading">Saved addresses</h2>
        {editing === null && addresses !== null && !failed && (
          <button type="button" className="panel__link" onClick={startNew}>Add address</button>
        )}
      </div>

      {error && <p className="phone-auth-error" role="alert">{error}</p>}

      {editing !== null ? (
        <>
          <label className="checkout-field" htmlFor="addr-label">
            <span>Label</span>
            <input id="addr-label" value={label} maxLength={40} disabled={busy} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <AddressFields address={draft} onChange={setDraft} disabled={busy} />
          <div className="address-book__actions">
            <button className="store-button store-button-primary" type="button" disabled={busy || addressIncomplete(draft)} onClick={() => void save()}>
              {busy ? "Saving…" : editing === "new" ? "Save address" : "Save changes"}
            </button>
            <button className="store-button store-button-secondary" type="button" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>
              Cancel
            </button>
          </div>
        </>
      ) : addresses === null ? (
        <p className="panel__hint">Loading your addresses…</p>
      ) : failed ? (
        <p className="panel__hint">Could not load your saved addresses right now. Please try again shortly.</p>
      ) : addresses.length === 0 ? (
        <>
          <p className="panel__hint">
            You haven&rsquo;t saved an address yet. Save one to fill in checkout faster — each order still keeps its own copy.
          </p>
          <button className="store-button store-button-secondary panel__action" type="button" onClick={startNew}>Add your first address</button>
        </>
      ) : (
        <ul className="address-book__list">
          {addresses.map((entry) => (
            <li key={entry.id} className={entry.isDefault ? "is-default" : ""}>
              <div className="address-book__head">
                <strong>{entry.label}</strong>
                {entry.isDefault && <span className="address-book__tag">Default</span>}
              </div>
              <address className="order-address">
                <strong>{entry.fullName}</strong><br />
                {addressLines(entry).map((line, index) => <span key={`${line}-${index}`}>{line}<br /></span>)}
                <span className="order-address__phone">Phone: +91 {entry.phone}</span>
              </address>
              <div className="address-book__actions">
                {!entry.isDefault && (
                  <button type="button" className="panel__link" disabled={busy} onClick={() => void act(`/api/account/addresses/${encodeURIComponent(entry.id)}`, { method: "PUT", body: JSON.stringify({ address: entry, label: entry.label, isDefault: true }) })}>
                    Set as default
                  </button>
                )}
                <button type="button" className="panel__link" disabled={busy} onClick={() => startEdit(entry)}>Edit</button>
                {confirmDelete === entry.id ? (
                  <>
                    <span className="address-book__confirm">Delete this address?</span>
                    <button type="button" className="panel__link panel__link--danger" disabled={busy} onClick={async () => { setConfirmDelete(null); await act(`/api/account/addresses/${encodeURIComponent(entry.id)}`, { method: "DELETE" }); }}>
                      Yes, delete
                    </button>
                    <button type="button" className="panel__link" disabled={busy} onClick={() => setConfirmDelete(null)}>Keep</button>
                  </>
                ) : (
                  <button type="button" className="panel__link panel__link--danger" disabled={busy} onClick={() => setConfirmDelete(entry.id)}>Delete</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
