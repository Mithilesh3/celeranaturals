"use client";

import {
  DELIVERY_STEPS, FULFILMENT_LABEL, stepIndex, trustedTrackingUrl,
  type FulfilmentStatus, type Tracking,
} from "../../lib/fulfilment";
import { addressLines, formatIST, hasAddressDetails, type OrderAddress } from "../../lib/orders";
import { formatEstimateDate } from "../../lib/delivery-estimate";

/** What each step means to a customer, so the timeline is not just status words. */
const STEP_HINT: Record<FulfilmentStatus, string> = {
  pending: "Order placed and awaiting confirmation.",
  confirmed: "We have confirmed your order.",
  processing: "Your items are being prepared.",
  packed: "Your parcel is packed and ready for pickup.",
  shipped: "Handed over to the courier.",
  delivered: "Delivered.",
  cancelled: "This order was cancelled.",
};

export type TimelineEntry = { status: FulfilmentStatus; at: string; note?: string };
export type EstimateWindow = { from: string; to: string; basis: "dispatch" | "order" } | null;

const dayOnly = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
  } catch { return iso; }
};

function Estimate({ estimate, estimatedDeliveryDate }: { estimate: EstimateWindow; estimatedDeliveryDate?: string | null }) {
  // A date set for THIS order by the team is the most reliable thing we have,
  // so it wins over any configured generic window.
  if (estimatedDeliveryDate) {
    return (
      <p className="track-estimate">
        Estimated Delivery: <strong>{formatEstimateDate(estimatedDeliveryDate)}</strong>
        <small>Confirmed for this order by our team.</small>
      </p>
    );
  }

  // Otherwise fall back to a configured window, and if there is none, say the
  // estimate is coming rather than inventing one.
  if (!estimate) {
    return (
      <p className="track-estimate track-estimate--none">
        Delivery estimate will be updated soon.
        <small>We&rsquo;ll update this page as your order progresses.</small>
      </p>
    );
  }
  const window = dayOnly(estimate.from) === dayOnly(estimate.to)
    ? dayOnly(estimate.from)
    : `${dayOnly(estimate.from)} – ${dayOnly(estimate.to)}`;
  return (
    <p className="track-estimate">
      Estimated delivery <strong>{window}</strong>
      <small>{estimate.basis === "dispatch" ? "Counted from dispatch." : "Estimated from your order date; updates once dispatched."}</small>
    </p>
  );
}

export function DeliveryTracking({
  fulfilment, timeline, tracking, estimate, estimatedDeliveryDate, updatedAt,
}: {
  fulfilment: FulfilmentStatus;
  timeline: TimelineEntry[];
  tracking: Tracking | null;
  estimate: EstimateWindow;
  /** Per-order date set by an operator; takes precedence over any window. */
  estimatedDeliveryDate?: string | null;
  updatedAt: string;
}) {
  const cancelled = fulfilment === "cancelled";
  const reached = cancelled ? -1 : stepIndex(fulfilment);
  // The first time each step was recorded, so a dot can show when it happened.
  const reachedAt = new Map<FulfilmentStatus, string>();
  for (const entry of timeline) if (!reachedAt.has(entry.status)) reachedAt.set(entry.status, entry.at);
  const cancelEntry = timeline.find((entry) => entry.status === "cancelled");
  const trackingLink = trustedTrackingUrl(tracking?.url);

  return (
    <section className="panel track-card" aria-labelledby="track-heading">
      <div className="track-card__head">
        <h2 id="track-heading" className="panel__heading">Delivery tracking</h2>
        <span className={`track-pill track-pill--${fulfilment}`}>{FULFILMENT_LABEL[fulfilment]}</span>
      </div>

      {cancelled ? (
        <div className="track-cancelled" role="status">
          <p><strong>This order was cancelled.</strong></p>
          {cancelEntry && <p className="track-cancelled__when">Cancelled on {formatIST(cancelEntry.at)}.</p>}
          {cancelEntry?.note && <p className="track-cancelled__note">{cancelEntry.note}</p>}
        </div>
      ) : (
        <>
          <Estimate estimate={estimate} estimatedDeliveryDate={estimatedDeliveryDate} />
          <ol className="track-steps">
            {DELIVERY_STEPS.map((step, index) => {
              const state = index < reached ? "done" : index === reached ? "current" : "upcoming";
              const at = reachedAt.get(step);
              return (
                <li key={step} className={`track-step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
                  <span className="track-step__dot" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
                  <div className="track-step__body">
                    <strong>{FULFILMENT_LABEL[step]}</strong>
                    <small>{STEP_HINT[step]}</small>
                    {at && <time dateTime={at}>{formatIST(at)}</time>}
                  </div>
                  <span className="store-sr-only">
                    {state === "done" ? "Completed" : state === "current" ? "Current step" : "Not yet reached"}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {tracking?.number && (
        <div className="track-courier">
          <h3>Courier</h3>
          <dl className="detail-list">
            <div><dt>Company</dt><dd>{tracking.courier}</dd></div>
            <div><dt>Tracking number</dt><dd className="track-courier__num">{tracking.number}</dd></div>
            {tracking.at && <div><dt>Dispatched</dt><dd>{formatIST(tracking.at)}</dd></div>}
          </dl>
          {trackingLink ? (
            <a className="store-button store-button-secondary" href={trackingLink} target="_blank" rel="noopener noreferrer">
              Track on courier website
            </a>
          ) : (
            <p className="panel__hint">
              Use this tracking number on your courier&rsquo;s website for live movement.
            </p>
          )}
        </div>
      )}

      {/* The distinction matters: these steps are recorded by our team, and are
          not a live feed from the courier's network. */}
      <p className="track-source">
        Status updates are recorded by the Celera Naturals team. Live parcel movement is shown by the courier.
        {updatedAt && <> Last updated {formatIST(updatedAt)}.</>}
      </p>
    </section>
  );
}

export function DeliveryAddressCard({
  address, phone, edited,
}: { address: Partial<OrderAddress> | null | undefined; phone?: string; edited?: boolean }) {
  const lines = address ? addressLines(address) : [];
  return (
    <section className="panel address-card" aria-labelledby="order-delivery">
      <h2 id="order-delivery" className="panel__heading">Delivery address</h2>
      {/* Orders placed before the full address fields existed may have very
          little stored. Say so rather than rendering a broken block. */}
      {!hasAddressDetails(address) || lines.length === 0 ? (
        <p className="panel__hint">Address details unavailable for this order.</p>
      ) : (
        <address className="order-address">
          {address?.fullName && <><strong>{address.fullName}</strong><br /></>}
          {lines.map((line, index) => <span key={`${line}-${index}`}>{line}<br /></span>)}
          {(address?.phone || phone) && <span className="order-address__phone">Phone: {address?.phone || phone}</span>}
        </address>
      )}
      {edited && <p className="panel__hint">This address was corrected by our team after the order was placed.</p>}
    </section>
  );
}
