import { notFound, redirect } from "next/navigation";
import { getPublishedProductBySlug } from "../../lib/catalog-server";

/** Legacy ?slug= URL. Only redirects to products that are actually published. */
export default async function LegacyProductDetail({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  if (!slug) notFound();
  const product = await getPublishedProductBySlug(slug).catch(() => null);
  if (!product) notFound();
  redirect("/product/" + product.slug);
}
