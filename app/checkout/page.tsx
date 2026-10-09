"use client";

import { CartOrderItems, CartOrderSummary } from "../components/cart-order-items";
import { useStore } from "../components/store-context";

export default function CheckoutPage() {
  const { cart, ready } = useStore();
  return (
    <main className="store-page site-redesign checkout-page">
      <div className="store-container">
        <header className="store-page-heading"><div><p className="store-eyebrow">Checkout review</p><h1>Review your order</h1><p className="store-lede">Confirm the products and quantities currently in your cart.</p></div><a className="store-text-link" href="/cart">← Back to cart</a></header>
        {!ready ? <div className="store-empty-state"><p>Loading your order…</p></div> : cart.length === 0 ? <section className="store-empty-state"><span className="store-empty-icon" aria-hidden="true">⌑</span><h2>Your cart is empty</h2><p>Add products before reviewing checkout.</p><a className="store-button store-button-primary" href="/shop">Browse products</a></section> : <>
          <div className="checkout-unavailable" role="status"><strong>Checkout is currently unavailable</strong><p>This project has no configured payment gateway or order-processing backend. Your cart is shown for review, but an order cannot be placed and no payment will be simulated.</p></div>
          <div className="cart-layout checkout-layout">
            <CartOrderItems readOnly />
            <div className="cart-summary-column"><CartOrderSummary compact /><button className="store-button store-button-primary cart-checkout-disabled" type="button" disabled>Order placement unavailable</button><a className="store-text-link checkout-continue-shopping" href="/shop">Continue shopping</a></div>
          </div>
        </>}
      </div>
    </main>
  );
}
