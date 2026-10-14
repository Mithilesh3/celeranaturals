"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCatalog } from "../../components/catalog-context";
import type { StoreProduct } from "../../../lib/catalog";
import { ProductCard } from "../../components/product-card";
import { useStore } from "../../components/store-context";

type Product = StoreProduct;
const money = (amount: number) => "₹" + new Intl.NumberFormat("en-IN").format(amount);

// Some catalog entries still point at remote gallery images. Those are left as
// plain <img> because no remote host is allowlisted in next.config.ts.
function GalleryImage({ src, alt, sizes, priority = false }: { src: string; alt: string; sizes: string; priority?: boolean }) {
  if (src.startsWith("http")) return <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} />;
  return <Image src={`/${src}`} alt={alt} width={1200} height={1200} sizes={sizes} priority={priority} />;
}

export function ProductDetail({ product }: { product: Product }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState("description");
  const [message, setMessage] = useState("");
  const { addToCart, wishlist, toggleWishlist } = useStore();
  const router = useRouter();
  const { products, categoryName } = useCatalog();
  const category = categoryName(product.category);
  const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 4);
  const images = product.images?.length ? product.images : [product.image];
  const tabs = ["description", "ingredients", "benefits", "how", "reviews"];
  const buyNow = () => { addToCart(product.id, quantity); router.push("/cart"); };
  const details: Record<string, React.ReactNode> = {
    description: <p>{product.description}</p>,
    ingredients: <ul>{product.ingredients.map((item) => <li key={item}>{item}</li>)}</ul>,
    benefits: <ul>{product.benefits.map((item) => <li key={item}>{item}</li>)}</ul>,
    how: <p>Take as directed on the product label. Use with adequate water and maintain consistent daily intake.</p>,
    // No review data is fabricated for products that have none.
    reviews: product.rating === null
      ? <p>No customer reviews yet for this product.</p>
      : <p>Customer rating: {product.rating}/5 from {product.reviewCount} reviews.</p>,
  };
  const wished = wishlist.includes(product.id);

  return (
    <main className="store-page site-redesign product-page">
      <div className="store-container">
        <nav className="store-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/shop">Shop</Link><span>/</span><span aria-current="page">{product.name}</span></nav>
        <section className="product-detail-layout">
          <div className="product-gallery">
            <div className="product-gallery-main"><GalleryImage src={images[imageIndex]} alt={product.name} sizes="(max-width: 760px) 92vw, 540px" priority /></div>
            {images.length > 1 && <div className="product-gallery-thumbnails" aria-label="Product images">{images.map((image, index) => <button className={imageIndex === index ? "is-active" : ""} type="button" aria-label={`Show product image ${index + 1}`} aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)} key={`${image}-${index}`}><GalleryImage src={image} alt="" sizes="78px" /></button>)}</div>}
          </div>
          <section className="product-purchase-panel" aria-labelledby="product-title">
            <p className="store-eyebrow">{category}</p><h1 id="product-title">{product.name}</h1>
            {product.rating !== null && <div className="product-rating-row"><span className="commerce-product-rating" aria-label={`${product.rating} out of 5 stars`}><span aria-hidden="true">{"★".repeat(Math.round(product.rating))}</span> {product.rating.toFixed(1)}</span><span>{product.reviewCount} customer reviews</span></div>}
            <div className="product-detail-price"><strong>{money(product.price)}</strong>{product.originalPrice > product.price && <del>{money(product.originalPrice)}</del>}{product.badge && <span>{product.badge}</span>}</div>
            <p className="product-detail-summary">{product.shortDescription}</p>
            <p className={`product-availability ${product.availability === "in-stock" ? "is-available" : "is-unavailable"}`}><span aria-hidden="true">●</span>{product.availability === "in-stock" ? "In stock" : "Currently unavailable"}</p>
            <div className="product-quantity-row"><span>Quantity</span><div className="product-quantity-control"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><output aria-label="Quantity">{quantity}</output><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)}>+</button></div></div>
            <div className="product-detail-actions"><button className="store-button store-button-primary" type="button" disabled={product.availability !== "in-stock"} onClick={() => { addToCart(product.id, quantity); setMessage("Added to cart"); }}>Add to Cart</button><button className="store-button store-button-secondary" type="button" disabled={product.availability !== "in-stock"} onClick={buyNow}>Add &amp; View Cart</button><button className={`product-detail-wishlist${wished ? " is-saved" : ""}`} type="button" aria-pressed={wished} onClick={() => { toggleWishlist(product.id); setMessage(wished ? "Removed from wishlist" : "Added to wishlist"); }}>{wished ? "♥ Saved" : "♡ Save"}</button></div>
            {message && <p className="product-action-message" role="status">{message}</p>}
            <div className="product-service-notes"><div><span aria-hidden="true">✓</span><p><strong>Free delivery</strong><br />Shipping calculated at checkout.</p></div><div><span aria-hidden="true">↺</span><p><strong>Need help?</strong><br /><Link href="/contact">Contact customer support</Link></p></div></div>
          </section>
        </section>

        <section className="product-information-section" aria-label="Product information">
          <div className="product-information-tabs" role="tablist" aria-label="Product information">
            {tabs.map((item) => <button key={item} type="button" role="tab" id={`product-tab-${item}`} aria-selected={tab === item} aria-controls="product-tab-panel" className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item === "how" ? "How to use" : item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
          <div className="product-information-panel" id="product-tab-panel" role="tabpanel" aria-labelledby={`product-tab-${tab}`}>{details[tab]}</div>
        </section>

        {related.length > 0 && <section className="related-products-section"><div className="store-section-heading"><p className="store-eyebrow">Keep exploring</p><h2>Related products</h2></div><div className="commerce-product-grid">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}
      </div>
    </main>
  );
}
