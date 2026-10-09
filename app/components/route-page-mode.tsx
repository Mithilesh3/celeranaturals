"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function RoutePageMode() {
  const pathname = usePathname();
  useEffect(() => {
    const mode = pathname.startsWith("/about") ? "about"
      : pathname.startsWith("/contact") ? "contact"
      : pathname.startsWith("/account") ? "auth"
      : pathname.startsWith("/shop") || pathname.startsWith("/product") || pathname.startsWith("/cart") || pathname.startsWith("/wishlist") ? "shop"
      : "home";
    document.body.dataset.page = mode;
  }, [pathname]);
  return null;
}
