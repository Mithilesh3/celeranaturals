"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

/**
 * Lucide-style inline icons. The project has no icon package installed and uses
 * inline SVG throughout, so these follow the same 24x24 stroke convention
 * rather than introducing a dependency.
 */
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: "false" as const,
};

const UserIcon = () => <svg {...iconProps}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const PackageIcon = () => <svg {...iconProps}><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>;
const MapPinIcon = () => <svg {...iconProps}><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>;
const HeartIcon = () => <svg {...iconProps}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>;
const LogOutIcon = () => <svg {...iconProps}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>;
const ChevronIcon = () => <svg {...iconProps} className="account-menu__chevron"><path d="m6 9 6 6 6-6" /></svg>;

/** "+919811351137" -> "+91 98113 51137" */
function formatPhone(value: string | null | undefined) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : value;
}

// Every destination is an existing route or an existing section on /account.
const MENU_ITEMS = [
  { href: "/account#acc-profile", label: "My Profile", Icon: UserIcon },
  { href: "/account#acc-orders", label: "My Orders", Icon: PackageIcon },
  { href: "/account#acc-addresses", label: "Saved Addresses", Icon: MapPinIcon },
  { href: "/wishlist", label: "Wishlist", Icon: HeartIcon },
];

export function AccountMenu() {
  const { user, initializing, openAuth, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Close after navigating to one of the menu destinations.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(true); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // Neutral placeholder while Firebase reports, so the button never flickers
  // between signed-out and signed-in labels.
  if (initializing) {
    return <span className="btn btn-secondary desktop-only account-menu__placeholder" aria-hidden="true"><UserIcon />Account</span>;
  }

  if (!user) {
    return (
      <button
        type="button"
        className="btn btn-secondary desktop-only account-menu__trigger"
        onClick={() => openAuth({ returnTo: pathname })}
      >
        <UserIcon />Sign In
      </button>
    );
  }

  const displayName = user.displayName?.trim() || formatPhone(user.phoneNumber) || "My Account";

  return (
    <div className={`account-menu desktop-only${open ? " is-open" : ""}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary account-menu__trigger"
        // Explicit name so the button stays labelled when the visible text is
        // collapsed to an icon in the narrow-desktop band.
        aria-label="My Account"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="account-menu-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <UserIcon />
        <span className="account-menu__label">My Account</span>
        <ChevronIcon />
      </button>

      <div
        id="account-menu-panel"
        className="account-menu__panel"
        role="menu"
        aria-label="Account"
        ref={menuRef}
        hidden={!open}
      >
        <p className="account-menu__identity">
          <span className="account-menu__avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{displayName}</strong>
            {user.displayName && user.phoneNumber && <small>{formatPhone(user.phoneNumber)}</small>}
          </span>
        </p>

        {MENU_ITEMS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} role="menuitem" className="account-menu__item" onClick={() => close()}>
            <Icon />{label}
          </Link>
        ))}

        <span className="account-menu__divider" role="separator" />

        <button
          type="button"
          role="menuitem"
          className="account-menu__item account-menu__item--signout"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            try {
              await signOut();
              close();
              router.push("/");
            } finally { setSigningOut(false); }
          }}
        >
          <LogOutIcon />{signingOut ? "Signing out…" : "Sign Out"}
        </button>
      </div>
    </div>
  );
}

/** Same destinations inside the existing hamburger menu, as an accordion. */
export function MobileAccountSection({ onNavigate }: { onNavigate: () => void }) {
  const { user, initializing, openAuth, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (initializing) return null;

  if (!user) {
    return (
      <button
        type="button"
        className="mobile-menu-signin"
        onClick={() => { onNavigate(); openAuth({ returnTo: pathname }); }}
      >
        Sign In
      </button>
    );
  }

  const displayName = user.displayName?.trim() || formatPhone(user.phoneNumber) || "My Account";

  return (
    <details className="mobile-category-group mobile-account-group">
      <summary>My Account</summary>
      <p className="mobile-account-identity">{displayName}</p>
      {MENU_ITEMS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} onClick={onNavigate}>
          <Icon />{label}
        </Link>
      ))}
      <button
        type="button"
        className="mobile-account-signout"
        onClick={async () => { await signOut(); onNavigate(); router.push("/"); }}
      >
        <LogOutIcon />Sign Out
      </button>
    </details>
  );
}
