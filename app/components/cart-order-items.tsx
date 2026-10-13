"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { categories } from "../../scripts/data.js";
import { calculateCartTotals, resolveCartRows, formatMoney, type CartDisplayRow } from "./cart-data";
import { useStore } from "./store-context";

function CartItemImage({ row }: { row: CartDisplayRow }) {
  const [failed, setFailed] = useState(false);
  if (failed || !row.product) return <span className="cart-item-image cart-image-fallback" aria-label="Product image unavailable">Image unavailable</span>;
  return <Link className="cart-item-image" href={`/product/${row.product.slug}`}>
    <Image src={`/${row.product.image}`} alt={row.product.name} width={1200} height={1200} sizes="132px" onError={() => setFailed(true)} />
  </Link>;
}

export function CartOrderItems({ readOnly = false }: { readOnly?: boolean }) {
  const { cart, wishlist, setQuantity, removeFromCart, toggleWishlist } = useStore();
  const rows = resolveCartRows(cart);

  return <section className="cart-items" aria-label="Items in your cart">
    {rows.map((row) => {
      const { id, qty, product } = row;
      if (!product) return <article className="cart-item-card cart-unavailable-item" key={id}>
        <div className="cart-item-image cart-image-fallback">Product unavailable</div>
        <div className="cart-item-main"><p className="commerce-product-category">Unavailable</p><h2>Product no longer available</h2><p className="cart-item-unit-price">This saved item is not in the current catalog.</p></div>
        {!readOnly && <div className="cart-item-actions"><button type="button" onClick={() => removeFromCart(id)}>Remove</button></div>}
      </article>;

      const category = categories.find((item) => item.slug === product.category)?.name ?? product.category;
      const available = product.availability === "in-stock";
      return <article className="cart-item-card" key={id}>
        <CartItemImage row={row} />
        <div className="cart-item-main">
          <p className="commerce-product-category">{category}</p>
          <h2><Link href={`/product/${product.slug}`}>{product.name}</Link></h2>
          <p className="cart-item-unit-price">{formatMoney(product.price)} <span>each</span></p>
          <p className={`cart-item-stock${available ? " is-available" : " is-unavailable"}`}>{available ? "In stock" : "Currently unavailable"}</p>
          {!readOnly && <div className="cart-quantity-control" aria-label={`Quantity for ${product.name}`}>
            <button type="button" aria-label={`Decrease quantity of ${product.name}`} onClick={() => setQuantity(id, qty - 1)} disabled={qty <= 1}>−</button>
            <output aria-label="Quantity">{qty}</output>
            <button type="button" aria-label={`Increase quantity of ${product.name}`} onClick={() => setQuantity(id, qty + 1)} disabled={!available}>+</button>
          </div>}
          {readOnly && <p className="cart-item-quantity">Quantity: {qty}</p>}
        </div>
        <div className="cart-item-actions">
          <strong>{formatMoney(product.price * qty)}</strong>
          {!readOnly && <>
            <button type="button" onClick={() => { removeFromCart(id); if (!wishlist.includes(id)) toggleWishlist(id); }}>Save for later</button>
            <button type="button" onClick={() => removeFromCart(id)}>Remove</button>
          </>}
        </div>
      </article>;
    })}
  </section>;
}

export function CartOrderSummary({ compact = false }: { compact?: boolean }) {
  const { cart } = useStore();
  const totals = calculateCartTotals(resolveCartRows(cart));
  return <aside className={`cart-summary-card${compact ? " checkout-summary-card" : ""}`} aria-label="Cart summary">
    <p className="store-eyebrow">Summary</p><h2>Order summary</h2>
    <div className="cart-summary-line"><span>Subtotal at list price</span><strong>{formatMoney(totals.subtotal)}</strong></div>
    <div className="cart-summary-line"><span>Product discounts</span><strong>{totals.discount ? `−${formatMoney(totals.discount)}` : formatMoney(0)}</strong></div>
    <div className="cart-summary-line"><span>Shipping</span><span>Not calculated</span></div>
    <div className="cart-summary-total"><span>Product total</span><strong>{formatMoney(totals.productTotal)}</strong></div>
    <p className="cart-checkout-note">Shipping and final payable amount cannot be calculated until a supported checkout is configured.</p>
  </aside>;
}
