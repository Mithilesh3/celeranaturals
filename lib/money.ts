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
  /** Always a positive figure; it is subtracted from the subtotal. */
  discount: Paise;
  shipping: Paise;
  tax: Paise;
  total: Paise;
};

export function buildAmounts(subtotal: Paise, discount: Paise = 0): Amounts {
  // Never let a discount push the payable below zero.
  const applied = Math.max(0, Math.min(discount, subtotal));
  return {
    subtotal,
    discount: applied,
    shipping: SHIPPING_PAISE,
    tax: TAX_PAISE,
    total: subtotal - applied + SHIPPING_PAISE + TAX_PAISE,
  };
}
