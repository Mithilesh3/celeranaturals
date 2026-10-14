"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "../components/store-context";
import { OrderSummaryCard, LockIcon, type SummaryLine } from "../components/order-summary";
import { useAuth } from "../components/auth-context";
import { getFirebaseAuth } from "../components/firebase";
import { useCatalog } from "../components/catalog-context";
import { buildAmounts, formatINR, rupeesToPaise } from "../../lib/money";
import { type OrderAddress } from "../../lib/orders";
import { AddressFields, EMPTY_ADDRESS, addressIncomplete } from "../components/address-form";
import { useSavedAddresses } from "../components/saved-addresses";

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; close: () => void };
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance }
}

/** Loaded only on this page, never globally. */
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT}"]`);
    if (existing) { existing.addEventListener("load", () => resolve(true)); existing.addEventListener("error", () => resolve(false)); return; }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function CheckoutPage() {
  const { cart, ready, removeFromCart } = useStore();
  const { byId } = useCatalog();
  const { user, initializing, configured, openAuth } = useAuth();
  const router = useRouter();
  const gated = configured && !initializing && !user;

  const [address, setAddress] = useState<OrderAddress>(EMPTY_ADDRESS);
  // "new" means type a one-off address; otherwise the id of a saved address.
  const [chosen, setChosen] = useState<string>("new");
  const [busy, setBusy] = useState(false);
  const [coupon, setCoupon] = useState("");
  // The server decides whether a code is valid and what it is worth; this only
  // records the outcome it reported so the summary can reflect it.
  const [couponError, setCouponError] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    if (gated && ready && cart.length > 0) openAuth({ returnTo: "/checkout" });
  }, [gated, ready, cart.length, openAuth]);

  const { addresses: savedAddresses } = useSavedAddresses(Boolean(user));

  // Prefill from the session, then from the saved profile. A Google or
  // email/password customer has no verified phone number on the Auth record,
  // so the self-declared profile number is used as a convenience fallback —
  // it is still only a delivery contact, never treated as verified.
  const [profilePhone, setProfilePhone] = useState("");
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        const response = await fetch("/api/account/profile", {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (typeof data.profile?.contactPhone === "string") setProfilePhone(data.profile.contactPhone);
      } catch { /* prefill is a convenience; the form still works without it */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setAddress((current) => ({
      ...current,
      fullName: current.fullName || user.displayName || "",
      phone: current.phone
        || (user.phoneNumber ?? "").replace(/^\+91/, "").replace(/\D/g, "").slice(-10)
        || profilePhone,
    }));
  }, [user, profilePhone]);

  // Preselect the default saved address once, without overwriting anything the
  // customer has already typed.
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current || !savedAddresses?.length) return;
    const preferred = savedAddresses.find((entry) => entry.isDefault) ?? savedAddresses[0];
    picked.current = true;
    setChosen(preferred.id);
    setAddress({ ...EMPTY_ADDRESS, ...preferred });
  }, [savedAddresses]);

  const choose = (id: string) => {
    setChosen(id);
    setError("");
    if (id === "new") { setAddress({ ...EMPTY_ADDRESS, fullName: user?.displayName ?? "" }); return; }
    const entry = savedAddresses?.find((candidate) => candidate.id === id);
    // A saved address is copied into the form; the order then snapshots that
    // copy, so later edits to the saved record never move this delivery.
    if (entry) setAddress({ ...EMPTY_ADDRESS, ...entry });
  };

  // Display-only totals. The server recomputes these independently and rejects
  // the order if its own figure disagrees.
  const lines = cart.flatMap((row) => {
    const product = byId.get(row.id);
    return product ? [{ product, qty: row.qty, lineTotal: rupeesToPaise(product.price) * row.qty }] : [];
  });
  const amounts = buildAmounts(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const summaryLines: SummaryLine[] = lines.map((line) => ({
    id: line.product.id,
    name: line.product.name,
    qty: line.qty,
    lineTotal: line.lineTotal,
    image: line.product.image,
  }));

  const addressInvalid = addressIncomplete(address);

  const pay = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setWarning("");
    // Set only once the Razorpay modal has taken over the flow.
    let handedOff = false;

    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) { openAuth({ returnTo: "/checkout" }); return; }
      const idToken = await current.getIdToken();

      const createResponse = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          items: cart.map((row) => ({ id: row.id, qty: row.qty })),
          address,
          // No expectedTotal when a coupon is in play: the server is the only
          // thing that knows what the code is worth.
          ...(coupon.trim() ? { couponCode: coupon.trim() } : { expectedTotal: amounts.total }),
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok) {
        // A rejected coupon belongs next to the field, not in the payment error.
        if (coupon.trim() && /coupon/i.test(created.error ?? "")) setCouponError(created.error);
        else setError(created.error ?? "Could not start checkout.");
        return;
      }

      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) { setError("Could not load the payment window. Check your connection and retry."); return; }

      const checkout = new window.Razorpay({
        key: created.keyId,
        order_id: created.razorpayOrderId,
        amount: created.amount,
        currency: created.currency,
        name: "Celeranaturals",
        description: `Order ${created.orderId}`,
        prefill: {
          name: address.fullName,
          contact: address.phone ? `+91${address.phone}` : (user?.phoneNumber ?? ""),
          email: user?.email ?? "",
        },
        modal: {
          // Dismissal is a cancellation, not a failure. Cart stays intact.
          ondismiss: () => { inFlight.current = false; setBusy(false); setWarning("Payment cancelled. Your cart is untouched."); },
        },
        handler: async (response: RazorpayResponse) => {
          try {
            const verifyResponse = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ orderId: created.orderId, ...response }),
            });
            const verified = await verifyResponse.json();
            if (!verifyResponse.ok) { setError(verified.error ?? "Payment verification failed."); return; }
            // Only a verified server response may clear the cart.
            cart.forEach((row) => removeFromCart(row.id));
            router.replace(`/order/${verified.orderId}`);
          } catch {
            // The dangerous path: money may have moved but we cannot confirm.
            // Never clear the cart and never claim failure.
            setWarning("Payment may have gone through — check Orders before retrying.");
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        },
      });
      checkout.open();
      // From here the Razorpay modal owns the flow; its handler and ondismiss
      // release the lock. Every other exit path must release it here.
      handedOff = true;
    } catch {
      setError("Something went wrong starting the payment. Your cart is intact.");
    } finally {
      if (!handedOff) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, [cart, address, amounts.total, user, openAuth, removeFromCart, router]);

  return (
    <main className="store-page site-redesign checkout-page">
      <div className="store-container">
        <header className="page-head">
          <div>
            <p className="store-eyebrow">Checkout</p>
            <h1>Delivery and payment</h1>
            <p className="store-lede">Confirm your address, then pay securely.</p>
          </div>
          <Link className="store-text-link" href="/cart">← Back to cart</Link>
        </header>

        <ol className="checkout-steps" aria-label="Checkout progress">
          <li className="is-done"><span aria-hidden="true">✓</span>Cart</li>
          <li className="is-current" aria-current="step"><span aria-hidden="true">2</span>Delivery</li>
          <li><span aria-hidden="true">3</span>Payment</li>
        </ol>

        {!ready || initializing ? <div className="store-empty-state"><p>Loading your order…</p></div>
          : cart.length === 0 ? <section className="store-empty-state"><span className="store-empty-icon" aria-hidden="true">⌑</span><h2>Your cart is empty</h2><p>Add products before checking out.</p><Link className="store-button store-button-primary" href="/shop">Browse products</Link></section>
          : gated ? <section className="store-empty-state"><span className="store-empty-icon" aria-hidden="true">⌑</span><h2>Sign in to continue</h2><p>Your cart is saved. Sign in with your mobile number to check out.</p><button className="store-button store-button-primary" type="button" onClick={() => openAuth({ returnTo: "/checkout" })}>Sign in to continue</button></section>
          : (
            <div className="checkout-layout">
              <section className="panel checkout-form-card" aria-labelledby="delivery-heading">
                <h2 id="delivery-heading" className="panel__heading">Delivery address</h2>
                <p className="panel__hint">We&rsquo;ll use these details to deliver your order.</p>

                {Boolean(savedAddresses?.length) && (
                  <fieldset className="address-picker">
                    <legend>Deliver to</legend>
                    {savedAddresses!.map((entry) => (
                      <label key={entry.id} className={`address-picker__option${chosen === entry.id ? " is-chosen" : ""}`}>
                        <input
                          type="radio"
                          name="saved-address"
                          value={entry.id}
                          checked={chosen === entry.id}
                          disabled={busy}
                          onChange={() => choose(entry.id)}
                        />
                        <span>
                          <strong>{entry.label}</strong>
                          <small>{entry.fullName} · {entry.line1}, {entry.city} {entry.pincode}</small>
                        </span>
                      </label>
                    ))}
                    <label className={`address-picker__option${chosen === "new" ? " is-chosen" : ""}`}>
                      <input type="radio" name="saved-address" value="new" checked={chosen === "new"} disabled={busy} onChange={() => choose("new")} />
                      <span><strong>Use a different address</strong><small>Enter it below for this order only.</small></span>
                    </label>
                  </fieldset>
                )}

                <AddressFields address={address} onChange={setAddress} disabled={busy} idPrefix="checkout" />
                <p className="panel__hint">
                  This address is saved with your order. Changing a saved address later won&rsquo;t move an order already placed.
                </p>
              </section>

              <div className="checkout-aside">
                <OrderSummaryCard items={summaryLines} amounts={amounts} totalLabel="Total payable">
                  <div className="coupon-field">
                    <label htmlFor="coupon-code">Coupon code</label>
                    <div className="coupon-field__row">
                      <input
                        id="coupon-code"
                        name="coupon"
                        type="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        placeholder="Enter code"
                        maxLength={32}
                        value={coupon}
                        disabled={busy}
                        aria-describedby="coupon-status"
                        aria-invalid={Boolean(couponError)}
                        onChange={(event) => { setCoupon(event.target.value.toUpperCase()); setCouponError(""); }}
                      />
                      {coupon.trim() && (
                        <button type="button" className="coupon-field__clear" disabled={busy} onClick={() => { setCoupon(""); setCouponError(""); }}>
                          Clear
                        </button>
                      )}
                    </div>
                    <p id="coupon-status" className="coupon-field__status" role="status" aria-live="polite">
                      {couponError
                        ? <span className="phone-auth-error">{couponError}</span>
                        : "The code is checked and applied when you pay."}
                    </p>
                  </div>
                </OrderSummaryCard>

                <button className="store-button store-button-primary pay-button" type="button" disabled={busy || addressInvalid} onClick={() => void pay()}>
                  {busy ? "Processing…" : <><LockIcon />Pay {formatINR(amounts.total)} securely</>}
                </button>

                {addressInvalid && !busy && (
                  <p className="pay-hint">Complete the delivery details above to continue.</p>
                )}

                <p className="checkout-outcome" role="status" aria-live="polite">
                  {error && <><span className="phone-auth-error">{error}</span>{" "}<button type="button" className="auth-linkish" onClick={() => void pay()}>Retry payment</button></>}
                  {warning && <><span>{warning}</span>{" "}<Link className="store-text-link" href="/account">Go to Orders</Link></>}
                </p>

                <div className="trust-note">
                  <LockIcon />
                  <p>Payments are processed by <strong>Razorpay</strong>. Card details are entered on Razorpay&rsquo;s secure window and never reach our servers.</p>
                </div>
              </div>
            </div>
          )}
      </div>
    </main>
  );
}
