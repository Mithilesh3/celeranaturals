/**
 * All internal money is integer paise. No float arithmetic anywhere: rupee
 * floats silently lose precision once you multiply by quantity and add tax.
 */
export type Paise = number;

export const rupeesToPaise = (rupees: number): Paise => Math.round(rupees * 100);

export const formatINR = (paise: Paise): string =>
  "₹" + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100);

/** Shipping and tax are currently zero; both are explicit so the schema is stable. */
export const SHIPPING_PAISE: Paise = 0;
export const TAX_PAISE: Paise = 0;

export type Amounts = {
  subtotal: Paise;
  shipping: Paise;
  tax: Paise;
  total: Paise;
};

export function buildAmounts(subtotal: Paise): Amounts {
  return { subtotal, shipping: SHIPPING_PAISE, tax: TAX_PAISE, total: subtotal + SHIPPING_PAISE + TAX_PAISE };
}
