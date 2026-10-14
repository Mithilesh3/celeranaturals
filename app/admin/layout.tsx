import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Panel | Celera Naturals",
  // An internal console should never appear in search results.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
