"use client";

import { useState } from "react";
import { categories, products } from "../../scripts/data.js";
import { useStore } from "./store-context";

type Product = (typeof products)[number];
const money = (amount: number) => "₹" + new Intl.NumberFormat("en-IN").format(amount);

export function ProductCard({ product, showFeedback = false, showDiscountBadge = false, showBuyNow = false, buyNowHref = "/cart", catalogCard = false }: { product: Product; showFeedback?: boolean; showDiscountBadge?: boolean; showBuyNow?: boolean; buyNowHref?: string; catalogCard?: boolean }) {
  const { wishlist, toggleWishlist, addToCart } = useStore();
  const [message, setMessage] = useState("");
  const wished = wishlist.includes(product.id);
  const category = categories.find((item) => item.slug === product.category)?.name;
  const available = product.availability === "in-stock";
  const badge = product.badge || (showDiscountBadge && product.originalPrice > product.price ? "Sale" : "");

  return (
    <article className={`commerce-product-card${catalogCard ? " shop-product-card" : ""}`} data-product-slug={product.slug}>
      <div className="commerce-product-media">
        <a className="commerce-product-image-link" href={`/product/${product.slug}`} aria-label={`View ${product.name}`}>
          <img src={`/${product.image}`} alt={product.name} loading="lazy" />
        </a>
        {badge && <span className="commerce-product-badge">{badge}</span>}
        <button
          className={`commerce-wishlist-toggle${wished ? " is-saved" : ""}`}
          type="button"
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={wished}
          onClick={() => {
            toggleWishlist(product.id);
            setMessage(wished ? "Removed from wishlist" : "Added to wishlist");
          }}
        >{wished ? "♥" : "♡"}</button>
      </div>
      <div className="commerce-product-body">
        {!catalogCard && <p className="commerce-product-category">{category}</p>}
        <h2 className={catalogCard ? "shop-product-card__title" : "commerce-product-title"}><a href={`/product/${product.slug}`}>{product.name}</a></h2>
        {!catalogCard && <p className="commerce-product-description">{product.shortDescription}</p>}
        <div className="commerce-product-rating" aria-label={`${product.rating} out of 5 stars`}>
          <span aria-hidden="true">{"★".repeat(Math.round(product.rating))}</span>
          <span>{product.rating.toFixed(1)} ({product.reviewCount})</span>
        </div>
        <div className="commerce-product-price">
          <strong>{money(product.price)}</strong>
          {product.originalPrice > product.price && <del>{money(product.originalPrice)}</del>}
          <span className={available ? "in-stock" : "out-of-stock"}>{available ? "In stock" : "Out of stock"}</span>
        </div>
        <div className={`commerce-product-actions${showBuyNow ? " home-featured-actions" : ""}`}>
          <button
            className="store-button store-button-primary"
            type="button"
            disabled={!available}
            onClick={() => {
              addToCart(product.id);
              setMessage("Added to cart");
            }}
          ><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 1.9-1.5L21 8H6" /><circle cx="9.5" cy="19" r="1.2" /><circle cx="17.5" cy="19" r="1.2" /></svg><span>Add to Cart</span></button>
          {showBuyNow ? (
            <button
              className="store-button store-button-secondary home-buy-now"
              type="button"
              disabled={!available}
              onClick={() => {
                addToCart(product.id);
                window.location.assign(buyNowHref);
              }}
            ><span>Buy Now</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>
          ) : <a className="store-button store-button-secondary" href={`/product/${product.slug}`}>View Product</a>}
        </div>
        {message ? <span className={showFeedback ? "commerce-product-feedback" : "store-sr-only"} role="status" aria-live="polite">{message}</span> : showFeedback ? <span className="commerce-product-feedback" role="status" aria-live="polite">&nbsp;</span> : null}
      </div>
    </article>
  );
}
