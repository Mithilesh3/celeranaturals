import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { products } from "../../../scripts/data.js";
import { ProductDetail } from "./product-detail";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = products.find((item) => item.slug === slug);
  return { title: product ? product.name + " | Celeranaturals" : "Product Not Found | Celeranaturals" };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = products.find((item) => item.slug === slug);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
