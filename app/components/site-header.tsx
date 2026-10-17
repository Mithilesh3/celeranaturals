"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "./store-context";
import { AccountMenu, MobileAccountSection } from "./account-menu";

/**
 * The Categories menu, shared by the desktop dropdown and the mobile
 * accordion so the two cannot drift apart — the mobile list was missing
 * "View All Products" because it was a second hand-maintained copy.
 *
 * Each slug is checked against ShopClient's category list on arrival; an
 * unknown one silently falls back to "All Categories" rather than erroring,
 * so these must match the catalog exactly. Verified against the live catalog
 * by scripts/test-nav-dropdown.mjs, which follows every link and asserts the
 * shop lands on the matching filter.
 */
const CATEGORY_LINKS = [
  { href: "/shop?category=psyllium-husk", label: "Psyllium Husk" },
  { href: "/shop?category=vitamins-minerals", label: "Vitamins and Minerals" },
  { href: "/shop?category=probiotics", label: "Probiotics" },
  { href: "/shop?category=protein", label: "Protein" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const { cart, wishlist } = useStore();
  const pathname = usePathname();
  const cartCount = cart.reduce((sum, row) => sum + row.qty, 0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // An open dropdown has to be dismissible without picking something from it.
  // Previously nothing closed it: no outside click, no Escape, no route
  // change — so it sat open over the page until the trigger was clicked again.
  //
  // pointerdown rather than click, so the menu goes away on press instead of
  // lingering until release, and so a drag that starts outside still closes
  // it. The listener is registered only while open, which also means the very
  // press that opens the menu cannot immediately close it again.
  useEffect(() => {
    if (!categoriesOpen) return;

    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node | null;
      if (target && dropdownRef.current?.contains(target)) return;
      setCategoriesOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCategoriesOpen(false);
      // Focus would otherwise be lost to <body>, stranding keyboard users.
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [categoriesOpen]);

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

  // A route change while the drawer or dropdown is open would otherwise leave
  // it covering the new page. Clicking a menu link already closes the
  // dropdown, but back/forward and in-page links do not go through that
  // handler.
  useEffect(() => {
    setMenuOpen(false);
    setCategoriesOpen(false);
  }, [pathname]);

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
          <Link href="/" className="brand" aria-label="Celera Naturals home">
            <Image className="logo-badge" src="/assets/images/brand/logo.png" alt="Celera Naturals" width={300} height={300} sizes="50px" priority />
            <div className="brand-title"><strong className="brand-name">CELERA NATURALS</strong><span>By Celera Healthcare</span></div>
          </Link>
          <form className="mobile-header-search" action="/shop" method="get" role="search">
            <label className="mobile-header-search-label" htmlFor="mobile-product-search">Search products</label>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4" /><path d="m16 16 4.2 4.2" /></svg>
            <input id="mobile-product-search" name="q" type="search" placeholder="Search products…" />
          </form>
          <nav className="nav-links" aria-label="Primary navigation">
            <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={pathname === "/" ? "active" : ""}>Home</Link>
            <Link href="/shop" aria-current={pathname.startsWith("/shop") || pathname.startsWith("/product") ? "page" : undefined} className={pathname.startsWith("/shop") || pathname.startsWith("/product") ? "active" : ""}>Products</Link>
            <div className={`nav-dropdown${categoriesOpen ? " open" : ""}`} ref={dropdownRef}>
              <button
                className="nav-dropdown-trigger"
                type="button"
                ref={triggerRef}
                aria-expanded={categoriesOpen}
                aria-haspopup="true"
                aria-controls="nav-categories-menu"
                onClick={() => setCategoriesOpen((open) => !open)}
                // Down-arrow is the expected way to enter a disclosure menu
                // from the keyboard; without it the only route in was Tab,
                // which required the menu to already be open.
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown") return;
                  event.preventDefault();
                  setCategoriesOpen(true);
                  requestAnimationFrame(() => {
                    dropdownRef.current?.querySelector<HTMLAnchorElement>(".nav-dropdown-menu a")?.focus();
                  });
                }}
              >
                Categories<span className="nav-caret" aria-hidden="true" />
              </button>
              <div className="nav-dropdown-menu" id="nav-categories-menu">
                {CATEGORY_LINKS.map((item) => (
                  <Link href={item.href} key={item.href} onClick={() => setCategoriesOpen(false)}>{item.label}</Link>
                ))}
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
            {CATEGORY_LINKS.map((item) => (
              <Link href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>
            ))}
            <Link className="mobile-category-all" href="/shop" onClick={() => setMenuOpen(false)}>View All Products →</Link>
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
