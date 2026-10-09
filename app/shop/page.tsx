import type { Metadata } from "next";
import { ShopClient } from "./shop-client";

export const metadata: Metadata = { title: "Shop | Celeranaturals" };

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const params = await searchParams;
  return <ShopClient initialCategory={params.category || "all"} />;
}
