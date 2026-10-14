import Image from "next/image";
import Link from "next/link";
import { faq, testimonials } from "../scripts/data.js";
import { getActiveCategories, getPublishedProducts } from "../lib/catalog-server";
import { HomeHero } from "./components/home-hero";
import { NewsletterForm } from "./components/newsletter-form";
import { ProductCard } from "./components/product-card";

const assurances = [
  { title: "Science Backed", copy: "Research driven formulations", icon: <><path d="M6 25c12 0 19-7 20-19C14 7 7 14 6 25Z" /><path d="M6 25c4-6 9-10 16-14" /></> },
  { title: "Trusted Quality", copy: "High quality ingredients you can trust", icon: <><path d="M16 4 26 8v7c0 6-4 10-10 13C10 25 6 21 6 15V8l10-4Z" /><path d="m11 16 3 3 7-8" /></> },
  { title: "Doctor Recommended", copy: "Recommended by healthcare professionals", icon: <><circle cx="16" cy="9" r="4" /><path d="M10 27v-5a6 6 0 0 1 12 0v5M7 27h18M23 13l4 3-3 4" /></> },
  { title: "GMP Certified", copy: "Manufactured in GMP certified facilities", icon: <><path d="M12 4h8M14 4v8L8 25a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-13V4M11 22h10" /></> },
];

/**
 * The curated homepage line-up, by catalogue id. Any id that is unpublished,
 * archived or deleted simply drops out; the section then backfills from the
 * published catalogue so it never renders empty or links to a dead product.
 */
const featuredProductIds = ["p4", "p2", "p5", "p6"];

const leadershipTeam = [
  {
    name: "Neeraj Saxena",
    role: "Founder MD & CEO",
    image: "/assets/images/leadership/enhanced/neeraj-saxena.webp",
    bio: "Served the Industry more than 35 Years primarily in Ethical Sales & Marketing. An inclination towards good rapport building with Key Opinion Leaders and team building. Managing the all-important business operations including new product launches and their scientific promotions.",
  },
  {
    name: "Deepak Bakshi",
    role: "Founder Director",
    image: "/assets/images/leadership/enhanced/deepak-bakshi.webp",
    bio: "Started the career in Pharmaceuticals and now well-established Financial Consultant. Managing the Financial Portfolios. Responsible for the future growth and exploring new avenues with financial health of Co.",
  },
  {
    name: "Sandeep Tandon",
    role: "Founder Partner",
    image: "/assets/images/leadership/enhanced/sandeep-tandon.webp",
    bio: "An expert in OTX Pharma business along with an experience of serving the Big OTC Co at various level including the Country Business Head. Holding the responsibilities of people development and market expansion.",
  },
];

const categoryCutouts: Record<string, string> = {
  "psyllium-husk": "/assets/images/category-cutouts/psyllium-husk.png",
  "vitamins-minerals": "/assets/images/category-cutouts/vitamins-minerals.png",
  probiotics: "/assets/images/category-cutouts/probiotics.png",
  protein: "/assets/images/category-cutouts/protein.png",
};

