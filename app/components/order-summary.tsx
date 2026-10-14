import Image from "next/image";
import { formatINR } from "../../lib/money";
import type { Amounts } from "../../lib/money";

export type SummaryLine = {
  id: string;
  name: string;
  qty: number;
  lineTotal: number;
  /** Presentational only. Names and prices always come from the caller. */
  image?: string;
};

/**
 * Shared between checkout (live cart) and the order page (snapshotted order).
 * The caller supplies already-resolved names and amounts, so a historical order
 * is never re-priced from the live catalogue.
 */
export function OrderSummaryCard({
  items,
  amounts,
  totalLabel = "Total",
  heading = "Order summary",
  couponLabel,
  children,
}: {
  items: SummaryLine[];
  amounts: Amounts;
  totalLabel?: string;
  heading?: string;
  /** e.g. "WELCOME10 applied" — shown on the discount row. */
  couponLabel?: string;
  /** Slot beneath the items, used by checkout for the coupon field. */
  children?: React.ReactNode;
}) {
  return (
    <section className="summary-card" aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="summary-card__heading">{heading}</h2>

      <ul className="summary-items">
        {items.map((line) => (
          <li className="summary-item" key={line.id}>
            <span className="summary-item__media">
              {line.image
                ? <Image src={`/${line.image}`} alt="" width={1200} height={1200} sizes="56px" />
                : <span className="summary-item__placeholder" aria-hidden="true">◦</span>}
              <span className="summary-item__qty" aria-hidden="true">{line.qty}</span>
            </span>
            <span className="summary-item__text">
              <span className="summary-item__name">{line.name}</span>
              <span className="summary-item__meta">Qty {line.qty}</span>
            </span>
            <span className="summary-item__price">{formatINR(line.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {children}

      <dl className="summary-amounts">
        <div><dt>Subtotal</dt><dd>{formatINR(amounts.subtotal)}</dd></div>
        {/* Orders created before coupons existed have no discount field. */}
        {(amounts.discount ?? 0) > 0 && (
          <div className="summary-amounts__discount">
            <dt>{couponLabel ?? "Discount"}</dt>
            <dd>&minus;{formatINR(amounts.discount)}</dd>
          </div>
        )}
        <div><dt>Shipping</dt><dd>{amounts.shipping === 0 ? "Free" : formatINR(amounts.shipping)}</dd></div>
        <div><dt>Tax</dt><dd>{formatINR(amounts.tax)}</dd></div>
      </dl>

      <div className="summary-total">
        <span>{totalLabel}</span>
        <strong>{formatINR(amounts.total)}</strong>
      </div>
    </section>
  );
}

export function LockIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M6 9V6.8a4 4 0 0 1 8 0V9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="4.2" y="9" width="11.6" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}

/** Shows enough to recognise the number without printing it in full. */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return "Not provided";
  const digits = value.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return value;
  return `+91 ${digits.slice(0, 2)}••• ••${digits.slice(-3)}`;
}
