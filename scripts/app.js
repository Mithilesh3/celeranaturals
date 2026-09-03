import { categories, contactInfo, faq, products, testimonials, usps } from "./data.js";

const appState = {
  cart: readStore("cn_cart", []),
  wishlist: readStore("cn_wishlist", []),
  recentSearches: readStore("cn_recent", []),
  pageSize: 12,
  shopVisible: 12,
  scrollLocked: false
};

function readStore(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function stars(rating) {
  const rounded = Math.round(rating);
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

function formatPrice(value) {
  return `INR ${value.toLocaleString("en-IN")}`;
}

function getCategoryName(slug) {
  const found = categories.find((item) => item.slug === slug);
  return found ? found.name : "Wellness";
}

function productById(id) {
  return products.find((item) => item.id === id);
}

function serviceHref(title) {
  const normalized = String(title || "").toLowerCase();
  if (normalized.includes("shipping")) return "contact.html";
  if (normalized.includes("checkout") || normalized.includes("payment")) return "cart.html";
  if (normalized.includes("support")) return "contact.html";
  if (normalized.includes("quality") || normalized.includes("trust")) return "about.html";
  return "shop.html";
}

function bySlug(slug) {
  return products.find((item) => item.slug === slug);
}

function saveAndRefresh() {
  writeStore("cn_cart", appState.cart);
  writeStore("cn_wishlist", appState.wishlist);
  refreshCounters();
}

function refreshCounters() {
  const cartCount = document.querySelectorAll("[data-cart-count]");
  const wishCount = document.querySelectorAll("[data-wish-count]");
  cartCount.forEach((el) => (el.textContent = String(appState.cart.reduce((a, b) => a + b.qty, 0))));
  wishCount.forEach((el) => (el.textContent = String(appState.wishlist.length)));
}

function header(active) {
  const isShopFamily = active === "shop";
  const accountActive = active === "auth";

  return `
  <div class="top-strip" aria-label="Store assurances">
    <div class="top-strip-inner">
      <span><span aria-hidden="true">▣</span> Free Shipping Within Uttar Pradesh</span>
      <span><span aria-hidden="true">▢</span> Secure Payments</span>
      <span><span aria-hidden="true">◎</span> Shipping calculated at checkout</span>
    </div>
  </div>
  <header class="site-header" data-header>
    <div class="container nav-wrap">
      <a href="index.html" class="brand" aria-label="Celeranaturals home">
        <img class="logo-badge" src="assets/images/brand/logo.png" alt="Celeranaturals" />
        <div class="brand-title"><strong>CELERANATURALS</strong><span>By Celera Healthcare</span></div>
      </a>
      <nav class="nav-links" aria-label="Primary navigation">
        <a href="index.html" class="${active === "home" ? "active" : ""}">Home</a>
        <a href="shop.html" class="${isShopFamily ? "active" : ""}">Products</a>
        <div class="nav-dropdown" data-category-dropdown>
          <button class="nav-dropdown-trigger" type="button" data-category-trigger aria-expanded="false">Categories</button>
          <div class="nav-dropdown-menu" data-category-menu>
            <a href="shop.html?category=psyllium-husk">Psyllium Husk</a>
            <a href="shop.html?category=vitamins-minerals">Vitamins and Minerals</a>
            <a href="shop.html?category=probiotics">Probiotics</a>
            <a href="shop.html?category=protein">Protein</a>
            <a class="nav-dropdown-all" href="shop.html">View All Products →</a>
          </div>
        </div>
        <a href="about.html" class="${active === "about" ? "active" : ""}">About</a>
        <a href="contact.html" class="${active === "contact" ? "active" : ""}">Contact</a>
      </nav>
      <div class="icon-nav">
        <div class="header-search desktop-only">
          <input class="header-search-input" type="search" placeholder="Search products..." aria-label="Search products" />
          <button class="icon-btn icon-btn-search" data-open-search aria-label="Open search">⌕</button>
        </div>
        <button class="icon-btn mobile-only-search" data-open-search aria-label="Open search">⌕</button>
        <a href="wishlist.html" class="icon-btn" aria-label="Wishlist">♡<span class="count-dot" data-wish-count>0</span></a>
        <a href="cart.html" class="icon-btn" aria-label="Cart">🛒<span class="count-dot" data-cart-count>0</span></a>
        <a href="auth.html" class="btn btn-secondary desktop-only ${accountActive ? "active" : ""}" ${accountActive ? 'aria-current="page"' : ""}>Account</a>
        <button class="icon-btn mobile-toggle" data-open-menu aria-label="Open menu">☰</button>
      </div>
    </div>
  </header>
  <div class="scrim" data-scrim></div>
  <aside class="mobile-menu" data-mobile-menu>
    <button class="btn btn-ghost" data-close-menu>Close</button>
    <nav>
      <a href="index.html">Home</a>
      <a href="shop.html">Products</a>
      <details class="mobile-category-group">
        <summary>Categories</summary>
        <a href="shop.html?category=psyllium-husk">Psyllium Husk</a>
        <a href="shop.html?category=vitamins-minerals">Vitamins and Minerals</a>
        <a href="shop.html?category=probiotics">Probiotics</a>
        <a href="shop.html?category=protein">Protein</a>
        <a href="shop.html">View All Products →</a>
      </details>
      <a href="about.html">About</a>
      <a href="contact.html">Contact</a>
      <a href="auth.html">Login / Register</a>
    </nav>
  </aside>
  <div class="search-overlay" data-search aria-hidden="true">
    <div class="scrim" data-close-search></div>
    <div class="search-panel" role="dialog" aria-modal="true" aria-label="Search products">
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <input class="input" data-search-input placeholder="Search products or categories" style="flex:1;" />
        <button class="btn btn-ghost" data-close-search>Close</button>
      </div>
      <div style="margin-top:0.7rem;color:var(--muted);font-size:0.88rem;">Suggested: Isabgol, Vitamin D3, Probiotic, Protein</div>
      <div class="search-results" data-search-results></div>
    </div>
  </div>
  <div class="cart-drawer" data-cart-drawer aria-hidden="true">
    <div class="scrim" data-close-cart></div>
    <div class="drawer-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">Your Cart</h3>
        <button class="btn btn-ghost" data-close-cart>Close</button>
      </div>
      <div class="drawer-list" data-drawer-items></div>
      <div data-drawer-total></div>
    </div>
  </div>
  <div class="quick-modal" data-quick-modal aria-hidden="true">
    <div class="scrim" data-close-quick></div>
    <div class="modal-panel" data-quick-content></div>
  </div>
  <a
    class="whatsapp-float"
    href="https://wa.me/919811351137"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Chat with us on WhatsApp"
  >
    <span class="whatsapp-float-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" role="img" aria-hidden="true" focusable="false">
        <path
          fill="#25D366"
          d="M16.03 3.2c-7.02 0-12.72 5.69-12.72 12.72 0 2.24.59 4.43 1.71 6.36L3.2 28.8l6.69-1.75a12.69 12.69 0 0 0 6.14 1.57h.01c7.02 0 12.72-5.69 12.72-12.72S23.05 3.2 16.03 3.2z"
        />
        <path
          fill="#FFFFFF"
          d="M23.28 19.2c-.39-.2-2.29-1.13-2.65-1.26-.35-.13-.61-.2-.87.2-.26.39-1 1.26-1.23 1.52-.22.26-.45.29-.84.1-.39-.2-1.66-.61-3.16-1.95-1.17-1.04-1.96-2.32-2.19-2.71-.23-.39-.03-.6.17-.8.18-.18.39-.45.58-.68.19-.22.26-.39.39-.65.13-.26.07-.49-.03-.68-.1-.2-.87-2.1-1.19-2.88-.32-.77-.64-.65-.87-.66h-.74c-.26 0-.68.1-1.03.49-.35.39-1.35 1.32-1.35 3.22s1.38 3.74 1.58 4c.19.26 2.71 4.14 6.56 5.8.92.4 1.64.64 2.2.82.93.3 1.78.26 2.45.16.75-.11 2.29-.94 2.62-1.84.32-.9.32-1.67.23-1.84-.1-.16-.36-.26-.75-.45z"
        />
      </svg>
    </span>
  </a>
  <div class="toast-wrap" data-toasts></div>
  `;
}

function footer() {
  return `
    <footer>
      <div class="container footer-grid">
        <div>
          <div class="brand">
            <img class="logo-badge" src="assets/images/brand/logo.png" alt="Celeranaturals" />
            <div class="brand-title"><strong>CELERANATURALS</strong><span>By Celera Healthcare</span></div>
          </div>
          <p style="margin-top:0.8rem;color:#d6d0c3;line-height:1.7;">Celeranaturals by Celera Healthcare offers nutraceutical products across digestive care, vitamins, probiotics and protein categories.</p>
          <p style="margin:0.6rem 0 0;color:#d6d0c3;">Email: ${contactInfo.email}<br/>Support: ${contactInfo.supportPhone}</p>
        </div>
        <div>
          <h4 class="footer-title">Products</h4>
          <div class="footer-links">
            <a href="shop.html">Products</a>
            <a href="shop.html?category=psyllium-husk">Psyllium Husk</a>
            <a href="shop.html?category=vitamins-minerals">Vitamins and Minerals</a>
            <a href="shop.html?category=probiotics">Probiotics</a>
            <a href="shop.html?category=protein">Protein</a>
          </div>
        </div>
        <div>
          <h4 class="footer-title">Company</h4>
          <div class="footer-links">
            <a href="about.html">About Us</a>
            <a href="contact.html">Contact</a>
            <a href="auth.html">My Account</a>
            <a href="shop.html">All Products</a>
          </div>
        </div>
        <div>
          <h4 class="footer-title">Policies</h4>
          <div class="footer-links">
            <a href="https://celeranaturals.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <a href="https://celeranaturals.com/policies/refund-policy" target="_blank" rel="noopener noreferrer">Refund Policy</a>
            <a href="https://celeranaturals.com/policies/terms-of-service" target="_blank" rel="noopener noreferrer">Terms of Service</a>
            <a href="https://celeranaturals.com/policies/shipping-policy" target="_blank" rel="noopener noreferrer">Shipping Policy</a>
          </div>
        </div>
      </div>
      <div class="container copyright">© 2026 Celera Healthcare Pvt. Ltd. All rights reserved.</div>
    </footer>
  `;
}

function mountLayout() {
  const page = document.body.dataset.page || "home";
  const headSlot = document.querySelector("#site-header");
  const footSlot = document.querySelector("#site-footer");
  if (headSlot) {
    headSlot.innerHTML = header(page);
  }
  if (footSlot) {
    footSlot.innerHTML = footer();
  }
  bindGlobalUi();
  refreshCounters();
}

function lockBodyScroll(lock) {
  if (lock && !appState.scrollLocked) {
    document.body.style.overflow = "hidden";
    appState.scrollLocked = true;
  }
  if (!lock && appState.scrollLocked) {
    document.body.style.overflow = "";
    appState.scrollLocked = false;
  }
}

function showPanel(selector) {
  const panel = document.querySelector(selector);
  if (!panel) return;
  panel.classList.add("show");
  panel.setAttribute("aria-hidden", "false");
  lockBodyScroll(true);
}

function hidePanel(selector) {
  const panel = document.querySelector(selector);
  if (!panel) return;
  panel.classList.remove("show");
  panel.setAttribute("aria-hidden", "true");
  const activePanels = document.querySelectorAll(".search-overlay.show, .cart-drawer.show, .quick-modal.show, .filter-box.open");
  if (!activePanels.length) {
    lockBodyScroll(false);
  }
}

function toast(msg) {
  const wrap = document.querySelector("[data-toasts]");
  if (!wrap) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = msg;
  wrap.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function bindGlobalUi() {
  const headerEl = document.querySelector("[data-header]");
  const menu = document.querySelector("[data-mobile-menu]");
  const scrim = document.querySelector("[data-scrim]");
  const categoryDropdown = document.querySelector("[data-category-dropdown]");
  const categoryTrigger = document.querySelector("[data-category-trigger]");
  let lastCategoryPointerAt = 0;

  const closeCategoryDropdown = () => {
    categoryDropdown?.classList.remove("open");
    categoryTrigger?.setAttribute("aria-expanded", "false");
  };

  window.addEventListener("scroll", () => {
    if (!headerEl) return;
    if (window.scrollY > 20) {
      headerEl.classList.add("compact");
    } else {
      headerEl.classList.remove("compact");
    }
  });

  const toggleCategoryDropdown = (event) => {
    if (event.type === "click" && Date.now() - lastCategoryPointerAt < 350) return;
    if (event.type === "pointerup") {
      lastCategoryPointerAt = Date.now();
    }
    const isOpen = categoryDropdown?.classList.toggle("open") || false;
    categoryTrigger?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  categoryTrigger?.addEventListener("click", toggleCategoryDropdown);
  categoryTrigger?.addEventListener("pointerup", toggleCategoryDropdown);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!categoryDropdown?.contains(target)) {
      closeCategoryDropdown();
    }
  });

  document.querySelector("[data-open-menu]")?.addEventListener("click", () => {
    menu?.classList.add("open");
    scrim?.classList.add("show");
    lockBodyScroll(true);
  });

  document.querySelector("[data-close-menu]")?.addEventListener("click", closeAllPanels);
  scrim?.addEventListener("click", closeAllPanels);

  document.querySelectorAll("[data-open-search]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPanel("[data-search]");
      renderSearchResults("");
      setTimeout(() => document.querySelector("[data-search-input]")?.focus(), 60);
    });
  });

  document.querySelectorAll(".header-search-input").forEach((input) => {
    input.addEventListener("focus", () => {
      showPanel("[data-search]");
      renderSearchResults(input.value || "");
      setTimeout(() => document.querySelector("[data-search-input]")?.focus(), 60);
    });
  });

  document.querySelectorAll("[data-close-search]").forEach((btn) => btn.addEventListener("click", () => hidePanel("[data-search]")));
  document.querySelectorAll("[data-open-cart]").forEach((btn) => btn.addEventListener("click", openCartDrawer));
  document.querySelectorAll("[data-close-cart]").forEach((btn) => btn.addEventListener("click", () => hidePanel("[data-cart-drawer]")));
  document.querySelectorAll("[data-close-quick]").forEach((btn) => btn.addEventListener("click", () => hidePanel("[data-quick-modal]")));

  document.querySelector("[data-search-input]")?.addEventListener("input", (e) => {
    renderSearchResults(e.target.value || "");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeCategoryDropdown();
    closeAllPanels();
  });
}