export default async function HomePage() {
  const [allProducts, categories] = await Promise.all([
    getPublishedProducts().catch(() => []),
    getActiveCategories().catch(() => []),
  ]);
  const curated = featuredProductIds.flatMap((id) => {
    const product = allProducts.find((item) => item.id === id);
    return product ? [product] : [];
  });
  const backfill = allProducts.filter((product) => !curated.includes(product));
  const featuredProducts = [...curated, ...backfill].slice(0, 4);

  return (
    <main>
      <HomeHero />

      <section className="home-trust-wrap" aria-label="Celeranaturals quality standards"><div className="container home-trust-panel">
        {assurances.map(({ title, copy, icon }) => <div className="home-trust-item" key={title}><span className="home-trust-icon" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false">{icon}</svg></span><div><h3>{title}</h3><p>{copy}</p></div></div>)}
      </div></section>

      <section className="section home-categories-wrap home-category-circles" aria-labelledby="home-category-title"><div className="container">
        <header className="home-category-heading">
          <div className="home-category-heading-copy">
            <div className="home-category-title-row"><svg className="home-category-leaf" viewBox="0 0 32 32" aria-hidden="true"><path d="M27.7 4.3C16.3 3.6 7.3 7.9 5.5 16.1c-1.1 5 2.6 9.4 7.1 8.4 8.2-1.8 12.5-10.8 12-20.2Z" /><path d="M4.3 28.2c4.6-7.4 10.1-12.7 18.2-17.3" /></svg><h2 className="section-title" id="home-category-title">Shop by Category</h2></div>
            <p>Explore wellness essentials for your daily routine</p>
          </div>
          <Link className="home-category-all-link" href="/shop">View all categories <span aria-hidden="true">→</span></Link>
        </header>
        <div className="home-category-grid" role="region" aria-label="Browse wellness categories" tabIndex={0}>{categories.map((category) => {
          const href = `/shop?category=${category.slug}`;
          return <article className="home-category-item" key={category.id}>
            <Link className="home-category-image-link" href={href} aria-label={`Explore ${category.name} products`}><span className="home-category-image-frame"><Image src={categoryCutouts[category.id] ?? `/${category.image}`} alt={category.name} width={1254} height={1254} sizes="(max-width: 520px) 112px, (max-width: 1024px) 148px, 170px" loading="lazy" /></span></Link>
            <h3><Link href={href}>{category.name}</Link></h3>
            <p>{category.description}</p>
            <Link className="home-category-explore" href={href}><span>Explore Products</span><span className="home-category-arrow" aria-hidden="true">→</span></Link>
          </article>;
        })}</div>
      </div></section>

      <section className="section section-soft home-products-wrap home-featured-products"><div className="container"><div className="section-head section-head-row"><div><span className="home-featured-eyebrow">Celera Healthcare · Wellness essentials</span><h2 className="section-title">Featured Products</h2></div><Link className="section-link" href="/shop">View all products →</Link></div><div className="commerce-product-grid home-featured-grid">{featuredProducts.map((product) => <ProductCard key={product.id} product={product} showFeedback showDiscountBadge showBuyNow />)}</div></div></section>

      <section className="section home-leadership-wrap" aria-labelledby="home-leadership-title"><div className="container"><header className="home-leadership-heading"><span className="home-featured-eyebrow">The people behind Celera</span><h2 className="section-title" id="home-leadership-title">Meet Our Leadership Team</h2></header><div className="home-leadership-grid">{leadershipTeam.map((person) => <article className="home-leadership-card" key={person.name}><div className="home-leadership-photo"><Image src={person.image} alt={person.name} width={500} height={480} sizes="(max-width: 560px) 112px, (max-width: 900px) 45vw, 360px" /></div><div className="home-leadership-info"><h3>{person.name}</h3><p className="home-leadership-role">{person.role}</p><p className="home-leadership-bio">{person.bio}</p></div></article>)}</div></div></section>

      <section className="section section-ivory home-about-wrap"><div className="container"><div className="story-grid home-about-grid"><div className="story-copy reveal home-about-copy"><span className="pill">About Celeranaturals</span><h2 className="section-title home-about-title">Celeranaturals is the consumer wellness brand of Celera Healthcare.</h2><p className="section-sub">We deliver category-led nutraceutical solutions across digestive care, vitamins, probiotics and protein support, with transparent product information and responsive customer support.</p><Link className="btn btn-secondary" href="/about">About Celeranaturals</Link></div><div className="story-media reveal home-about-media"><div className="about-stage" aria-label="Celeranaturals product categories">
        <div className="about-product-tile"><Image src="/assets/images/category-cutouts/psyllium-husk.png" alt="Psyllium Husk product" width={1254} height={1254} sizes="(max-width: 768px) 40vw, 220px" loading="lazy" /><span>Psyllium Husk</span></div>
        <div className="about-product-tile"><Image src="/assets/images/category-cutouts/vitamins-minerals.png" alt="Vitamins and Minerals products" width={1254} height={1254} sizes="(max-width: 768px) 40vw, 220px" loading="lazy" /><span>Vitamins &amp; Minerals</span></div>
        <div className="about-product-tile"><Image src="/assets/images/category-cutouts/probiotics.png" alt="Probiotic products" width={1254} height={1254} sizes="(max-width: 768px) 40vw, 220px" loading="lazy" /><span>Probiotics</span></div>
        <div className="about-product-tile"><Image src="/assets/images/category-cutouts/protein.png" alt="Protein supplement" width={1254} height={1254} sizes="(max-width: 768px) 40vw, 220px" loading="lazy" /><span>Protein</span></div>
      </div></div></div></div></section>

      <section className="section section-deep promo-wrap"><div className="container"><div className="banner reveal home-support-banner"><span className="pill" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>Support and Policies</span><h2 className="section-title banner-title">Need help with products, orders or shipping?</h2><p style={{ margin: 0, color: "#d8eced", maxWidth: "60ch" }}>Contact details and policy links are available across the website for quick assistance and order clarity.</p><div><Link className="btn btn-ghost" href="/contact">Contact Support</Link></div></div></div></section>

      <section className="section section-beige testimonials-wrap home-testimonials-wrap"><div className="container"><div className="section-head"><h2 className="section-title">Customer Feedback</h2></div><div className="testimonial-grid">{testimonials.map((item) => <article className="testimonial-line reveal" key={item.id}><div className="rating" aria-label={`${item.rating} out of 5 stars`}>{"★".repeat(item.rating)}</div><p>{item.review}</p><strong>{item.name}</strong></article>)}</div></div></section>

      <section className="section faq-wrap home-faq-wrap"><div className="container"><div className="section-head"><h2 className="section-title">Frequently Asked Questions</h2></div><div className="list-page-grid">{faq.map((item) => <details className="faq-item reveal" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></div></section>

      <section className="section newsletter-wrap section-deep home-newsletter-wrap"><div className="container newsletter-card"><h2 className="section-title newsletter-title">Subscribe for Product Updates</h2><p className="section-sub">Get concise updates on new products and stock availability.</p><NewsletterForm /></div></section>
    </main>
  );
}
