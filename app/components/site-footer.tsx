import Image from "next/image";
import Link from "next/link";
import { SOCIAL_LINKS } from "./social-links";

/** Extracted from the root layout unchanged, so it can be gated per route. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand">
            <Image className="logo-badge" src="/assets/images/brand/logo.png" alt="Celera Naturals" width={300} height={300} sizes="50px" />
            <div className="brand-title"><strong>CELERA NATURALS</strong><span>By Celera Healthcare</span></div>
          </div>
          <p style={{ marginTop: "0.8rem", color: "#d6d0c3", lineHeight: 1.7 }}>Celera Naturals by Celera Healthcare offers nutraceutical products across digestive care, vitamins, probiotics and protein categories.</p>
          <p style={{ margin: "0.6rem 0 0", color: "#d6d0c3" }}>Email: info@celerahealthcare.com<br />Support: +91 98113 51137</p>
        </div>
        <div><h4 className="footer-title">Products</h4><div className="footer-links"><Link href="/shop">Products</Link><Link href="/shop?category=psyllium-husk">Psyllium Husk</Link><Link href="/shop?category=vitamins-minerals">Vitamins and Minerals</Link><Link href="/shop?category=probiotics">Probiotics</Link><Link href="/shop?category=protein">Protein</Link></div></div>
        <div><h4 className="footer-title">Company</h4><div className="footer-links"><Link href="/about">About Us</Link><Link href="/contact">Contact</Link><Link href="/account">My Account</Link><Link href="/shop">All Products</Link></div></div>
        <div><h4 className="footer-title">Policies</h4><div className="footer-links"><a href="https://celeranaturals.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a><a href="https://celeranaturals.com/policies/refund-policy" target="_blank" rel="noopener noreferrer">Refund Policy</a><a href="https://celeranaturals.com/policies/terms-of-service" target="_blank" rel="noopener noreferrer">Terms of Service</a><a href="https://celeranaturals.com/policies/shipping-policy" target="_blank" rel="noopener noreferrer">Shipping Policy</a></div></div>
        <div>
          <h4 className="footer-title">Stay Connected</h4>
          <nav className="footer-social" aria-label="Social media">
            {SOCIAL_LINKS.map(({ name, href, icon }) => (
              <a key={name} className="footer-social-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Celera Healthcare on ${name}`}>
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">{icon}</svg>
              </a>
            ))}
          </nav>
        </div>
      </div>
      <div className="container copyright">© 2026 Celera Healthcare Pvt. Ltd. All rights reserved.</div>
    </footer>
  );
}
