import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: false },
      { source: "/shop.html", destination: "/shop", permanent: false },
      { source: "/about.html", destination: "/about", permanent: false },
      { source: "/contact.html", destination: "/contact", permanent: false },
      { source: "/auth.html", destination: "/account", permanent: false },
      { source: "/cart.html", destination: "/cart", permanent: false },
      { source: "/wishlist.html", destination: "/wishlist", permanent: false },
    ];
  },
};

export default nextConfig;
