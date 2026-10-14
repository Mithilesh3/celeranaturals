import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getActiveCategories } from "../../lib/catalog-server";

export const metadata: Metadata = { title: "About Us | Celeranaturals", description: "Learn about Celeranaturals and Celera Healthcare." };

/**
 * Transcribed verbatim from the company's official credentials page,
 * https://celerahealthcare.com/certificates.php. Every entry below is a
 * statutory registration or licence held by the company — none of them is an
 * endorsement, accreditation or product approval, so the labels stay literal.
 * Do not edit these values without re-checking that source.
 */
/**
 * Mirrors the official company credentials table at
 * https://celerahealthcare.com/certificates.php, field for field, in the same
 * order and with the same labels. Values are transcribed verbatim — including
 * the registered pincode 226020, which is what that page states. Do not edit
 * without re-checking the source.
 */
const COMPANY_DETAILS: Array<{ label: string; value?: string; lines?: string[]; code?: boolean }> = [
  { label: "Company Name", value: "Celera Healthcare Private Limited" },
  { label: "Company Address", value: "C-51 Kamla Nehru Nagar, Kalyanpur East Lucknow UP India Pin- 226020" },
  {
    label: "Contact Details",
    lines: [
      "Call & Whatsapp: +91 9811351137",
      "Email: info@celerahealthcare.com",
      "Website: www.celerahealthcare.com",
    ],
  },
  { label: "Importer Exporter Code", value: "AAFCC7950D", code: true },
  { label: "GST Number", value: "09AAFCC7950D1ZM", code: true },
  { label: "Udyam Reg No.", value: "UDYAM-UP-50-0058573", code: true },
  { label: "Drug Licence No. (20B)", value: "UP3220B000486", code: true },
  { label: "Drug Licence No. (21B)", value: "UP3221B000483", code: true },
  { label: "FSSAI No.", value: "12719066001186", code: true },
  { label: "CIN", value: "U74120UP2014PTC065750", code: true },
  { label: "Main Products", value: "Tablet, Capsule, Softgel Capsule, Powder, Syrup, Dry Syrup, Injection, Cream" },
];

const values = [
  { title: "Clear product information", copy: "Straightforward details help customers compare products before choosing." },
  { title: "Carefully selected range", copy: "Digestive care, vitamins, probiotics and protein in one focused collection." },
  { title: "Accessible support", copy: "Reach our team directly with product, order and delivery questions." },
];

export default async function AboutPage() {
  const categories = await getActiveCategories().catch(() => []);

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

          <dl className="credential-table">
            {COMPANY_DETAILS.map((row) => (
              <div className="credential-row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  {row.lines
                    ? row.lines.map((line) => <span className="credential-line" key={line}>{line}</span>)
                    : row.code
                      ? <span className="credential-code">{row.value}</span>
                      : row.value}
                </dd>
              </div>
            ))}
          </dl>

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
