import type { Metadata } from "next";
import "../styles/main.css";
import "../styles/storefront.css";
import { SiteHeader } from "./components/site-header";
import { StoreProvider } from "./components/store-context";
import { RoutePageMode } from "./components/route-page-mode";
import { contactInfo } from "../scripts/data.js";

export const metadata: Metadata = {
  title: "Celeranaturals | Natural Wellness, Premium Care",
  description:
    "Celeranaturals premium wellness store for natural digestive, vitamin, probiotic and protein support.",
};

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand">
            <img className="logo-badge" src="/assets/images/brand/logo.png" alt="Celeranaturals" />
            <div className="brand-title"><strong>CELERANATURALS</strong><span>By Celera Healthcare</span></div>
          </div>
          <p style={{ marginTop: "0.8rem", color: "#d6d0c3", lineHeight: 1.7 }}>Celeranaturals by Celera Healthcare offers nutraceutical products across digestive care, vitamins, probiotics and protein categories.</p>
          <p style={{ margin: "0.6rem 0 0", color: "#d6d0c3" }}>Email: info@celerahealthcare.com<br />Support: +91 98113 51137</p>
        </div>
        <div><h4 className="footer-title">Products</h4><div className="footer-links"><a href="/shop">Products</a><a href="/shop?category=psyllium-husk">Psyllium Husk</a><a href="/shop?category=vitamins-minerals">Vitamins and Minerals</a><a href="/shop?category=probiotics">Probiotics</a><a href="/shop?category=protein">Protein</a></div></div>
        <div><h4 className="footer-title">Company</h4><div className="footer-links"><a href="/about">About Us</a><a href="/contact">Contact</a><a href="/account">My Account</a><a href="/shop">All Products</a></div></div>
        <div><h4 className="footer-title">Policies</h4><div className="footer-links"><a href="https://celeranaturals.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a><a href="https://celeranaturals.com/policies/refund-policy" target="_blank" rel="noopener noreferrer">Refund Policy</a><a href="https://celeranaturals.com/policies/terms-of-service" target="_blank" rel="noopener noreferrer">Terms of Service</a><a href="https://celeranaturals.com/policies/shipping-policy" target="_blank" rel="noopener noreferrer">Shipping Policy</a></div></div>
      </div>
      <div className="container copyright">© 2026 Celera Healthcare Pvt. Ltd. All rights reserved.</div>
    </footer>
  );
}

function WhatsAppButton() {
  const businessNumber = contactInfo.supportPhone.replace(/\D/g, "");
  return (
    <a
      className="whatsapp-float"
      href={`https://wa.me/${businessNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Celera Naturals on WhatsApp"
    >
      <span className="whatsapp-float-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <path fill="none" stroke="#FFFFFF" strokeWidth="1.7" strokeLinejoin="round" d="M16.03 3.2c-7.02 0-12.72 5.69-12.72 12.72 0 2.24.59 4.43 1.71 6.36L3.2 28.8l6.69-1.75a12.69 12.69 0 0 0 6.14 1.57h.01c7.02 0 12.72-5.69 12.72-12.72S23.05 3.2 16.03 3.2z" />
          <path fill="#FFFFFF" d="M23.28 19.2c-.39-.2-2.29-1.13-2.65-1.26-.35-.13-.61-.2-.87.2-.26.39-1 1.26-1.23 1.52-.22.26-.45.29-.84.1-.39-.2-1.66-.61-3.16-1.95-1.17-1.04-1.96-2.32-2.19-2.71-.23-.39-.03-.6.17-.8.18-.18.39-.45.58-.68.19-.22.26-.39.39-.65.13-.26.07-.49-.03-.68-.1-.2-.87-2.1-1.19-2.88-.32-.77-.64-.65-.87-.66h-.74c-.26 0-.68.1-1.03.49-.35.39-1.35 1.32-1.35 3.22s1.38 3.74 1.58 4c.19.26 2.71 4.14 6.56 5.8.92.4 1.64.64 2.2.82.93.3 1.78.26 2.45.16.75-.11 2.29-.94 2.62-1.84.32-.9.32-1.67.23-1.84-.1-.16-.36-.26-.75-.45z" />
        </svg>
      </span>
    </a>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body data-page="home"><StoreProvider><RoutePageMode /><SiteHeader />{children}<SiteFooter /><WhatsAppButton /></StoreProvider></body></html>;
}
