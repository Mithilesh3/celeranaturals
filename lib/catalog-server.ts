import { unstable_cache, revalidateTag } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, isAdminConfigured } from "./firebase-admin";
import {
  CATEGORIES_COLLECTION, PRODUCTS_COLLECTION, toStoreProduct,
  type CatalogCategory, type CatalogProduct, type ProductInput, type StoreProduct,
} from "./catalog";

/**
 * The one authoritative catalogue repository.
 *
 * SERVER ONLY. Both the admin APIs and every public storefront query go
 * through this module, so there is exactly one source of truth: there is no
 * code path where admin writes to Firestore while a page still renders a
 * hardcoded array.
 *
 * Public reads are wrapped in unstable_cache under the CATALOG_TAG so the shop
 * and product pages stay cacheable; every admin mutation calls
 * revalidateCatalog(), which makes a publish visible without a redeploy.
 */
export const CATALOG_TAG = "catalog";

export class CatalogUnavailableError extends Error {}

function db() {
  if (!isAdminConfigured()) {
    throw new CatalogUnavailableError("Firestore is not configured on this server.");
  }
  return adminDb();
}

/** Firestore may hold documents written before a field existed; fill the gaps. */
function hydrate(id: string, data: Record<string, unknown>): CatalogProduct {
  const asList = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
  const image = typeof data.image === "string" ? data.image : "";
  return {
    id,
    slug: String(data.slug ?? id),
    name: String(data.name ?? ""),
    category: String(data.category ?? ""),
    mrp: Number(data.mrp ?? 0),
    salePrice: data.salePrice === null || data.salePrice === undefined ? null : Number(data.salePrice),
    sku: String(data.sku ?? ""),
    stockQty: Number(data.stockQty ?? 0),
    published: data.published === true,
    archived: data.archived === true,
    image,
    images: asList(data.images).length ? asList(data.images) : image ? [image] : [],
    shortDescription: String(data.shortDescription ?? ""),
    description: String(data.description ?? ""),
    benefits: asList(data.benefits),
    ingredients: asList(data.ingredients),
    badge: String(data.badge ?? ""),
    rating: typeof data.rating === "number" ? data.rating : null,
    reviewCount: Number(data.reviewCount ?? 0),
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
  };
}

async function readAllProducts(): Promise<CatalogProduct[]> {
  const snapshot = await db().collection(PRODUCTS_COLLECTION).get();
  return snapshot.docs.map((doc) => hydrate(doc.id, doc.data()));
}

