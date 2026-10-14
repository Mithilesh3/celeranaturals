import type { StoreProduct } from "../../lib/catalog";
import type { CartRow } from "./store-context";

/**
 * Cart display helpers.
 *
 * The catalogue is passed in rather than imported, because it now comes from
 * Firestore through CatalogProvider. These totals are for display only — the
 * server recomputes every amount from the catalogue at checkout.
 */
export type Product = StoreProduct;
export type CartDisplayRow = CartRow & { product: Product | undefined };

export function resolveCartRows(cart: CartRow[], byId: Map<string, Product>): CartDisplayRow[] {
  return cart.map((row) => ({ ...row, product: byId.get(row.id) }));
}

export function calculateCartTotals(rows: CartDisplayRow[]) {
  const subtotal = rows.reduce((sum, row) => sum + (row.product?.originalPrice ?? row.product?.price ?? 0) * row.qty, 0);
  const discount = rows.reduce((sum, row) => sum + Math.max(0, (row.product?.originalPrice ?? row.product?.price ?? 0) - (row.product?.price ?? 0)) * row.qty, 0);
  const productTotal = subtotal - discount;
  return { subtotal, discount, shipping: null as number | null, productTotal };
}

export const formatMoney = (amount: number) => "₹" + new Intl.NumberFormat("en-IN").format(amount);
