"use client";

import { useMemo, useState } from "react";
import { categories, products } from "../../scripts/data.js";
import { ProductCard } from "../components/product-card";

const MAX_PRICE = 2000;
const PAGE_SIZE = 6;
const money = (amount: number) => new Intl.NumberFormat("en-IN").format(amount);

export function ShopClient({ initialCategory }: { initialCategory: string }) {
  const validCategory = categories.some((item) => item.slug === initialCategory) ? initialCategory : "all";
  const [category, setCategory] = useState(validCategory);
  const [availability, setAvailability] = useState("all");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  const [sort, setSort] = useState("featured");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = products.filter((product) => {
      const matchesTerm = !term || [product.name, product.shortDescription, product.category].some((value) => value.toLowerCase().includes(term));
      return matchesTerm && (category === "all" || product.category === category) &&
        (availability === "all" || product.availability === availability) &&
        product.price >= minPrice && product.price <= maxPrice;
    });
    if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [availability, category, maxPrice, minPrice, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const inStockCount = products.filter((product) => product.availability === "in-stock").length;
  const outOfStockCount = products.length - inStockCount;
  const categoryCount = (slug: string) => slug === "all" ? products.length : products.filter((product) => product.category === slug).length;

  const reset = () => {
    setCategory("all"); setAvailability("all"); setMinPrice(0); setMaxPrice(MAX_PRICE);
    setSort("featured"); setQuery(""); setPage(1);
  };

  return (
    <main className="store-page site-redesign catalog-page">
      <div className="store-container">
        <nav className="catalog-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><span aria-current="page">Shop</span></nav>
        <header className="catalog-hero">
          <div className="catalog-title-block">
            <svg className="catalog-leaf" viewBox="0 0 32 32" aria-hidden="true"><path d="M27.7 4.3C16.3 3.6 7.3 7.9 5.5 16.1c-1.1 5 2.6 9.4 7.1 8.4 8.2-1.8 12.5-10.8 12-20.2Z" /><path d="M4.3 28.2c4.6-7.4 10.1-12.7 18.2-17.3" /></svg>
            <div><h1>Shop Products</h1><p>Discover wellness essentials for a healthier you.</p></div>
          </div>
          <div className="catalog-trust-strip" aria-label="Shopping assurances">
            <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>100% Genuine Products</span>
            <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7h13v11H2zM15 10h4l3 3v5h-7z" /><circle cx="6.5" cy="19" r="1.5" /><circle cx="18.5" cy="19" r="1.5" /></svg>Safe &amp; Secure Checkout</span>
            <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M4 21h16M19 4l2 2-2 2" /></svg>Doctor Recommended</span>
          </div>
        </header>

        <div className="catalog-layout">
          {filtersOpen && <button className="catalog-filter-scrim" type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />}
          <aside className={`catalog-filters${filtersOpen ? " is-open" : ""}`} id="catalog-filters" aria-label="Product filters">
            <div className="catalog-filters-heading"><h2>Filters</h2><button type="button" className="catalog-filter-close" onClick={() => setFiltersOpen(false)} aria-label="Close filters">×</button></div>
            <fieldset><legend>Categories</legend>
              {[{ slug: "all", name: "All Categories" }, ...categories].map((item) => <label className="catalog-filter-option" key={item.slug}><input type="radio" name="category" value={item.slug} checked={category === item.slug} onChange={() => { setCategory(item.slug); setPage(1); }} /><span>{item.name}</span><small>({categoryCount(item.slug)})</small></label>)}
            </fieldset>
            <fieldset><legend>Availability</legend>
              {[{ value: "all", label: "All items", count: products.length }, { value: "in-stock", label: "In stock", count: inStockCount }, { value: "out-of-stock", label: "Out of stock", count: outOfStockCount }].map((item) => <label className="catalog-filter-option" key={item.value}><input type="radio" name="availability" value={item.value} checked={availability === item.value} onChange={() => { setAvailability(item.value); setPage(1); }} /><span>{item.label}</span><small>({item.count})</small></label>)}
            </fieldset>
            <fieldset className="catalog-price-filter"><legend>Price Range</legend>
              <label className="catalog-price-label" htmlFor="max-price-range">Up to ₹{money(maxPrice)}</label>
              <input id="max-price-range" type="range" min="0" max={MAX_PRICE} step="25" value={maxPrice} aria-label="Maximum price" onChange={(event) => { setMaxPrice(Math.max(minPrice, Number(event.target.value))); setPage(1); }} />
              <div className="catalog-price-inputs"><label><span>₹</span><input type="number" min="0" max={maxPrice} value={minPrice} aria-label="Minimum price" onChange={(event) => { const value = Math.max(0, Math.min(maxPrice, Number(event.target.value) || 0)); setMinPrice(value); setPage(1); }} /></label><label><span>₹</span><input type="number" min={minPrice} max={MAX_PRICE} value={maxPrice} aria-label="Maximum price" onChange={(event) => { const value = Math.min(MAX_PRICE, Math.max(minPrice, Number(event.target.value) || 0)); setMaxPrice(value); setPage(1); }} /></label></div>
              <label className="catalog-min-range-label" htmlFor="min-price-range">Minimum price: ₹{money(minPrice)}</label>
              <input id="min-price-range" type="range" min="0" max={maxPrice} step="25" value={minPrice} aria-label="Minimum price slider" onChange={(event) => { setMinPrice(Number(event.target.value)); setPage(1); }} />
            </fieldset>
            <div className="catalog-filter-buttons"><button type="button" className="store-button store-button-secondary" onClick={reset}>Reset filters</button><button type="button" className="store-button store-button-primary catalog-filter-apply" onClick={() => setFiltersOpen(false)}>Show {filteredProducts.length} products</button></div>
          </aside>

          <section className="catalog-results" aria-label="Product results">
            <div className="catalog-results-toolbar">
              <p className="catalog-product-count"><strong>{filteredProducts.length}</strong> {filteredProducts.length === 1 ? "product" : "products"} found</p>
              <div className="catalog-results-controls">
                <label className="catalog-search-field" htmlFor="shop-search"><span aria-hidden="true">⌕</span><input id="shop-search" type="search" placeholder="Search products" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
                <label className="catalog-sort" htmlFor="sort-select"><span>Sort by</span><select id="sort-select" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="rating">Top rated</option></select></label>
                <div className="catalog-view-toggle" role="group" aria-label="Product layout">
                  <button type="button" className={view === "grid" ? "is-active" : ""} aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/></svg></button>
                  <button type="button" className={view === "list" ? "is-active" : ""} aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10"/><circle cx="3.5" cy="5" r=".6"/><circle cx="3.5" cy="10" r=".6"/><circle cx="3.5" cy="15" r=".6"/></svg></button>
                </div>
              </div>
            </div>
            <button className="store-button store-button-secondary catalog-filter-trigger" type="button" aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={() => setFiltersOpen(true)}>Filters</button>
            {pageProducts.length ? <div className={`commerce-product-grid catalog-product-grid catalog-view-${view}`}>{pageProducts.map((product) => <ProductCard key={product.id} product={product} catalogCard showDiscountBadge showBuyNow showFeedback buyNowHref="/checkout" />)}</div> : <div className="store-empty-state"><span aria-hidden="true">⌕</span><h2>No products found</h2><p>Try another search or reset the filters to see the full collection.</p><button className="store-button store-button-secondary" type="button" onClick={reset}>Clear filters</button></div>}
            <nav className="catalog-pagination" aria-label="Product pages">
              <span>Showing {filteredProducts.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} of {filteredProducts.length}</span>
              <div><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>←</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" className={currentPage === pageNumber ? "is-active" : ""} aria-current={currentPage === pageNumber ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>→</button></div>
            </nav>
          </section>
        </div>
      </div>
    </main>
  );
}
