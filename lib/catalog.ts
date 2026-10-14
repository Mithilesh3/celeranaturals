/**
 * The product catalogue model.
 *
 * Client-safe on purpose: types, derivations and validation live here so the
 * admin form, the storefront and the server repository all agree on one shape
 * without dragging firebase-admin into the browser bundle. The Firestore
 * repository is in ./catalog-server.
 *
 * Pricing vocabulary, fixed once so nothing drifts:
 *   mrp       — the regular price, always present
 *   salePrice — optional discounted price; when set it must be <= mrp
 *   price     — what the customer actually pays = salePrice ?? mrp (derived)
 *
 * Nothing stores `price` or `availability`; both are derived, so they can never
 * disagree with the fields they come from.
 */

export const PRODUCTS_COLLECTION = "catalogProducts";
export const CATEGORIES_COLLECTION = "catalogCategories";

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  /** Inactive categories stay readable for existing products but are hidden
   *  from new-product pickers and public navigation. Never deleted. */
  active: boolean;
  sortOrder: number;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  /** Category slug. Kept even if the category is later deactivated. */
  category: string;
  mrp: number;
  salePrice: number | null;
  sku: string;
  stockQty: number;
  published: boolean;
  /** Soft delete. Archived products vanish from the storefront but stay
   *  readable so historical orders keep resolving. */
  archived: boolean;
  image: string;
  images: string[];
  shortDescription: string;
  description: string;
  benefits: string[];
  ingredients: string[];
  badge: string;
  /** Null for products with no genuine review data. Never invented. */
  rating: number | null;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * The shape the storefront renders. Field names match what the shop, cards and
 * product pages already used when the catalogue was a hardcoded array, so the
 * presentation layer did not have to be rewritten around derived pricing.
 */
export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  originalPrice: number;
  sku: string;
  stockQty: number;
  availability: "in-stock" | "out-of-stock";
  image: string;
  images: string[];
  shortDescription: string;
  description: string;
  benefits: string[];
  ingredients: string[];
  badge: string;
  rating: number | null;
  reviewCount: number;
};

export const effectivePrice = (product: Pick<CatalogProduct, "mrp" | "salePrice">) =>
  product.salePrice !== null && product.salePrice < product.mrp ? product.salePrice : product.mrp;

export const inStock = (product: Pick<CatalogProduct, "stockQty">) => product.stockQty > 0;

export function toStoreProduct(product: CatalogProduct): StoreProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: effectivePrice(product),
    originalPrice: product.mrp,
    sku: product.sku,
    stockQty: product.stockQty,
    availability: inStock(product) ? "in-stock" : "out-of-stock",
    image: product.image,
    images: product.images.length ? product.images : [product.image],
    shortDescription: product.shortDescription,
    description: product.description,
    benefits: product.benefits,
    ingredients: product.ingredients,
    badge: product.badge,
    rating: product.rating,
    reviewCount: product.reviewCount,
  };
}

export const discountPercent = (product: Pick<StoreProduct, "price" | "originalPrice">) =>
  product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

/** "Celera Isabgol | 2x100g" -> "celera-isabgol-2x100g" */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Badges an admin may pick. Free text is not allowed, to keep cards consistent. */
export const PRODUCT_BADGES = ["", "New", "Best Seller", "Sale", "Featured"] as const;
export type ProductBadge = (typeof PRODUCT_BADGES)[number];

/**
 * Images may be a repository path under assets/images/, or an https URL on an
 * allowlisted host. Anything else is rejected, so a bad value cannot become a
 * broken <Image> src or point the storefront at an arbitrary third party.
 */
export const ALLOWED_IMAGE_HOSTS = ["images.unsplash.com", "firebasestorage.googleapis.com", "storage.googleapis.com"];

export function isValidImageRef(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const ref = value.trim();
  if (ref.startsWith("assets/images/")) return !ref.includes("..");
  try {
    const url = new URL(ref);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    return ALLOWED_IMAGE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** Public URL for an image reference, local or remote. */
export const imageSrc = (ref: string) => (ref.startsWith("http") ? ref : `/${ref.replace(/^\/+/, "")}`);

export type ProductInput = {
  name: string;
  slug: string;
  category: string;
  mrp: number;
  salePrice: number | null;
  sku: string;
  stockQty: number;
  published: boolean;
  image: string;
  images: string[];
  shortDescription: string;
  description: string;
  benefits: string[];
  ingredients: string[];
  badge: string;
};

const str = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

const strList = (value: unknown, max: number) =>
  Array.isArray(value)
    ? value.map((entry) => str(entry, 200)).filter(Boolean).slice(0, max)
    : [];

/** Rupees, whole numbers only. Paise are not modelled anywhere in this store. */
function money(value: unknown): number | null {
  const amount = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  if (amount < 0 || amount > 1_000_000) return null;
  return Math.round(amount);
}

/** Coerces untrusted input to exactly the known fields. Never spread a body. */
export function normalizeProductInput(input: unknown): ProductInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const name = str(raw.name, 160);
  const stock = money(raw.stockQty);
  const sale = raw.salePrice === null || raw.salePrice === "" || raw.salePrice === undefined ? null : money(raw.salePrice);
  const images = strList(raw.images, 8).filter(isValidImageRef);
  const image = isValidImageRef(raw.image) ? str(raw.image, 300) : images[0] ?? "";
  return {
    name,
    slug: slugify(str(raw.slug, 80) || name),
    category: str(raw.category, 80),
    mrp: money(raw.mrp) ?? -1,
    salePrice: sale,
    sku: str(raw.sku, 40),
    stockQty: stock === null ? -1 : stock,
    published: raw.published === true,
    image,
    images: images.length ? images : image ? [image] : [],
    shortDescription: str(raw.shortDescription, 300),
    description: str(raw.description, 4000),
    benefits: strList(raw.benefits, 10),
    ingredients: strList(raw.ingredients, 20),
    badge: (PRODUCT_BADGES as readonly string[]).includes(str(raw.badge, 20)) ? str(raw.badge, 20) : "",
  };
}

/**
 * Server-side truth for whether a product may be saved. The admin form runs the
 * same function for inline feedback, but the server decision is the one that
 * counts: the browser is never trusted to have checked anything.
 */
export function validateProductInput(input: ProductInput, categorySlugs: string[]): string[] {
  const problems: string[] = [];
  if (!input.name) problems.push("Product name is required.");
  if (!SLUG_PATTERN.test(input.slug)) problems.push("URL slug must be lowercase words separated by hyphens.");
  if (!input.category) problems.push("Category is required.");
  else if (categorySlugs.length && !categorySlugs.includes(input.category)) problems.push("Choose a category from the list.");
  if (input.mrp < 0) problems.push("Regular price must be a number of ₹0 or more.");
  if (input.salePrice !== null && input.salePrice < 0) problems.push("Sale price must be ₹0 or more.");
  if (input.salePrice !== null && input.mrp >= 0 && input.salePrice > input.mrp) {
    problems.push("Sale price cannot be higher than the regular price.");
  }
  if (input.stockQty < 0) problems.push("Stock quantity must be 0 or more.");
  if (!input.image) problems.push("A product image is required.");
  // Publishing has a higher bar than saving a draft: a live product with no
  // description reads as broken to a customer.
  if (input.published && !input.shortDescription) {
    problems.push("A short description is required before a product can be published.");
  }
  return problems;
}

/** Upload limits, shared by the client preview and the server endpoint. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
