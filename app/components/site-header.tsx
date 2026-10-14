"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "./store-context";
import { AccountMenu, MobileAccountSection } from "./account-menu";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const { cart, wishlist } = useStore();
  const pathname = usePathname();
  const cartCount = cart.reduce((sum, row) => sum + row.qty, 0);

  // While the drawer covers the screen it owns the viewport: Escape closes it
  // and the page behind must not scroll. The previous overflow value is
  // restored so closing can never leave the page stuck.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // A route change while the drawer is open would otherwise leave it covering
  // the new page.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <>
      <div className="top-strip" aria-label="Store assurances">
        <div className="top-strip-inner">
          <span>▣ Free Shipping Within Uttar Pradesh</span>
          <span>▢ Secure Payments</span>
          <span>◎ Shipping calculated at checkout</span>
        </div>
      </div>
      <header className="site-header">
        <div className="container nav-wrap">
          <Link href="/" className="brand" aria-label="Celeranaturals home">
            <Image className="logo-badge" src="/assets/images/brand/logo.png" alt="Celeranaturals" width={300} height={300} sizes="50px" priority />
            <div className="brand-title"><strong className="brand-name">CELERANATURALS</strong><span>By Celera Healthcare</span></div>
          </Link>
          <form className="mobile-header-search" action="/shop" method="get" role="search">
            <label className="mobile-header-search-label" htmlFor="mobile-product-search">Search products</label>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4" /><path d="m16 16 4.2 4.2" /></svg>
            <input id="mobile-product-search" name="q" type="search" placeholder="Search products…" />
          </form>
          <nav className="nav-links" aria-label="Primary navigation">
            <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={pathname === "/" ? "active" : ""}>Home</Link>
            <Link href="/shop" aria-current={pathname.startsWith("/shop") || pathname.startsWith("/product") ? "page" : undefined} className={pathname.startsWith("/shop") || pathname.startsWith("/product") ? "active" : ""}>Products</Link>
            <div className={`nav-dropdown${categoriesOpen ? " open" : ""}`}>
              <button className="nav-dropdown-trigger" type="button" aria-expanded={categoriesOpen} aria-haspopup="true" onClick={() => setCategoriesOpen((open) => !open)}>Categories<span className="nav-caret" aria-hidden="true" /></button>
              <div className="nav-dropdown-menu">
                <Link href="/shop?category=psyllium-husk" onClick={() => setCategoriesOpen(false)}>Psyllium Husk</Link>
                <Link href="/shop?category=vitamins-minerals" onClick={() => setCategoriesOpen(false)}>Vitamins and Minerals</Link>
                <Link href="/shop?category=probiotics" onClick={() => setCategoriesOpen(false)}>Probiotics</Link>
                <Link href="/shop?category=protein" onClick={() => setCategoriesOpen(false)}>Protein</Link>
                <Link className="nav-dropdown-all" href="/shop" onClick={() => setCategoriesOpen(false)}>View All Products →</Link>
              </div>
            </div>
            <Link href="/about" aria-current={pathname.startsWith("/about") ? "page" : undefined} className={pathname.startsWith("/about") ? "active" : ""}>About</Link>
            <Link href="/contact" aria-current={pathname.startsWith("/contact") ? "page" : undefined} className={pathname.startsWith("/contact") ? "active" : ""}>Contact</Link>
          </nav>
          <a className="brochure-link" href="/celera-healthcare-brochure.pdf" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v4h14v-4" /></svg>
            <span>Get Brochure</span>
          </a>
          <div className="icon-nav">
            <Link href="/shop" className="icon-btn header-search-link" aria-label="Browse and search products"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4" /><path d="m16 16 4.2 4.2" /></svg></Link>
            <Link href="/wishlist" className="icon-btn" aria-label={`Wishlist${wishlist.length ? `, ${wishlist.length} saved` : ""}`} aria-current={pathname.startsWith("/wishlist") ? "page" : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 8.8c0 4.1-8.4 9.2-8.4 9.2S3.6 12.9 3.6 8.8a4.3 4.3 0 0 1 8.4-1.2 4.3 4.3 0 0 1 8.4 1.2Z" /></svg><span className="count-dot" data-wish-count>{wishlist.length}</span></Link>
            <Link href="/cart" className="icon-btn" aria-label={`Cart${cartCount ? `, ${cartCount} items` : ""}`} aria-current={pathname.startsWith("/cart") ? "page" : undefined}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 1.9-1.5L21 8H6" /><circle cx="9.5" cy="19" r="1.2" /><circle cx="17.5" cy="19" r="1.2" /></svg><span className="count-dot" data-cart-count>{cartCount}</span></Link>
            <AccountMenu />
            <button className="icon-btn mobile-toggle" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><span className={`hamburger-icon${menuOpen ? " is-open" : ""}`} aria-hidden="true"><i /><i /><i /></span></button>
          </div>
        </div>
      </header>
      <div className={`scrim${menuOpen ? " show" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden={!menuOpen} />
      <aside id="mobile-navigation" className={`mobile-menu${menuOpen ? " open" : ""}`} aria-hidden={!menuOpen}>
        <div className="mobile-menu-heading"><strong>Explore</strong><button className="mobile-menu-close" type="button" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}>×</button></div>
        {/* Account first: signing in is the main unmet need of a first-time
            visitor, and after login this becomes the account section. */}
        <MobileAccountSection onNavigate={() => setMenuOpen(false)} />
        <nav aria-label="Mobile navigation">
          <Link href="/" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link href="/shop" onClick={() => setMenuOpen(false)}>Products</Link>
          <details className="mobile-category-group"><summary>Categories</summary>
            <Link href="/shop?category=psyllium-husk" onClick={() => setMenuOpen(false)}>Psyllium Husk</Link>
            <Link href="/shop?category=vitamins-minerals" onClick={() => setMenuOpen(false)}>Vitamins and Minerals</Link>
            <Link href="/shop?category=probiotics" onClick={() => setMenuOpen(false)}>Probiotics</Link>
            <Link href="/shop?category=protein" onClick={() => setMenuOpen(false)}>Protein</Link>
          </details>
          <Link href="/about" onClick={() => setMenuOpen(false)}>About</Link>
          <Link href="/contact" onClick={() => setMenuOpen(false)}>Contact</Link>
          <a className="mobile-brochure-link" href="/celera-healthcare-brochure.pdf" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v4h14v-4" /></svg>
            <span>Get Brochure</span>
          </a>
        </nav>
      </aside>
    </>
  );
}
