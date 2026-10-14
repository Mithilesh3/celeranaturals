"use client";

import { createContext, useContext, useMemo } from "react";
import type { CatalogCategory, StoreProduct } from "../../lib/catalog";

/**
 * The published catalogue, fetched once on the server and handed to the client
 * tree. Cart, wishlist and product cards resolve ids through this, so every
 * surface shows the same prices and stock as the Firestore catalogue rather
 * than a bundled copy that could drift after an admin edit.
 *
 * Only published, unarchived products are ever put in here, so a draft cannot
 * leak into the browser bundle or be linked to from a card.
 */
type CatalogValue = {
  products: StoreProduct[];
  categories: CatalogCategory[];
  byId: Map<string, StoreProduct>;
  bySlug: Map<string, StoreProduct>;
  categoryName: (slug: string) => string | undefined;
};

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({
  products, categories, children,
}: {
  products: StoreProduct[];
  categories: CatalogCategory[];
  children: React.ReactNode;
}) {
  const value = useMemo<CatalogValue>(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    const bySlug = new Map(products.map((product) => [product.slug, product]));
    const names = new Map(categories.map((category) => [category.slug, category.name]));
    return { products, categories, byId, bySlug, categoryName: (slug) => names.get(slug) };
  }, [products, categories]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside CatalogProvider");
  return value;
}