function closeAllPanels() {
  document.querySelector("[data-category-dropdown]")?.classList.remove("open");
  document.querySelector("[data-category-trigger]")?.setAttribute("aria-expanded", "false");
  document.querySelector("[data-mobile-menu]")?.classList.remove("open");
  document.querySelector("[data-scrim]")?.classList.remove("show");
  ["[data-search]", "[data-cart-drawer]", "[data-quick-modal]"].forEach((selector) => {
    const panel = document.querySelector(selector);
    if (!panel) return;
    panel.classList.remove("show");
    panel.setAttribute("aria-hidden", "true");
  });
  closeShopFilterPanel();
  const activePanels = document.querySelectorAll(".search-overlay.show, .cart-drawer.show, .quick-modal.show, .mobile-menu.open, .filter-box.open");
  if (!activePanels.length) {
    lockBodyScroll(false);
  }
}

function openShopFilterPanel() {
  const panel = document.querySelector("#shop-filter-panel");
  if (!panel) return;
  panel.classList.add("open");
  document.querySelector(".filter-scrim")?.classList.add("show");
  lockBodyScroll(true);
}

function closeShopFilterPanel() {
  const panel = document.querySelector("#shop-filter-panel");
  if (!panel) return;
  panel.classList.remove("open");
  document.querySelector(".filter-scrim")?.classList.remove("show");
  const activePanels = document.querySelectorAll(".search-overlay.show, .cart-drawer.show, .quick-modal.show, .mobile-menu.open");
  if (!activePanels.length) {
    lockBodyScroll(false);
  }
}

