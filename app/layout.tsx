import type { Metadata } from "next";
import "../styles/main.css";
import "../styles/storefront.css";
import { StoreProvider } from "./components/store-context";
import { AuthProvider } from "./components/auth-context";
import { RoutePageMode } from "./components/route-page-mode";
import { StorefrontChrome } from "./components/storefront-chrome";
import { CatalogProvider } from "./components/catalog-context";
import { pageModeFor } from "./components/page-mode";
import { getActiveCategories, getPublishedProducts } from "../lib/catalog-server";

// Runs synchronously as the first child of <body>, so the route-specific
// styling is correct before the first paint instead of after hydration.
const pageModeScript = `document.body.dataset.page=(${pageModeFor})(location.pathname)`;

export const metadata: Metadata = {
  title: "Celeranaturals | Natural Wellness, Premium Care",
  description:
    "Celeranaturals premium wellness store for natural digestive, vitamin, probiotic and protein support.",
};

/**
 * The published catalogue is read once here and shared with the whole client
 * tree. Reads go through the tag-cached repository, so pages stay cacheable and
 * an admin publish invalidates every surface at once.
 *
 * A catalogue read must never take the site down: if Firestore is unreachable
 * or unconfigured the storefront renders with an empty catalogue and its normal
 * empty states, rather than throwing on every route.
 */
async function loadCatalog() {
  try {
    const [products, categories] = await Promise.all([getPublishedProducts(), getActiveCategories()]);
    return { products, categories };
  } catch {
    return { products: [], categories: [] };
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { products, categories } = await loadCatalog();
  // suppressHydrationWarning: the inline script below sets data-page on <body>
  // before React hydrates, so React would otherwise report the attribute it did
  // not render as a mismatch. Scoped to this element's own attributes only.
  //
  // StorefrontChrome decides per route whether the header, footer, WhatsApp
  // button and phone-auth modal render. Admin routes get the bare page; the
  // providers stay so admin can read auth state.
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: pageModeScript }} />
        <AuthProvider>
          <CatalogProvider products={products} categories={categories}>
            <StoreProvider>
              <RoutePageMode />
              <StorefrontChrome>{children}</StorefrontChrome>
            </StoreProvider>
          </CatalogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
