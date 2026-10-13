"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "../components/store-context";
import { OrderSummaryCard, LockIcon, type SummaryLine } from "../components/order-summary";
import { useAuth } from "../components/auth-context";
import { getFirebaseAuth } from "../components/firebase";
import { products } from "../../scripts/data.js";
import { buildAmounts, formatINR, rupeesToPaise } from "../../lib/money";
import { PINCODE, type OrderAddress } from "../../lib/orders";

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

const EMPTY_ADDRESS: OrderAddress = { fullName: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" };

export default function CheckoutPage() {
  const { cart, ready, removeFromCart } = useStore();
  const { user, initializing, configured, openAuth } = useAuth();
  const router = useRouter();
  const gated = configured && !initializing && !user;

  const [address, setAddress] = useState<OrderAddress>(EMPTY_ADDRESS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    if (gated && ready && cart.length > 0) openAuth({ returnTo: "/checkout" });
  }, [gated, ready, cart.length, openAuth]);

  // Prefill from the verified session.
  useEffect(() => {
    if (!user) return;
    setAddress((current) => ({
      ...current,
      fullName: current.fullName || user.displayName || "",
      phone: current.phone || (user.phoneNumber ?? "").replace(/^\+91/, ""),
    }));
  }, [user]);

  // Display-only totals. The server recomputes these independently and rejects
  // the order if its own figure disagrees.
  const lines = cart.flatMap((row) => {
    const product = products.find((item) => item.id === row.id);
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

  const addressInvalid =
    !address.fullName.trim() || !address.line1.trim() || !address.city.trim() ||
    !address.state.trim() || !PINCODE.test(address.pincode);

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
          expectedTotal: amounts.total,
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok) { setError(created.error ?? "Could not start checkout."); return; }

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

  const field = (key: keyof OrderAddress, label: string, extra: Record<string, unknown> = {}) => (
    <label className="checkout-field">
      <span>{label}</span>
      <input
        value={address[key]}
        disabled={busy}
        onChange={(event) => { setAddress((current) => ({ ...current, [key]: event.target.value })); setError(""); }}
        {...extra}
      />
    </label>
  );

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
                <div className="checkout-fields">
                  {field("fullName", "Full name", { autoComplete: "name" })}
                  <label className="checkout-field">
                    <span>Mobile number</span>
                    <div className="phone-auth-field">
                      <span className="phone-auth-prefix" aria-hidden="true">+91</span>
                      <input
                        value={address.phone}
                        inputMode="numeric"
                        maxLength={10}
                        disabled={busy}
                        autoComplete="tel-national"
                        onChange={(event) => setAddress((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                      />
                    </div>
                  </label>
                  {field("line1", "Address line 1", { autoComplete: "address-line1" })}
                  {field("line2", "Address line 2 (optional)", { autoComplete: "address-line2" })}
                  {field("city", "City", { autoComplete: "address-level2" })}
                  {field("state", "State", { autoComplete: "address-level1" })}
                  <label className="checkout-field">
                    <span>Pincode</span>
                    <input
                      value={address.pincode}
                      inputMode="numeric"
                      maxLength={6}
                      disabled={busy}
                      autoComplete="postal-code"
                      aria-invalid={address.pincode.length > 0 && !PINCODE.test(address.pincode)}
                      onChange={(event) => setAddress((current) => ({ ...current, pincode: event.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    />
                    {address.pincode.length > 0 && !PINCODE.test(address.pincode) && <small className="phone-auth-error">Pincode must be exactly 6 digits.</small>}
                  </label>
                </div>
              </section>

              <div className="checkout-aside">
                <OrderSummaryCard items={summaryLines} amounts={amounts} totalLabel="Total payable" />

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
