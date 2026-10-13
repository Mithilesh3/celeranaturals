"use client";

import Link from "next/link";
import { products } from "../../scripts/data.js";
import { ProductCard } from "../components/product-card";
import { useStore } from "../components/store-context";

export default function WishlistPage() {
  const { wishlist, ready } = useStore();
  const saved = wishlist.map((id) => products.find((product) => product.id === id)).filter((product) => product !== undefined);
  return (
    <main className="store-page site-redesign wishlist-page">
      <div className="store-container">
        <header className="store-page-heading"><div><p className="store-eyebrow">Your saved collection</p><h1>Wishlist</h1><p className="store-lede">Keep the products you’re considering together in one place.</p></div><Link className="store-text-link" href="/shop">Browse the collection →</Link></header>
        {!ready ? <div className="store-empty-state"><p>Loading your wishlist…</p></div> : saved.length === 0 ? <section className="store-empty-state"><span className="store-empty-icon" aria-hidden="true">♡</span><h2>Your wishlist is empty</h2><p>Save a product while browsing and it will appear here.</p><Link className="store-button store-button-primary" href="/shop">Explore products</Link></section> : <><p className="wishlist-count">{saved.length} saved {saved.length === 1 ? "product" : "products"}</p><div className="commerce-product-grid">{saved.map((product) => <ProductCard key={product.id} product={product} />)}</div></>}
      </div>
    </main>
  );
}
