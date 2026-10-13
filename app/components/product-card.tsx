"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { categories, products } from "../../scripts/data.js";
import { useStore } from "./store-context";

type Product = (typeof products)[number];
const money = (amount: number) => "₹" + new Intl.NumberFormat("en-IN").format(amount);

// The source photos are framed inconsistently: the two JPEGs run nearly edge to
// edge while the PNGs carry 25-32% baked-in white margin, so identical CSS boxes
// still render the packaging at very different sizes. These factors scale each
// image so its longest side covers the same share of the frame. Derived from the
// measured non-white bounding box of each file as TARGET / maxFraction, where
// TARGET is the share of the frame the packaging should occupy. Because the
// source canvases are square, this stays correct at every container size.
const IMAGE_FRAME_SCALE: Record<string, number> = {
  "assets/images/products/isabgol-main.jpg": 0.79, // maxFraction ~0.99 (full-bleed height)
  "assets/images/products/celd3.jpg": 0.80,        // maxFraction ~0.98 (full-bleed width)
  "assets/images/products/sporcel.png": 1.09,      // maxFraction 0.714
  "assets/images/products/celepro.png": 1.04,      // maxFraction 0.751
  "assets/images/products/c-cal-xt.png": 1.04,     // maxFraction 0.751
  "assets/images/products/c-cal-forte.png": 1.15,  // maxFraction 0.676
};

export function ProductCard({ product, showFeedback = false, showDiscountBadge = false, showBuyNow = false, buyNowHref = "/cart", catalogCard = false }: { product: Product; showFeedback?: boolean; showDiscountBadge?: boolean; showBuyNow?: boolean; buyNowHref?: string; catalogCard?: boolean }) {
  const { wishlist, toggleWishlist, addToCart } = useStore();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const wished = wishlist.includes(product.id);
  const category = categories.find((item) => item.slug === product.category)?.name;
  const available = product.availability === "in-stock";
  const discounted = product.originalPrice > product.price;
  const discountPercent = discounted ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;
  const badge = product.badge || (showDiscountBadge && discounted ? "Sale" : "");

  return (
    <article className={`commerce-product-card${catalogCard ? " shop-product-card" : ""}`} data-product-slug={product.slug}>
      <div className="commerce-product-media" style={{ "--product-image-scale": IMAGE_FRAME_SCALE[product.image] ?? 1 } as CSSProperties}>
        <Link className="commerce-product-image-link" href={`/product/${product.slug}`} aria-label={`View ${product.name}`}>
          <Image src={`/${product.image}`} alt={product.name} width={1200} height={1200} sizes="(max-width: 560px) 46vw, (max-width: 1100px) 31vw, 280px" loading="lazy" />
        </Link>
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
        <p className="commerce-product-category">{category}</p>
        <h2 className={catalogCard ? "shop-product-card__title" : "commerce-product-title"}><Link href={`/product/${product.slug}`}>{product.name}</Link></h2>
        <p className="commerce-product-description">{product.shortDescription}</p>
        <div className="commerce-product-rating" aria-label={`${product.rating} out of 5 stars`}>
          <span aria-hidden="true">{"★".repeat(Math.round(product.rating))}</span>
          <span>{product.rating.toFixed(1)} ({product.reviewCount})</span>
        </div>
        <div className="commerce-product-price">
          <strong>{money(product.price)}</strong>
          {discounted && <del>{money(product.originalPrice)}</del>}
          {discounted && catalogCard && <span className="commerce-product-discount">{discountPercent}% off</span>}
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
                router.push(buyNowHref);
              }}
            ><span>Buy Now</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>
          ) : <Link className="store-button store-button-secondary" href={`/product/${product.slug}`}>View Product</Link>}
        </div>
        {message ? <span className={showFeedback ? "commerce-product-feedback" : "store-sr-only"} role="status" aria-live="polite">{message}</span> : showFeedback ? <span className="commerce-product-feedback" role="status" aria-live="polite">&nbsp;</span> : null}
      </div>
    </article>
  );
}
