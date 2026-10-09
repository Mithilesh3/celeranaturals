import type { Metadata } from "next";
import { categories } from "../../scripts/data.js";

export const metadata: Metadata = { title: "About Us | Celeranaturals", description: "Learn about Celeranaturals and Celera Healthcare." };

const values = [
  { title: "Clear product information", copy: "Straightforward details help customers compare products before choosing." },
  { title: "Carefully selected range", copy: "Digestive care, vitamins, probiotics and protein in one focused collection." },
  { title: "Accessible support", copy: "Reach our team directly with product, order and delivery questions." },
];

export default function AboutPage() {
  return (
    <main className="store-page site-redesign about-page">
      <div className="store-container">
        <section className="about-intro-panel">
          <div className="about-intro-copy">
            <p className="store-eyebrow">About Celera Healthcare</p>
            <h1>Wellness support, thoughtfully brought together.</h1>
            <p>Celeranaturals is the consumer wellness brand of Celera Healthcare. We offer focused nutraceutical products for everyday health needs, supported by clear product information and responsive customer care.</p>
            <a className="store-button store-button-primary" href="/shop">Explore the collection</a>
          </div>
          <div className="about-intro-visual"><img src="/assets/images/hero/pharmacy-bg-3.jpg" alt="Healthcare products and pharmacy shelves" /></div>
        </section>

        <section className="about-range-section" aria-labelledby="about-range-title">
          <div className="store-section-heading"><p className="store-eyebrow">Our product range</p><h2 id="about-range-title">Everyday categories, one trusted place.</h2><p>Explore products by the kind of wellness support you are looking for.</p></div>
          <div className="about-category-grid">{categories.map((category) => <a className="about-category-card" href={`/shop?category=${category.slug}`} key={category.id}><img src={`/${category.image}`} alt="" loading="lazy" /><div><span>{category.name}</span><p>{category.description}</p><strong>Explore category →</strong></div></a>)}</div>
        </section>

        <section className="about-story-panel">
          <div className="about-story-image"><img src="/assets/images/hero/final-pharmacy-hero-clean-20260903.jpg" alt="A well-stocked healthcare and pharmacy setting" loading="lazy" /></div>
          <div><p className="store-eyebrow">Our approach</p><h2>Useful information. Thoughtful choices.</h2><p>We keep the range organized around recognizable wellness categories, with product details and support access available before and after purchase.</p><ul className="about-value-list">{values.map((value) => <li key={value.title}><span aria-hidden="true">✓</span><div><strong>{value.title}</strong><p>{value.copy}</p></div></li>)}</ul></div>
        </section>

        <section className="about-contact-cta"><div><p className="store-eyebrow">Here to help</p><h2>Have a question about a product?</h2><p>Our team can help with product information and delivery enquiries.</p></div><a className="store-button store-button-light" href="/contact">Contact our team</a></section>
      </div>
    </main>
  );
}