function renderSearchResults(term) {
  const value = term.trim().toLowerCase();
  const target = document.querySelector("[data-search-results]");
  if (!target) return;

  const matched = products.filter((item) => {
    const cat = getCategoryName(item.category).toLowerCase();
    return item.name.toLowerCase().includes(value) || cat.includes(value);
  });

  if (!value) {
    const recent = appState.recentSearches.slice(0, 4);
    const suggestions = ["Isabgol", "Vitamin D3", "Probiotic", "Protein"];
    target.innerHTML = `
      <div class="search-suggestion-head">Suggested Searches</div>
      <div class="search-chip-row">
        ${suggestions.map((text) => `<button class="btn btn-ghost" data-search-pill="${text}">${text}</button>`).join("")}
      </div>
      ${
        recent.length
          ? `<div class="search-suggestion-head">Recent Searches</div>
      <div class="search-chip-row">${recent.map((text) => `<button class="btn btn-ghost" data-search-pill="${text}">${text}</button>`).join("")}</div>`
          : `<div class="empty-state">Start typing to search products and categories.</div>`
      }
    `;
    target.querySelectorAll("[data-search-pill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const q = btn.dataset.searchPill || "";
        const input = document.querySelector("[data-search-input]");
        if (input) {
          input.value = q;
          renderSearchResults(q);
        }
      });
    });
    return;
  }

  if (!matched.length) {
    target.innerHTML = `<div class="empty-state">No result for "${term}". Try Isabgol, D3 or Protein.</div>`;
    return;
  }

  target.innerHTML = matched
    .slice(0, 8)
    .map(
      (item) => `
      <a href="product.html?slug=${item.slug}" class="search-item" data-search-open="${item.slug}">
        <img src="${item.image}" alt="${item.name}" style="height:58px;object-fit:cover;border-radius:10px;" loading="lazy"/>
        <div>
          <div style="font-weight:600;">${item.name}</div>
          <div style="font-size:0.85rem;color:var(--muted);">${getCategoryName(item.category)} · ${formatPrice(item.price)}</div>
        </div>
      </a>
    `
    )
    .join("");

  appState.recentSearches = [term, ...appState.recentSearches.filter((item) => item !== term)].slice(0, 6);
  writeStore("cn_recent", appState.recentSearches);
}