async function readAllCategories(): Promise<CatalogCategory[]> {
  const snapshot = await db().collection(CATEGORIES_COLLECTION).get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: String(data.name ?? ""),
        slug: String(data.slug ?? doc.id),
        description: String(data.description ?? ""),
        image: String(data.image ?? ""),
        active: data.active !== false,
        sortOrder: Number(data.sortOrder ?? 0),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

// ── Public reads (cached, tag-invalidated on every admin write) ─────────────

/**
 * Published, unarchived products for the storefront.
 *
 * Filtered here rather than in a Firestore query so a draft can never leak
 * through a missing composite index, and so the single cached read serves
 * every public surface.
 */
export const getPublishedProducts = unstable_cache(
  async (): Promise<StoreProduct[]> => {
    const products = await readAllProducts();
    return products
      .filter((product) => product.published && !product.archived)
      .map(toStoreProduct)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  ["catalog-published-products"],
  { tags: [CATALOG_TAG] },
);

export const getActiveCategories = unstable_cache(
  async (): Promise<CatalogCategory[]> => (await readAllCategories()).filter((category) => category.active),
  ["catalog-active-categories"],
  { tags: [CATALOG_TAG] },
);

/** Null for a draft, archived or unknown slug — drafts are not publicly reachable. */
export async function getPublishedProductBySlug(slug: string): Promise<StoreProduct | null> {
  const products = await getPublishedProducts();
  return products.find((product) => product.slug === slug) ?? null;
}

/**
 * Resolves ids to products for checkout and order rendering, including
 * archived ones, so a historical order still shows what was bought. Never
 * cached: checkout must read live stock and prices.
 */
export async function getProductsByIds(ids: string[]): Promise<Map<string, CatalogProduct>> {
  const unique = [...new Set(ids)].slice(0, 50);
  if (!unique.length) return new Map();
  const refs = unique.map((id) => db().collection(PRODUCTS_COLLECTION).doc(id));
  const snapshots = await db().getAll(...refs);
  const found = new Map<string, CatalogProduct>();
  for (const snapshot of snapshots) {
    if (snapshot.exists) found.set(snapshot.id, hydrate(snapshot.id, snapshot.data()!));
  }
  return found;
}

// ── Admin reads and writes ─────────────────────────────────────────────────

export async function listProductsForAdmin(): Promise<CatalogProduct[]> {
  return (await readAllProducts()).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export const listCategoriesForAdmin = readAllCategories;

export async function getProductForAdmin(id: string): Promise<CatalogProduct | null> {
  const snapshot = await db().collection(PRODUCTS_COLLECTION).doc(id).get();
  return snapshot.exists ? hydrate(snapshot.id, snapshot.data()!) : null;
}

/** Slugs are the public URL key, so they must stay unique across the catalogue. */
export async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const snapshot = await db().collection(PRODUCTS_COLLECTION).where("slug", "==", slug).limit(2).get();
  return snapshot.docs.some((doc) => doc.id !== exceptId);
}

export async function createProduct(input: ProductInput): Promise<string> {
  const now = new Date().toISOString();
  const ref = db().collection(PRODUCTS_COLLECTION).doc();
  const product: Omit<CatalogProduct, "id"> = {
    ...input,
    archived: false,
    // Review data is never fabricated for a new product; cards hide the block.
    rating: null,
    reviewCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(product);
  await revalidateCatalog();
  return ref.id;
}

export async function updateProduct(id: string, input: ProductInput): Promise<boolean> {
  const ref = db().collection(PRODUCTS_COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  // Only the editable fields are written: rating, reviewCount, createdAt and
  // archived are not settable through the product form.
  await ref.update({ ...input, updatedAt: new Date().toISOString() });
  await revalidateCatalog();
  return true;
}

export async function setProductFlags(
  id: string,
  flags: { published?: boolean; archived?: boolean },
): Promise<boolean> {
  const ref = db().collection(PRODUCTS_COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (flags.published !== undefined) update.published = flags.published;
  if (flags.archived !== undefined) {
    update.archived = flags.archived;
    // Archiving must also unpublish, otherwise a restored product would
    // silently reappear on the storefront.
    if (flags.archived) update.published = false;
  }
  await ref.update(update);
  await revalidateCatalog();
  return true;
}

/**
 * Decrements stock for a completed order, inside the caller's transaction.
 * Returns the per-id shortfall so the caller can reject before taking money.
 */
export function stockShortfalls(
  wanted: Array<{ id: string; qty: number }>,
  found: Map<string, CatalogProduct>,
): string[] {
  const problems: string[] = [];
  for (const line of wanted) {
    const product = found.get(line.id);
    if (!product) { problems.push("A product in your cart is no longer available."); continue; }
    if (!product.published || product.archived) { problems.push(`${product.name} is no longer available.`); continue; }
    if (product.stockQty < line.qty) {
      problems.push(product.stockQty <= 0 ? `${product.name} is out of stock.` : `Only ${product.stockQty} of ${product.name} left.`);
    }
  }
  return problems;
}

export async function revalidateCatalog() {
  try {
    revalidateTag(CATALOG_TAG);
  } catch {
    // revalidateTag throws outside a request/render scope (for example in the
    // migration script). The cache entry simply expires normally instead.
  }
}

// ── Categories ─────────────────────────────────────────────────────────────

export async function upsertCategory(category: Omit<CatalogCategory, "id"> & { id?: string }): Promise<string> {
  const id = category.id ?? category.slug;
  await db().collection(CATEGORIES_COLLECTION).doc(id).set({
    name: category.name,
    slug: category.slug,
    description: category.description,
    image: category.image,
    active: category.active,
    sortOrder: category.sortOrder,
  }, { merge: true });
  await revalidateCatalog();
  return id;
}

/**
 * Deactivating never deletes: existing products keep their category slug and
 * historical orders are untouched. The category simply stops being offered.
 */
export async function setCategoryActive(id: string, active: boolean): Promise<boolean> {
  const ref = db().collection(CATEGORIES_COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  await ref.update({ active });
  await revalidateCatalog();
  return true;
}

export async function countProductsInCategory(slug: string): Promise<number> {
  const snapshot = await db().collection(PRODUCTS_COLLECTION).where("category", "==", slug).get();
  return snapshot.size;
}
