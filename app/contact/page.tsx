"use client";

import { useState } from "react";
import { contactInfo } from "../../scripts/data.js";

export default function ContactPage() {
  const [notice, setNotice] = useState("");
  return (
    <main className="store-page site-redesign contact-page">
      <div className="store-container">
        <header className="store-page-heading contact-heading"><div><p className="store-eyebrow">We’re here to help</p><h1>Contact our team</h1><p className="store-lede">Get in touch for product, order or delivery information.</p></div></header>
        <div className="contact-layout">
          <section className="contact-details-card" aria-labelledby="contact-details-title">
            <p className="store-eyebrow">Celera Healthcare</p><h2 id="contact-details-title">Contact information</h2>
            <dl className="contact-details-list">
              <div><dt>Email</dt><dd><a href={`mailto:${contactInfo.email}`}>{contactInfo.email}</a></dd></div>
              <div><dt>Customer support</dt><dd><a href={`tel:${contactInfo.supportPhone.replace(/\s/g, "")}`}>{contactInfo.supportPhone}</a></dd></div>
              <div><dt>Shipping support</dt><dd><a href={`tel:${contactInfo.shippingPhone.replace(/\s/g, "")}`}>{contactInfo.shippingPhone}</a></dd></div>
              <div><dt>Office</dt><dd>{contactInfo.address}</dd></div>
              <div><dt>Support hours</dt><dd>{contactInfo.supportHours}</dd></div>
            </dl>
            <div className="contact-delivery-note"><strong>Shipping information</strong><p>Orders are typically processed within 1–2 business days. Delivery estimates vary by destination.</p></div>
          </section>

          <section className="contact-form-card" aria-labelledby="contact-form-title">
            <p className="store-eyebrow">Send an enquiry</p><h2 id="contact-form-title">How can we help?</h2>
            <p className="contact-form-note">This form is not connected to a message service yet. Submitting it will not send your details; please email us directly.</p>
            <form onSubmit={(event) => { event.preventDefault(); setNotice("No message was sent. Please email " + contactInfo.email + " directly."); }}>
              <div className="contact-fields-grid">
                <label>Full name<input name="name" autoComplete="name" required /></label>
                <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
                <label>Phone number <span>(optional)</span><input name="phone" type="tel" autoComplete="tel" /></label>
                <label>Subject <span>(optional)</span><input name="subject" /></label>
                <label className="contact-message-field">Message<textarea name="message" rows={5} required /></label>
              </div>
              <button className="store-button store-button-primary" type="submit">Check contact instructions</button>
              {notice && <p className="contact-submit-notice" role="status">{notice}</p>}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