function productCard(item) {
  const inWish = appState.wishlist.includes(item.id);
  return `
  <article class="product-card card reveal" data-product-slug="${item.slug}">
    <div class="product-media">
      <a href="product.html?slug=${item.slug}" aria-label="Open ${item.name}">
        <img src="${item.image}" alt="${item.name}" loading="lazy"/>
      </a>
      <div class="product-top">
        <span>${item.badge ? `<span class="tag ${item.badge.toLowerCase().includes("sale") ? "sale" : "new"}">${item.badge}</span>` : ""}</span>
        <button class="icon-btn" data-wish-toggle="${item.id}" aria-label="Toggle wishlist">${inWish ? "♥" : "♡"}</button>
      </div>
    </div>
    <div class="product-body">
      <p class="product-meta">${getCategoryName(item.category)}</p>
      <h3 class="product-title"><a href="product.html?slug=${item.slug}">${item.name}</a></h3>
      <div class="rating">${stars(item.rating)} (${item.reviewCount})</div>
      <div class="price-row"><span class="price">${formatPrice(item.price)}</span>${item.originalPrice ? `<span class="old-price">${formatPrice(item.originalPrice)}</span>` : ""}</div>
      <div class="product-actions">
        <button class="btn btn-primary" data-add-cart="${item.id}">Add</button>
        <button class="btn btn-ghost" data-quick-view="${item.id}">Quick View</button>
        <a class="btn btn-ghost" href="product.html?slug=${item.slug}">Details</a>
      </div>
    </div>
  </article>
  `;
}

function bindProductActions(scope = document) {
  scope.querySelectorAll("[data-add-cart]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.addCart;
      addToCart(id, 1);
    });
  });

  scope.querySelectorAll("[data-wish-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.wishToggle;
      toggleWish(id);
      btn.textContent = appState.wishlist.includes(id) ? "♥" : "♡";
    });
  });

  scope.querySelectorAll("[data-quick-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.quickView;
      const item = productById(id);
      if (!item) return;
      openQuickView(item);
    });
  });
}

