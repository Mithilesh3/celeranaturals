"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { getFirebaseAuth } from "../components/firebase";
import {
  ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, PRODUCT_BADGES, discountPercent, imageSrc,
  normalizeProductInput, slugify, validateProductInput,
  type CatalogCategory, type CatalogProduct, type ProductInput,
} from "../../lib/catalog";
import { formatIST } from "../../lib/orders";

/**
 * Product management for the admin panel.
 *
 * Writes go to /api/admin/products, which re-validates everything server-side
 * and is gated by the Firebase ID-token + ADMIN_EMAILS check. Nothing here is
 * trusted by the server; the inline validation exists only to give the
 * operator fast feedback.
 */
async function api(path: string, init: RequestInit = {}) {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

const rupees = (amount: number) => "₹" + new Intl.NumberFormat("en-IN").format(amount);

type StorageStatus = { available: true; bucket: string } | { available: false; reason: string; setup: string[] };

const EMPTY: ProductInput = {
  name: "", slug: "", category: "", mrp: 0, salePrice: null, sku: "", stockQty: 0,
  published: false, image: "", images: [], shortDescription: "", description: "",
  benefits: [], ingredients: [], badge: "",
};

const toInput = (product: CatalogProduct): ProductInput => ({
  name: product.name, slug: product.slug, category: product.category,
  mrp: product.mrp, salePrice: product.salePrice, sku: product.sku,
  stockQty: product.stockQty, published: product.published, image: product.image,
  images: product.images, shortDescription: product.shortDescription,
  description: product.description, benefits: product.benefits,
  ingredients: product.ingredients, badge: product.badge,
});

export function Products() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [editing, setEditing] = useState<CatalogProduct | "new" | null>(null);
  const [busyId, setBusyId] = useState("");
  const [confirmArchive, setConfirmArchive] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api("/api/admin/products");
      if (!response.ok) { setError((await response.json()).error ?? "Could not load products."); setProducts([]); return; }
      const data = await response.json();
      setProducts(data.products);
      setCategories(data.categories);
    } catch { setError("Network problem loading products."); setProducts([]); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? []).filter((product) => {
      const matches = !term || [product.name, product.slug, product.sku].some((value) => value.toLowerCase().includes(term));
      const state = product.archived ? "archived" : product.published ? "published" : "draft";
      return matches && (filter === "all" ? !product.archived || filter === "all" : state === filter);
    });
  }, [products, search, filter]);

  const flag = async (product: CatalogProduct, body: Record<string, boolean>, label: string) => {
    setBusyId(product.id); setError(""); setNotice("");
    try {
      const response = await api(`/api/admin/products/${product.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!response.ok) { setError((await response.json()).error ?? "Update failed."); return; }
      setNotice(`${product.name} ${label}.`);
      await load();
    } catch { setError("Network problem."); }
    finally { setBusyId(""); }
  };

  const archive = async (product: CatalogProduct) => {
    setBusyId(product.id); setError(""); setNotice("");
    try {
      const response = await api(`/api/admin/products/${product.id}`, { method: "DELETE" });
      if (!response.ok) { setError((await response.json()).error ?? "Could not archive."); return; }
      setNotice(`${product.name} archived. Past orders are unaffected.`);
      setConfirmArchive("");
      await load();
    } catch { setError("Network problem."); }
    finally { setBusyId(""); }
  };

  if (editing !== null) {
    return (
      <ProductForm
        product={editing === "new" ? null : editing}
        categories={categories}
        onCancel={() => setEditing(null)}
        onSaved={async (message) => { setEditing(null); setNotice(message); await load(); }}
      />
    );
  }

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2>Products</h2>
        <div className="admin-filters">
          <input placeholder="Search name, slug or SKU" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search products" />
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter by status">
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <button className="store-button store-button-primary" type="button" onClick={() => setEditing("new")}>+ Add Product</button>
        </div>
      </div>

      {error && <p className="admin-state admin-state--error">{error}</p>}
      {notice && <p className="admin-state admin-state--ok" role="status">{notice}</p>}

      {products === null ? <p className="admin-state">Loading products…</p>
        : visible.length === 0 ? (
          <div className="admin-empty">
            <h3>{products.length === 0 ? "No products yet" : "No products match this filter"}</h3>
            <p>{products.length === 0
              ? "Add your first product and publish it to see it on the website."
              : "Try a different search term or status filter."}</p>
            {products.length === 0 && (
              <button className="store-button store-button-primary" type="button" onClick={() => setEditing("new")}>+ Add Product</button>
            )}
          </div>
        ) : (
          <div className="admin-products">
            {visible.map((product) => {
              const price = product.salePrice !== null && product.salePrice < product.mrp ? product.salePrice : product.mrp;
              const off = discountPercent({ price, originalPrice: product.mrp });
              const state = product.archived ? "archived" : product.published ? "published" : "draft";
              return (
                <article className={`admin-product admin-product--${state}`} key={product.id}>
                  <div className="admin-product__thumb">
                    {product.image
                      ? <Image src={imageSrc(product.image)} alt="" width={120} height={120} unoptimized={product.image.startsWith("http")} />
                      : <span aria-hidden="true">—</span>}
                  </div>
                  <div className="admin-product__main">
                    <h3>{product.name || "Untitled product"}</h3>
                    <p className="admin-product__meta">
                      {categories.find((c) => c.slug === product.category)?.name ?? (product.category || "No category")}
                      {product.sku && <> · SKU {product.sku}</>}
                      <> · /{product.slug}</>
                    </p>
                    <p className="admin-product__price">
                      <strong>{rupees(price)}</strong>
                      {off > 0 && <><del>{rupees(product.mrp)}</del><span className="admin-product__off">{off}% off</span></>}
                    </p>
                  </div>
                  <div className="admin-product__facts">
                    <span className={product.stockQty > 0 ? "admin-stock" : "admin-stock admin-stock--out"}>
                      {product.stockQty > 0 ? `${product.stockQty} in stock` : "Out of stock"}
                    </span>
                    <span className={`track-pill track-pill--${state === "published" ? "delivered" : state === "archived" ? "cancelled" : "pending"}`}>
                      {state === "published" ? "Published" : state === "archived" ? "Archived" : "Draft"}
                    </span>
                    {product.updatedAt && <small>Updated {formatIST(product.updatedAt)}</small>}
                  </div>
                  <div className="admin-product__actions">
                    <button type="button" className="panel__link" disabled={busyId === product.id} onClick={() => setEditing(product)}>Edit</button>
                    {!product.archived && (
                      <button type="button" className="panel__link" disabled={busyId === product.id}
                        onClick={() => void flag(product, { published: !product.published }, product.published ? "unpublished" : "published")}>
                        {product.published ? "Unpublish" : "Publish"}
                      </button>
                    )}
                    {product.archived ? (
                      <button type="button" className="panel__link" disabled={busyId === product.id}
                        onClick={() => void flag(product, { archived: false }, "restored as a draft")}>Restore</button>
                    ) : confirmArchive === product.id ? (
                      <>
                        {/* Archive rather than delete: orders reference products. */}
                        <span className="admin-product__confirm">Archive and remove from the website?</span>
                        <button type="button" className="panel__link panel__link--danger" disabled={busyId === product.id} onClick={() => void archive(product)}>Yes, archive</button>
                        <button type="button" className="panel__link" onClick={() => setConfirmArchive("")}>Keep</button>
                      </>
                    ) : (
                      <button type="button" className="panel__link panel__link--danger" disabled={busyId === product.id} onClick={() => setConfirmArchive(product.id)}>Archive</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
    </section>
  );
}

function ProductForm({
  product, categories, onCancel, onSaved,
}: {
  product: CatalogProduct | null;
  categories: CatalogCategory[];
  onCancel: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState<ProductInput>(product ? toInput(product) : EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<string[]>([]);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await api("/api/admin/media");
        if (!response.ok) return;
        const data = await response.json();
        setMedia(data.images ?? []);
        setStorage(data.storage ?? null);
      } catch { /* the picker simply stays empty */ }
    })();
  }, []);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // The slug follows the name until the operator edits it themselves.
  const setName = (name: string) =>
    setForm((current) => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name) }));

  const activeCategories = categories.filter((category) => category.active || category.slug === form.category);
  const problems = validateProductInput(normalizeProductInput(form), activeCategories.map((c) => c.slug));
  const price = form.salePrice !== null && form.salePrice < form.mrp ? form.salePrice : form.mrp;
  const off = discountPercent({ price, originalPrice: form.mrp });

  const save = async (publish: boolean) => {
    if (busy) return;
    const payload = { ...form, published: publish };
    const check = validateProductInput(normalizeProductInput(payload), activeCategories.map((c) => c.slug));
    if (check.length) { setError(check.join(" ")); return; }

    setBusy(true); setError("");
    try {
      const response = product
        ? await api(`/api/admin/products/${product.id}`, { method: "PUT", body: JSON.stringify({ product: payload }) })
        : await api("/api/admin/products", { method: "POST", body: JSON.stringify({ product: payload }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not save the product."); return; }
      await onSaved(
        publish
          ? `${payload.name} saved and published — it is now live on the website.`
          : `${payload.name} saved as a draft. It is not visible on the website.`,
      );
    } catch { setError("Network problem. The product was not saved."); }
    finally { setBusy(false); }
  };

  const upload = async (file: File) => {
    setUploadError("");
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { setUploadError("Choose a JPEG, PNG or WebP image."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setUploadError(`Image must be ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB or smaller.`); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await api("/api/admin/media/upload", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) { setUploadError(data.error ?? "Upload failed."); return; }
      setForm((current) => ({ ...current, image: data.url, images: [data.url, ...current.images.filter((i) => i !== data.url)] }));
    } catch { setUploadError("Upload failed."); }
    finally { setBusy(false); }
  };

  return (
    <section className="admin-card admin-form">
      <div className="admin-card__head">
        <h2>{product ? "Edit product" : "Add product"}</h2>
        <button type="button" className="panel__link" onClick={onCancel}>← Back to products</button>
      </div>

      {error && <p className="admin-state admin-state--error" role="alert">{error}</p>}

      <fieldset className="admin-fieldset">
        <legend>Basic information</legend>
        <label className="checkout-field" htmlFor="p-name">
          <span>Product name *</span>
          <input id="p-name" value={form.name} maxLength={160} disabled={busy} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="checkout-field" htmlFor="p-slug">
          <span>URL slug</span>
          <input id="p-slug" value={form.slug} maxLength={80} disabled={busy}
            onChange={(event) => { setSlugEdited(true); set("slug", slugify(event.target.value)); }} />
          <small className="admin-note">Page address: /product/{form.slug || "…"}</small>
        </label>
        <label className="checkout-field" htmlFor="p-category">
          <span>Category *</span>
          <input id="p-category" list="p-category-options" value={form.category} disabled={busy}
            placeholder="Type to search categories"
            onChange={(event) => set("category", event.target.value)} />
          <datalist id="p-category-options">
            {activeCategories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
          </datalist>
          <small className="admin-note">
            {activeCategories.map((c) => c.name).join(" · ") || "No categories configured."}
          </small>
        </label>
        <label className="checkout-field" htmlFor="p-short">
          <span>Short description {form.published && "*"}</span>
          <input id="p-short" value={form.shortDescription} maxLength={300} disabled={busy} onChange={(event) => set("shortDescription", event.target.value)} />
        </label>
        <label className="checkout-field" htmlFor="p-desc">
          <span>Full description</span>
          <textarea id="p-desc" rows={4} value={form.description} maxLength={4000} disabled={busy} onChange={(event) => set("description", event.target.value)} />
        </label>
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Pricing</legend>
        <div className="admin-form__row">
          <label className="checkout-field" htmlFor="p-mrp">
            <span>Regular price (₹) *</span>
            <input id="p-mrp" type="number" min={0} step={1} value={form.mrp} disabled={busy}
              onChange={(event) => set("mrp", Math.max(0, Number(event.target.value) || 0))} />
          </label>
          <label className="checkout-field" htmlFor="p-sale">
            <span>Sale price (₹) — optional</span>
            <input id="p-sale" type="number" min={0} step={1} value={form.salePrice ?? ""} disabled={busy}
              onChange={(event) => set("salePrice", event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0))} />
          </label>
        </div>
        <p className="admin-price-preview">
          Customers pay <strong>{rupees(price)}</strong>
          {off > 0 ? <> — {off}% off {rupees(form.mrp)}</> : <> (no discount shown)</>}
        </p>
        {form.salePrice !== null && form.salePrice > form.mrp && (
          <p className="phone-auth-error">Sale price cannot be higher than the regular price.</p>
        )}
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Product image</legend>
        {form.image ? (
          <div className="admin-image-preview">
            <Image src={imageSrc(form.image)} alt="Selected product image" width={160} height={160} unoptimized={form.image.startsWith("http")} />
            <button type="button" className="panel__link panel__link--danger" disabled={busy} onClick={() => set("image", "")}>Remove image</button>
          </div>
        ) : <p className="admin-note">No image selected yet.</p>}

        {/* Upload is offered only when a storage bucket actually exists, so the
            control can never silently discard a file. */}
        {storage?.available ? (
          <>
            <input ref={fileInput} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} disabled={busy}
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
            <small className="admin-note">JPEG, PNG or WebP, up to {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.</small>
          </>
        ) : storage ? (
          <div className="admin-callout">
            <strong>Image upload is not available yet.</strong>
            <p>{storage.reason}</p>
            <ol>{storage.setup.map((step) => <li key={step}>{step}</li>)}</ol>
            <p>Until then, choose one of the images already in the site below.</p>
          </div>
        ) : null}
        {uploadError && <p className="phone-auth-error">{uploadError}</p>}

        {media.length > 0 && (
          <>
            <p className="admin-note">Images available in this site:</p>
            <div className="admin-media-grid">
              {media.map((ref) => (
                <button type="button" key={ref} className={form.image === ref ? "is-chosen" : ""} disabled={busy}
                  aria-pressed={form.image === ref} title={ref}
                  onClick={() => setForm((current) => ({ ...current, image: ref, images: [ref, ...current.images.filter((i) => i !== ref)] }))}>
                  <Image src={imageSrc(ref)} alt={ref} width={80} height={80} />
                </button>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Inventory and visibility</legend>
        <div className="admin-form__row">
          <label className="checkout-field" htmlFor="p-stock">
            <span>Stock quantity</span>
            <input id="p-stock" type="number" min={0} step={1} value={form.stockQty} disabled={busy}
              onChange={(event) => set("stockQty", Math.max(0, Number(event.target.value) || 0))} />
            {/* Availability is derived, never set by hand, so the two can't disagree. */}
            <small className="admin-note">Shown as {form.stockQty > 0 ? "In stock" : "Out of stock"} on the website.</small>
          </label>
          <label className="checkout-field" htmlFor="p-sku">
            <span>SKU (optional)</span>
            <input id="p-sku" value={form.sku} maxLength={40} disabled={busy} onChange={(event) => set("sku", event.target.value)} />
          </label>
          <label className="checkout-field" htmlFor="p-badge">
            <span>Badge (optional)</span>
            <select id="p-badge" value={form.badge} disabled={busy} onChange={(event) => set("badge", event.target.value)}>
              {PRODUCT_BADGES.map((badge) => <option key={badge || "none"} value={badge}>{badge || "No badge"}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      {problems.length > 0 && (
        <ul className="admin-problems" aria-live="polite">
          {problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      )}

      <div className="admin-form__actions">
        <button className="store-button store-button-primary" type="button" disabled={busy} onClick={() => void save(true)}>
          {busy ? "Saving…" : product?.published ? "Save and keep published" : "Publish product"}
        </button>
        <button className="store-button store-button-secondary" type="button" disabled={busy} onClick={() => void save(false)}>
          Save as draft
        </button>
        <button className="store-button store-button-secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
