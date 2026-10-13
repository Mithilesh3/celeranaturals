import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { categories } from "../../scripts/data.js";

export const metadata: Metadata = { title: "About Us | Celeranaturals", description: "Learn about Celeranaturals and Celera Healthcare." };

/**
 * Transcribed verbatim from the company's official credentials page,
 * https://celerahealthcare.com/certificates.php. Every entry below is a
 * statutory registration or licence held by the company — none of them is an
 * endorsement, accreditation or product approval, so the labels stay literal.
 * Do not edit these values without re-checking that source.
 */
const COMPANY = { name: "Celera Healthcare Private Limited", cin: "U74120UP2014PTC065750" };

/**
 * Grouped by what each number actually is, so the panel reads as four
 * meaningful categories rather than a flat table of codes.
 */
const CREDENTIAL_GROUPS = [
  {
    title: "Drug licences",
    icon: "shield",
    items: [
      { label: "Form 20B", value: "UP3220B000486" },
      { label: "Form 21B", value: "UP3221B000483" },
    ],
  },
  {
    title: "Food safety",
    icon: "leaf",
    items: [{ label: "FSSAI registration", value: "12719066001186" }],
  },
  {
    title: "Tax & trade",
    icon: "receipt",
    items: [
      { label: "GST registration", value: "09AAFCC7950D1ZM" },
      { label: "Importer Exporter Code", value: "AAFCC7950D" },
    ],
  },
  {
    title: "MSME",
    icon: "badge",
    items: [{ label: "Udyam registration", value: "UDYAM-UP-50-0058573" }],
  },
] as const;

const GROUP_ICON: Record<string, React.ReactNode> = {
  shield: <><path d="M12 3 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  leaf: <><path d="M20.7 4.3C12.2 3.8 5.5 7 4.1 13.1c-.8 3.7 2 7 5.3 6.3 6.1-1.4 9.3-8.1 8.9-15.1Z" /><path d="M3.2 21c3.4-5.5 7.5-9.5 13.6-13" /></>,
  receipt: <><path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3Z" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>,
  badge: <><circle cx="12" cy="9" r="5" /><path d="m8.5 13.5-1 7.5 4.5-2.5 4.5 2.5-1-7.5" /></>,
};

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
            <Link className="store-button store-button-primary" href="/shop">Explore the collection</Link>
          </div>
          <div className="about-intro-visual"><Image src="/assets/images/hero/pharmacy-bg-3.jpg" alt="Healthcare products and pharmacy shelves" width={2200} height={1469} sizes="(max-width: 900px) 100vw, 50vw" priority /></div>
        </section>

        <section className="credentials-section" aria-labelledby="credentials-title">
          <div className="store-section-heading">
            <p className="store-eyebrow">Compliance</p>
            <h2 id="credentials-title">Our Registrations &amp; Certifications</h2>
            <p>Company credentials and registrations supporting our commitment to quality and compliance.</p>
          </div>

          <div className="credential-identity">
            <span className="credential-identity__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" />
              </svg>
            </span>
            <div>
              <p className="credential-identity__label">Registered entity</p>
              <p className="credential-identity__name">{COMPANY.name}</p>
            </div>
            <p className="credential-identity__cin">
              <span>CIN</span>
              <strong>{COMPANY.cin}</strong>
            </p>
          </div>

          <div className="credential-groups">
            {CREDENTIAL_GROUPS.map((group) => (
              <section className="credential-group" key={group.title}>
                <h3>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    {GROUP_ICON[group.icon]}
                  </svg>
                  {group.title}
                </h3>
                <dl>
                  {group.items.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <p className="credential-note">
            These are statutory registrations and licences held by Celera Healthcare Private Limited.
            They are not product approvals or endorsements.
          </p>
        </section>

        <section className="about-range-section" aria-labelledby="about-range-title">
          <div className="store-section-heading"><p className="store-eyebrow">Our product range</p><h2 id="about-range-title">Everyday categories, one trusted place.</h2><p>Explore products by the kind of wellness support you are looking for.</p></div>
          <div className="about-category-grid">{categories.map((category) => <Link className="about-category-card" href={`/shop?category=${category.slug}`} key={category.id}><Image src={`/${category.image}`} alt="" width={1200} height={1200} sizes="(max-width: 700px) 45vw, 280px" loading="lazy" /><div><span>{category.name}</span><p>{category.description}</p><strong>Explore category →</strong></div></Link>)}</div>
        </section>

        <section className="about-story-panel">
          <div className="about-story-image"><Image src="/assets/images/hero/final-pharmacy-hero-clean-20260903.jpg" alt="A well-stocked healthcare and pharmacy setting" width={2200} height={1469} sizes="(max-width: 900px) 100vw, 50vw" loading="lazy" /></div>
          <div><p className="store-eyebrow">Our approach</p><h2>Useful information. Thoughtful choices.</h2><p>We keep the range organized around recognizable wellness categories, with product details and support access available before and after purchase.</p><ul className="about-value-list">{values.map((value) => <li key={value.title}><span aria-hidden="true">✓</span><div><strong>{value.title}</strong><p>{value.copy}</p></div></li>)}</ul></div>
        </section>

        <section className="about-contact-cta"><div><p className="store-eyebrow">Here to help</p><h2>Have a question about a product?</h2><p>Our team can help with product information and delivery enquiries.</p></div><Link className="store-button store-button-light" href="/contact">Contact our team</Link></section>
      </div>
    </main>
  );
}
