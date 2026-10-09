import { notFound, redirect } from "next/navigation";
import { products } from "../../scripts/data.js";

export default async function LegacyProductDetail({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  if (!slug || !products.some((item) => item.slug === slug)) notFound();
  redirect("/product/" + slug);
}
