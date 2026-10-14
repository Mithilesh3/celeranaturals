// Kept dependency-free and self-contained: this function is also serialized with
// toString() into a blocking inline script in the root layout, so it must not
// reference imports, closures or module scope.
export function pageModeFor(pathname: string) {
  return pathname.startsWith("/admin") ? "admin"
    : pathname.startsWith("/about") ? "about"
    : pathname.startsWith("/contact") ? "contact"
    : pathname.startsWith("/account") ? "auth"
    : pathname.startsWith("/shop") || pathname.startsWith("/product") || pathname.startsWith("/cart") || pathname.startsWith("/wishlist") ? "shop"
    : "home";
}