function openQuickView(item) {
  const modal = document.querySelector("[data-quick-modal]");
  const content = document.querySelector("[data-quick-content]");
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="product-detail">
      <div>
        <img src="${item.image}" alt="${item.name}" style="border-radius:14px;aspect-ratio:1/1;object-fit:cover;"/>
      </div>
      <div>
        <p class="pill">Quick View</p>
        <h2 class="section-title" style="font-size:2rem;">${item.name}</h2>
        <p class="rating">${stars(item.rating)} (${item.reviewCount} reviews)</p>
        <div class="price-row" style="margin:0.5rem 0;">
          <span class="price" style="font-size:1.2rem;">${formatPrice(item.price)}</span>
          ${item.originalPrice ? `<span class="old-price">${formatPrice(item.originalPrice)}</span>` : ""}
        </div>
        <p>${item.shortDescription}</p>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          <button class="btn btn-primary" data-add-cart="${item.id}">Add to Cart</button>
          <a class="btn btn-secondary" href="product.html?slug=${item.slug}">Open Product Page</a>
          <button class="btn btn-ghost" data-close-quick>Close</button>
        </div>
      </div>
    </div>
  `;
  showPanel("[data-quick-modal]");
  content.querySelector("[data-close-quick]")?.addEventListener("click", () => hidePanel("[data-quick-modal]"));
  bindProductActions(content);
}

function toggleWish(id) {
  if (!id) return;
  if (appState.wishlist.includes(id)) {
    appState.wishlist = appState.wishlist.filter((item) => item !== id);
    toast("Removed from wishlist");
  } else {
    appState.wishlist.push(id);
    toast("Added to wishlist");
  }
  saveAndRefresh();
}

function addToCart(id, qty) {
  if (!id) return;
  const exists = appState.cart.find((item) => item.id === id);
  if (exists) {
    exists.qty += qty;
  } else {
    appState.cart.push({ id, qty });
  }
  saveAndRefresh();
  toast("Added to cart");
  openCartDrawer();
}

function setCartQty(id, qty) {
  const found = appState.cart.find((item) => item.id === id);
  if (!found) return;
  found.qty = Math.max(1, qty);
  saveAndRefresh();
}

function removeCartItem(id) {
  appState.cart = appState.cart.filter((item) => item.id !== id);
  saveAndRefresh();
}

function cartMath() {
  const subtotal = appState.cart.reduce((sum, row) => {
    const item = productById(row.id);
    return sum + (item ? item.price * row.qty : 0);
  }, 0);
  const discount = subtotal > 1200 ? 120 : 0;
  const shipping = subtotal > 0 ? 0 : 0;
  return {
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping
  };
}

function openCartDrawer() {
  const panel = document.querySelector("[data-cart-drawer]");
  const list = document.querySelector("[data-drawer-items]");
  const total = document.querySelector("[data-drawer-total]");
  if (!panel || !list || !total) return;

  showPanel("[data-cart-drawer]");

  if (!appState.cart.length) {
    list.innerHTML = `<div class="empty-state">Your cart is empty.</div>`;
    total.innerHTML = `<a href="shop.html" class="btn btn-primary" style="width:100%;text-align:center;display:block;">Shop Products</a>`;
    return;
  }

  list.innerHTML = appState.cart
    .map((row) => {
      const item = productById(row.id);
      if (!item) return "";
      return `
      <div class="drawer-item">
        <img src="${item.image}" alt="${item.name}" style="height:76px;object-fit:cover;border-radius:8px;"/>
        <div>
          <div style="font-size:0.9rem;font-weight:600;">${item.name}</div>
          <div style="font-size:0.82rem;color:var(--muted);">${formatPrice(item.price)} x ${row.qty}</div>
        </div>
        <button class="btn btn-ghost" data-remove-cart="${item.id}">Remove</button>
      </div>`;
    })
    .join("");

  const math = cartMath();
  total.innerHTML = `
    <div style="display:grid;gap:0.45rem;margin-bottom:0.7rem;">
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong>${formatPrice(math.subtotal)}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Discount</span><strong>- ${formatPrice(math.discount)}</strong></div>
      <div style="display:flex;justify-content:space-between;"><span>Total</span><strong>${formatPrice(math.total)}</strong></div>
    </div>
    <a href="cart.html" class="btn btn-primary" style="width:100%;text-align:center;display:block;">View Cart</a>
  `;

  list.querySelectorAll("[data-remove-cart]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeCartItem(btn.dataset.removeCart);
      openCartDrawer();
      toast("Removed from cart");
    });
  });
}

function initHeroSlider() {
  const slider = document.querySelector("[data-hero-slider]");
  if (!slider) return;

  const slides = Array.from(slider.querySelectorAll("[data-hero-slide]"));
  const dots = Array.from(slider.querySelectorAll("[data-hero-dot]"));
  if (slides.length < 2) return;

  let activeIndex = 0;
  let timerId;
  let firstCycle = true;
  let lastPointerControlAt = 0;

  const showSlide = (index) => {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      slide.classList.toggle("active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === activeIndex);
      dot.setAttribute("aria-selected", dotIndex === activeIndex ? "true" : "false");
    });
  };

  const start = () => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => {
      showSlide(activeIndex + 1);
      firstCycle = false;
      start();
    }, firstCycle ? 7200 : 5600);
  };

  const goTo = (index) => {
    firstCycle = false;
    showSlide(index);
    start();
  };

  const handleControl = (event) => {
    if (event.type === "click" && Date.now() - lastPointerControlAt < 350) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (event.type === "pointerup") {
      lastPointerControlAt = Date.now();
    }

    if (target.closest("[data-hero-prev]")) {
      goTo(activeIndex - 1);
      return;
    }

    if (target.closest("[data-hero-next]")) {
      goTo(activeIndex + 1);
      return;
    }

    const dot = target.closest("[data-hero-dot]");
    if (dot instanceof HTMLElement) {
      goTo(Number(dot.dataset.heroDot || 0));
    }
  };

  slider.addEventListener("click", handleControl);
  slider.addEventListener("pointerup", handleControl);

  showSlide(0);
  start();
}

function initHomePage() {
  const mount = document.querySelector("#home-products");
  const uspMount = document.querySelector("#home-usps");
  const catMount = document.querySelector("#home-categories");
  const testMount = document.querySelector("#home-testimonials");
  const faqMount = document.querySelector("#home-faq");

  initHeroSlider();

  if (!mount) return;

  if (uspMount) {
    uspMount.innerHTML = usps
      .map(
        (item) =>
          `<a class="service-item reveal" href="${serviceHref(item.title)}"><div class="service-icon">${item.icon || "•"}</div><div><div class="service-title">${item.title}</div><div class="service-copy">${item.copy}</div></div></a>`
      )
      .join("");
  }

  catMount.innerHTML = categories
    .map((cat) => {
      return `
      <article class="card category-tile reveal">
        <div class="category-thumb"><img src="${cat.image}" alt="${cat.name}" loading="lazy"/></div>
        <div class="category-content-clean">
          <h3>${cat.name}</h3>
          <p>${cat.description}</p>
          <a class="category-link" href="shop.html?category=${cat.slug}">Explore Products →</a>
        </div>
      </article>
    `;
    })
    .join("");

  mount.innerHTML = products.slice(0, 4).map(productCard).join("");

  testMount.innerHTML = testimonials.map((item) => `<article class="testimonial-line reveal"><div class="rating">${stars(item.rating)}</div><p>${item.review}</p><strong>${item.name}</strong></article>`).join("");

  faqMount.innerHTML = faq
    .map(
      (item) => `
      <details class="faq-item reveal">
        <summary>${item.q}</summary>
        <p>${item.a}</p>
      </details>`
    )
    .join("");

  bindProductActions();
}

function initShopPage() {
  const grid = document.querySelector("#shop-grid");
  if (!grid) return;

  document.querySelector("[data-open-shop-filters]")?.addEventListener("click", openShopFilterPanel);
  document.querySelector("[data-close-shop-filters]")?.addEventListener("click", closeShopFilterPanel);
  document.querySelector("[data-apply-filters]")?.addEventListener("click", () => {
    paint(true);
    closeShopFilterPanel();
  });

  const qs = new URLSearchParams(window.location.search);
  const state = {
    q: "",
    category: qs.get("category") || "all",
    availability: "all",
    sort: "featured",
    maxPrice: 2000
  };

  const categoryFilters = document.querySelector("#category-filters");
  categoryFilters.innerHTML =
    `<label class="filter-option"><input type="radio" name="category" value="all" ${state.category === "all" ? "checked" : ""}/> All</label>` +
    categories
      .map(
        (cat) =>
          `<label class="filter-option"><input type="radio" name="category" value="${cat.slug}" ${state.category === cat.slug ? "checked" : ""}/> ${cat.name}</label>`
      )
      .join("");

  function syncFilterUi() {
    document.querySelector(`#category-filters input[value="${state.category}"]`)?.setAttribute("checked", "checked");
    document.querySelectorAll('#category-filters input[name="category"]').forEach((input) => {
      input.checked = input.value === state.category;
    });
    document.querySelectorAll('input[name="availability"]').forEach((input) => {
      input.checked = input.value === state.availability;
    });
    const range = document.querySelector("#price-range");
    if (range) range.value = String(state.maxPrice);
    const search = document.querySelector("#shop-search");
    if (search) search.value = state.q;
    const sort = document.querySelector("#sort-select");
    if (sort) sort.value = state.sort;
    document.querySelector("#price-value").textContent = formatPrice(state.maxPrice);
  }

  function updateResultSummary(total) {
    const count = document.querySelector("#shop-count");
    if (count) count.textContent = `${total} products`;
    const summary = document.querySelector("#shop-results-line");
    if (!summary) return;
    if (!total) {
      summary.textContent = "Showing 0 results";
      return;
    }
    const start = 1;
    const end = Math.min(total, appState.shopVisible);
    summary.textContent = `Showing ${start}-${end} of ${total} results`;
  }

  function filtered() {
    let list = [...products];

    if (state.q.trim()) {
      const term = state.q.toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(term));
    }
    if (state.category !== "all") {
      list = list.filter((item) => item.category === state.category);
    }
    if (state.availability !== "all") {
      list = list.filter((item) => item.availability === state.availability);
    }

    list = list.filter((item) => item.price <= state.maxPrice);

    if (state.sort === "price-asc") list.sort((a, b) => a.price - b.price);
    if (state.sort === "price-desc") list.sort((a, b) => b.price - a.price);
    if (state.sort === "rating") list.sort((a, b) => b.rating - a.rating);

    return list;
  }

  function paint(resetVisible = false) {
    if (resetVisible) appState.shopVisible = appState.pageSize;
    const list = filtered();
    updateResultSummary(list.length);

    if (!list.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No products found for current filters.</div>`;
      document.querySelector("#load-more")?.setAttribute("hidden", "hidden");
      return;
    }

    grid.innerHTML = list.slice(0, appState.shopVisible).map(productCard).join("");
    bindProductActions();

    const loadBtn = document.querySelector("#load-more");
    if (list.length > appState.shopVisible) {
      loadBtn?.removeAttribute("hidden");
    } else {
      loadBtn?.setAttribute("hidden", "hidden");
    }
  }

  document.querySelector("#shop-search").addEventListener("input", (e) => {
    state.q = e.target.value || "";
    paint(true);
  });

  document.querySelector("#sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    paint(true);
  });

  document.querySelectorAll('input[name="category"]').forEach((input) => {
    input.addEventListener("change", (e) => {
      state.category = e.target.value;
      paint(true);
      closeShopFilterPanel();
    });
  });

  document.querySelectorAll('input[name="availability"]').forEach((input) => {
    input.addEventListener("change", (e) => {
      state.availability = e.target.value;
      paint(true);
      closeShopFilterPanel();
    });
  });

  document.querySelector("#price-range").addEventListener("input", (e) => {
    state.maxPrice = Number(e.target.value);
    document.querySelector("#price-value").textContent = formatPrice(state.maxPrice);
    paint(true);
  });

  document.querySelector("#load-more")?.addEventListener("click", () => {
    appState.shopVisible += appState.pageSize;
    paint();
  });

  document.querySelector("[data-reset-filters]")?.addEventListener("click", () => {
    state.q = "";
    state.category = "all";
    state.availability = "all";
    state.sort = "featured";
    state.maxPrice = 2000;
    syncFilterUi();
    paint(true);
  });

  syncFilterUi();
  paint(true);
}

function initProductPage() {
  const mount = document.querySelector("#product-detail");
  if (!mount) return;

  const slug = new URLSearchParams(window.location.search).get("slug");
  const item = bySlug(slug);

  if (!item) {
    mount.innerHTML = `
      <section class="section" style="padding-top:0.3rem;">
        <div class="info-card" style="max-width:760px;margin:0 auto;text-align:center;">
          <p class="pill">Product Not Found</p>
          <h1 class="section-title" style="margin:0.35rem 0 0.55rem;">This product is unavailable.</h1>
          <p class="section-sub" style="margin:0 auto 1rem;max-width:48ch;">The selected product link is invalid or no longer exists. Explore the complete catalog below.</p>
          <a class="btn btn-primary" href="shop.html">Browse Products</a>
        </div>
      </section>
    `;
    return;
  }

  mount.innerHTML = `
  <div class="product-detail">
    <div>
      <div class="gallery-main"><img src="${item.images[0]}" alt="${item.name}" id="main-image"/></div>
      <div class="thumb-grid">
        ${item.images
          .map(
            (img, index) => `<button data-thumb="${index}" aria-label="View image ${index + 1}"><img src="${img}" alt="${item.name} thumbnail ${index + 1}"/></button>`
          )
          .join("")}
      </div>
    </div>
    <div class="info-card product-info-card">
      <p class="pill">${getCategoryName(item.category)}</p>
      <h1 class="product-name">${item.name}</h1>
      <p class="rating">${stars(item.rating)} (${item.reviewCount} reviews)</p>
      <div class="price-row product-price-row">
        <span class="price product-price">${formatPrice(item.price)}</span>
        ${item.originalPrice ? `<span class="old-price">${formatPrice(item.originalPrice)}</span>` : ""}
      </div>
      <p>${item.shortDescription}</p>
      <div class="qty-row">
        <span>Qty:</span>
        <div class="qty-control">
          <button data-qty="minus">-</button>
          <input id="pd-qty" value="1" readonly/>
          <button data-qty="plus">+</button>
        </div>
      </div>
      <div class="product-action-row">
        <button class="btn btn-primary" data-add-current>Add to Cart</button>
        <button class="btn btn-secondary" data-buy-now>Buy Now</button>
        <button class="btn btn-ghost" data-wish-toggle="${item.id}">Wishlist</button>
      </div>
      <div class="product-meta-list">
        <div>Availability: ${item.availability === "in-stock" ? "In Stock" : "Out of Stock"}</div>
        <div>Shipping: Free prepaid shipping</div>
        <div>Dispatch: 1 to 2 business days</div>
      </div>
    </div>
  </div>
  <div class="section" style="padding-bottom:0;">
    <div class="tabs" id="pd-tabs">
      <button class="tab-btn active" data-tab="description">Description</button>
      <button class="tab-btn" data-tab="ingredients">Ingredients</button>
      <button class="tab-btn" data-tab="benefits">Benefits</button>
      <button class="tab-btn" data-tab="how">How to Use</button>
      <button class="tab-btn" data-tab="reviews">Reviews</button>
    </div>
    <div class="tab-pane active" data-pane="description">${item.description}</div>
    <div class="tab-pane" data-pane="ingredients"><ul>${item.ingredients.map((i) => `<li>${i}</li>`).join("")}</ul></div>
    <div class="tab-pane" data-pane="benefits"><ul>${item.benefits.map((i) => `<li>${i}</li>`).join("")}</ul></div>
    <div class="tab-pane" data-pane="how">Take as directed on the label. Use with adequate water and maintain consistent daily intake.</div>
    <div class="tab-pane" data-pane="reviews">Customer rating: ${item.rating}/5 from ${item.reviewCount} reviews.</div>
  </div>
  <section class="section">
    <h2 class="section-title" style="font-size:2.2rem;">Related Products</h2>
    <div class="product-grid" id="related-grid"></div>
  </section>
  `;

  const mainImage = document.querySelector("#main-image");
  document.querySelectorAll("[data-thumb]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.thumb);
      mainImage.src = item.images[idx];
    });
  });

  const qty = document.querySelector("#pd-qty");
  document.querySelectorAll("[data-qty]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const current = Number(qty.value);
      qty.value = btn.dataset.qty === "plus" ? String(current + 1) : String(Math.max(1, current - 1));
    });
  });

  document.querySelector("[data-add-current]").addEventListener("click", () => addToCart(item.id, Number(qty.value)));
  document.querySelector("[data-buy-now]").addEventListener("click", () => {
    addToCart(item.id, Number(qty.value));
    window.location.href = "cart.html";
  });

  document.querySelectorAll("#pd-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#pd-tabs .tab-btn").forEach((node) => node.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((node) => node.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector(`[data-pane="${btn.dataset.tab}"]`)?.classList.add("active");
    });
  });

  const related = products.filter((entry) => entry.category === item.category && entry.id !== item.id).slice(0, 4);
  document.querySelector("#related-grid").innerHTML = related.map(productCard).join("");
  bindProductActions();
}

function initCartPage() {
  const list = document.querySelector("#cart-list");
  if (!list) return;

  function paint() {
    if (!appState.cart.length) {
      list.innerHTML = `<div class="empty-state">Your cart is empty. Explore products to start your wellness routine.</div>`;
      document.querySelector("#cart-summary").innerHTML = `<a class="btn btn-primary" href="shop.html" style="display:block;text-align:center;">Continue Shopping</a>`;
      return;
    }

    list.innerHTML = appState.cart
      .map((row) => {
        const item = productById(row.id);
        if (!item) return "";
        return `
        <article class="list-item">
          <img src="${item.image}" alt="${item.name}"/>
          <div>
            <h3 style="margin:0;">${item.name}</h3>
            <p style="margin:0.25rem 0;color:var(--muted);">${getCategoryName(item.category)}</p>
            <div class="price">${formatPrice(item.price)}</div>
            <div class="qty-row" style="margin-top:0.45rem;">
              <div class="qty-control">
                <button data-row-qty="minus" data-row-id="${item.id}">-</button>
                <input value="${row.qty}" readonly/>
                <button data-row-qty="plus" data-row-id="${item.id}">+</button>
              </div>
            </div>
          </div>
          <div style="display:grid;gap:0.4rem;justify-items:end;">
            <strong>${formatPrice(item.price * row.qty)}</strong>
            <button class="btn btn-ghost" data-remove-row="${item.id}">Remove</button>
            <button class="btn btn-ghost" data-move-wish="${item.id}">Move to Wishlist</button>
          </div>
        </article>
      `;
      })
      .join("");

    const math = cartMath();
    document.querySelector("#cart-summary").innerHTML = `
      <div class="total-box">
        <h3 style="margin-top:0;">Order Summary</h3>
        <div style="display:grid;gap:0.45rem;">
          <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong>${formatPrice(math.subtotal)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Discount</span><strong>- ${formatPrice(math.discount)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Shipping</span><strong>${formatPrice(math.shipping)}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:1.1rem;"><span>Total</span><strong>${formatPrice(math.total)}</strong></div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:0.85rem;">Proceed to Checkout</button>
      </div>
    `;

    list.querySelectorAll("[data-row-qty]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.rowId;
        const row = appState.cart.find((entry) => entry.id === id);
        if (!row) return;
        const next = btn.dataset.rowQty === "plus" ? row.qty + 1 : row.qty - 1;
        setCartQty(id, Math.max(1, next));
        paint();
      });
    });

    list.querySelectorAll("[data-remove-row]").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeCartItem(btn.dataset.removeRow);
        paint();
      });
    });

    list.querySelectorAll("[data-move-wish]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.moveWish;
        removeCartItem(id);
        if (!appState.wishlist.includes(id)) appState.wishlist.push(id);
        saveAndRefresh();
        paint();
      });
    });
  }

  paint();
}

function initWishlistPage() {
  const list = document.querySelector("#wishlist-grid");
  if (!list) return;

  if (!appState.wishlist.length) {
    list.innerHTML = `<div class="empty-state">No saved items yet. Add products to your wishlist for quick access.<div style="margin-top:0.8rem;"><a class="btn btn-primary" href="shop.html">Explore Products</a></div></div>`;
    return;
  }

  const liked = appState.wishlist.map(productById).filter(Boolean);
  list.innerHTML = liked.map(productCard).join("");
  bindProductActions();
}

function initAuthPage() {
  const tabs = document.querySelectorAll("[data-auth-tab]");
  if (!tabs.length) return;

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".auth-form").forEach((form) => form.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector(`[data-auth-form="${btn.dataset.authTab}"]`)?.classList.add("active");
    });
  });

  document.querySelectorAll("[data-pass-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.querySelector(`#${btn.dataset.passToggle}`);
      if (!target) return;
      target.type = target.type === "password" ? "text" : "password";
      btn.textContent = target.type === "password" ? "Show" : "Hide";
    });
  });

  document.querySelectorAll(".auth-form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const requiredFields = Array.from(form.querySelectorAll("input[required]"));
      const hasError = requiredFields.some((input) => !String(input.value || "").trim());
      if (hasError) {
        toast("Please fill all required fields.");
        return;
      }
      toast("Thank you. Your request has been captured.");
    });
  });
}

