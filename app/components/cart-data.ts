import { products } from "../../scripts/data.js";
import type { CartRow } from "./store-context";

export type Product = (typeof products)[number];
export type CartDisplayRow = CartRow & { product: Product | undefined };

export function resolveCartRows(cart: CartRow[]): CartDisplayRow[] {
  return cart.map((row) => ({ ...row, product: products.find((product) => product.id === row.id) }));
}

export function calculateCartTotals(rows: CartDisplayRow[]) {
  const subtotal = rows.reduce((sum, row) => sum + (row.product?.originalPrice ?? row.product?.price ?? 0) * row.qty, 0);
  const discount = rows.reduce((sum, row) => sum + Math.max(0, (row.product?.originalPrice ?? row.product?.price ?? 0) - (row.product?.price ?? 0)) * row.qty, 0);
  const productTotal = subtotal - discount;
  return { subtotal, discount, shipping: null as number | null, productTotal };
}

export const formatMoney = (amount: number) => "₹" + new Intl.NumberFormat("en-IN").format(amount);
