"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/auth-context";
import { getFirebaseAuth } from "../../components/firebase";
import { STATUS_LABEL, formatIST, type Order } from "../../../lib/orders";
import { OrderSummaryCard, maskPhone, type SummaryLine } from "../../components/order-summary";
import { products } from "../../../scripts/data.js";

/**
 * Fetched through an authenticated API route rather than server-rendered.
 * There is no server-side session (auth lives in the Firebase client SDK), so
 * server-rendering the document would put another user's order into the HTML
 * before any ownership check could run. The API returns 404 for a non-owner,
 * so nothing is ever rendered. No payment details appear in the URL.
 */
export default function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const { user, initializing, openAuth } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notfound" | "error">("loading");

  useEffect(() => {
    if (initializing) return;
    if (!user) { openAuth({ returnTo: `/order/${orderId}` }); setState("loading"); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (cancelled) return;
        if (response.status === 404) { setState("notfound"); return; }
        if (!response.ok) { setState("error"); return; }
        const data = await response.json();
        setOrder(data.order as Order);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [initializing, user, orderId, openAuth]);

  if (state === "loading") {
    return <main className="store-page site-redesign order-page"><div className="store-container"><div className="store-empty-state"><p>Loading your order…</p></div></div></main>;
  }
  if (state === "notfound") {
    return (
      <main className="store-page site-redesign order-page"><div className="store-container">
        <section className="store-empty-state"><h2>Order not found</h2><p>This order does not exist, or it belongs to a different account.</p><Link className="store-button store-button-primary" href="/account">Go to your orders</Link></section>
      </div></main>
    );
  }
  if (state === "error" || !order) {
    return (
      <main className="store-page site-redesign order-page"><div className="store-container">
        <section className="store-empty-state"><h2>Could not load this order</h2><p>Please try again in a moment.</p><Link className="store-button store-button-secondary" href="/account">Go to your orders</Link></section>
      </div></main>
    );
  }

  const paid = order.status === "paid";
  const failed = order.status === "failed" || order.status === "cancelled";
  // Images are looked up for presentation only; names and prices stay snapshotted.
  const summaryLines: SummaryLine[] = order.items.map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.qty,
    lineTotal: item.lineTotal,
    image: products.find((p) => p.id === item.id)?.image,
  }));

  return (
    <main className="store-page site-redesign order-page">
      <div className="store-container">
        <section className={`order-hero order-hero--${paid ? "paid" : failed ? "failed" : "pending"}`}>
          <span className="order-hero__mark" aria-hidden="true">{paid ? "✓" : failed ? "!" : "…"}</span>
          <h1>{paid ? "Order confirmed" : STATUS_LABEL[order.status]}</h1>
          <p>
            {paid ? "Thank you. We have received your payment and your order is being prepared."
              : failed ? "This payment did not go through. Nothing has been charged."
              : "This order has not been paid yet. If you have just paid, refresh in a moment."}
          </p>
          <div className="order-hero__facts">
            <span><small>Order number</small><strong>{order.orderId}</strong></span>
            <span><small>Status</small><strong className={`status-badge status-badge--${order.status}`}>{STATUS_LABEL[order.status]}</strong></span>
          </div>
        </section>

        <div className="order-grid">
          <OrderSummaryCard
            items={summaryLines}
            amounts={order.amounts}
            totalLabel={paid ? "Total paid" : "Total"}
          />

          <section className="panel" aria-labelledby="order-delivery">
            <h2 id="order-delivery" className="panel__heading">Delivery details</h2>
            <address className="order-address">
              <strong>{order.address.fullName}</strong><br />
              {order.address.line1}<br />
              {order.address.line2 && <>{order.address.line2}<br /></>}
              {order.address.city}, {order.address.state} {order.address.pincode}
            </address>
            <dl className="detail-list">
              <div><dt>Phone</dt><dd>{maskPhone(order.phone)}</dd></div>
              <div><dt>Order date</dt><dd>{formatIST(order.createdAt)}</dd></div>
              <div><dt>Payment method</dt><dd>{order.paymentMethod === "cod" ? "Cash on delivery" : "Razorpay"}</dd></div>
              {paid && <div><dt>Estimated delivery</dt><dd>Within 5–7 business days</dd></div>}
            </dl>
          </section>
        </div>

        <div className="order-actions">
          <Link className="store-button store-button-primary" href="/shop">Continue shopping</Link>
          <Link className="store-button store-button-secondary" href="/account">View my orders</Link>
        </div>
      </div>
    </main>
  );
}
