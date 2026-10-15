import type { Metadata } from "next";
import { ShopClient } from "./shop-client";

export const metadata: Metadata = { title: "Shop | Celera Naturals" };

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const params = await searchParams;
  return <ShopClient initialCategory={params.category || "all"} initialSearch={params.q || ""} />;
}