function initContactPage() {
  const form = document.querySelector("#contact-form");
  if (!form) return;

  document.querySelector("#contact-meta").innerHTML = `
    <div class="contact-box">
      <h3 class="contact-title">Contact Information</h3>
      <p><strong>${contactInfo.company}</strong></p>
      <p>${contactInfo.address}</p>
      <p>Email: ${contactInfo.email}</p>
      <p>Support: ${contactInfo.supportPhone}</p>
      <p>Shipping support: ${contactInfo.shippingPhone}</p>
      <p>Hours: ${contactInfo.supportHours}</p>
    </div>
    <div class="contact-box support-note">
      <h3 class="contact-title">Shipping and Delivery Support</h3>
      <p>Order processing: 1-2 business days after payment confirmation.</p>
      <p>Typical delivery: 3-5 business days in metro cities and 5-7 business days in non-metro regions.</p>
    </div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.querySelector("#name").value.trim();
    const email = form.querySelector("#email").value.trim();
    const msg = form.querySelector("#message").value.trim();

    if (!name || !email || !msg) {
      toast("Please complete all required fields.");
      return;
    }
    toast("Thank you. Our support team will connect with you shortly.");
    form.reset();
  });
}

function initAboutPage() {
  const target = document.querySelector("#about-values");
  if (!target) return;

  target.innerHTML = `
    <article class="trust-item reveal"><div class="trust-label">Category Logic</div><div class="trust-copy">Products are organized by how customers shop: Psyllium Husk, Vitamins and Minerals, Probiotics and Protein.</div></article>
    <article class="trust-item reveal"><div class="trust-label">Clear Product Information</div><div class="trust-copy">Product pages prioritize dose format, pricing, key details and direct CTA flow before secondary content.</div></article>
    <article class="trust-item reveal"><div class="trust-label">Policy Visibility</div><div class="trust-copy">Shipping and support information is surfaced early so buyers can make informed decisions before ordering.</div></article>
    <article class="trust-item reveal"><div class="trust-label">Support Access</div><div class="trust-copy">Contact phone and email are consistently available for order, delivery and product-related assistance.</div></article>
  `;
}

function initReveals() {
  const revealEls = Array.from(document.querySelectorAll(".reveal"));
  if (!revealEls.length) return;

  const showAll = () => {
    revealEls.forEach((el) => el.classList.add("visible"));
  };

  if (!("IntersectionObserver" in window)) {
    showAll();
    return;
  }

  let observedAny = false;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          observedAny = true;
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealEls.forEach((el) => observer.observe(el));

  // Fallback for environments where observer callbacks may be delayed or skipped.
  setTimeout(() => {
    if (!observedAny) {
      showAll();
      observer.disconnect();
    }
  }, 900);
}

function initNewsletter() {
  const forms = document.querySelectorAll("[data-newsletter]");
  forms.forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input[type='email']");
      if (!input.value.trim()) {
        toast("Please enter a valid email.");
        return;
      }
      toast("Thanks for subscribing to Celeranaturals updates.");
      input.value = "";
    });
  });
}

mountLayout();
initHomePage();
initShopPage();
initProductPage();
initCartPage();
initWishlistPage();
initAuthPage();
initAboutPage();
initContactPage();
initNewsletter();
initReveals();
