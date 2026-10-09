import type { Metadata } from "next";
import "../styles/main.css";
import "../styles/storefront.css";
import { SiteHeader } from "./components/site-header";
import { StoreProvider } from "./components/store-context";
import { RoutePageMode } from "./components/route-page-mode";

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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body data-page="home"><StoreProvider><RoutePageMode /><SiteHeader />{children}<SiteFooter /></StoreProvider></body></html>;
}
