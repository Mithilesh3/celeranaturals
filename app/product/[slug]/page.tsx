import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedProductBySlug } from "../../../lib/catalog-server";
import { ProductDetail } from "./product-detail";

type Props = { params: Promise<{ slug: string }> };

/**
 * Reads the same published-only repository as the rest of the storefront, so a
 * draft or archived product has no reachable detail page: the lookup returns
 * null and the route 404s exactly as an unknown slug would.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug).catch(() => null);
  return {
    title: product ? product.name + " | Celeranaturals" : "Product Not Found | Celeranaturals",
    ...(product ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug).catch(() => null);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
