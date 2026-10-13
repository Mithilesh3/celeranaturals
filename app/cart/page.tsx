"use client";

import Link from "next/link";
import { CartOrderItems, CartOrderSummary } from "../components/cart-order-items";
import { useStore } from "../components/store-context";

export default function CartPage() {
  const { cart, ready } = useStore();
  return (
    <main className="store-page site-redesign cart-page">
      <div className="store-container">
        <header className="store-page-heading"><div><p className="store-eyebrow">Review your selection</p><h1>Your shopping cart</h1><p className="store-lede">Adjust quantities or save products for later.</p></div><Link className="store-text-link" href="/shop">Continue shopping →</Link></header>
        {!ready ? <div className="store-empty-state"><p>Loading your cart…</p></div> : cart.length === 0 ? <section className="store-empty-state cart-empty-state"><span className="store-empty-icon" aria-hidden="true">⌑</span><h2>Your cart is empty</h2><p>Find something for your wellness routine and it will appear here.</p><Link className="store-button store-button-primary" href="/shop">Browse products</Link></section> :
          <div className="cart-layout">
            <CartOrderItems />
            <div className="cart-summary-column"><CartOrderSummary /><Link className="store-button store-button-primary cart-checkout-link" href="/checkout">Review checkout →</Link><p className="cart-checkout-note">Online checkout and payment are not connected yet. No order or payment will be placed.</p></div>
          </div>}
      </div>
    </main>
  );
}
