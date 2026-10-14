"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { WhatsAppButton } from "./whatsapp-button";
import { AuthModal } from "./auth-modal";

/**
 * There is a single root layout, so a nested app/admin/layout.tsx would render
 * *inside* the storefront chrome rather than replacing it. Gating here is the
 * smallest safe change: admin routes get the bare page, every public route is
 * composed exactly as before.
 *
 * The storefront phone-OTP modal is excluded too — /admin has its own
 * email/password sign-in screen.
 */
const isAdminRoute = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

export function StorefrontChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  if (isAdminRoute(pathname)) return <>{children}</>;

  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
      <WhatsAppButton />
      <AuthModal />
    </>
  );
}
