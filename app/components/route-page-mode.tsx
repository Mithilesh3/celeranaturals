"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageModeFor } from "./page-mode";

// First paint is handled by the blocking inline script in the root layout.
// This only keeps the attribute in sync across client-side navigations.
export function RoutePageMode() {
  const pathname = usePathname();
  useEffect(() => {
    document.body.dataset.page = pageModeFor(pathname);
  }, [pathname]);
  return null;
}
