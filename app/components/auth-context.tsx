"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./firebase";

/**
 * Tells the server that this account just authenticated, so the sign-in can be
 * counted against a persistent customer profile. The server re-derives the
 * identity and the authentication time from the ID token, so this call asserts
 * nothing — it only prompts the server to look.
 *
 * Deliberately fire-and-forget: sign-in bookkeeping must never delay or block
 * a customer from using the site, so every failure is swallowed.
 */
async function recordSignIn(user: User) {
  try {
    const token = await user.getIdToken();
    await fetch("/api/account/session", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Offline, blocked, or the endpoint is unavailable; nothing to do.
  }
}

/** Work the user was attempting when auth interrupted them. Resumed after sign-in. */
export type PendingAction =
  | { kind: "addToCart"; productId: string; qty: number }
  | { kind: "checkout" };

export type AuthIntent = { returnTo?: string; pending?: PendingAction };

/**
 * Only same-origin relative paths are accepted. Rejects absolute URLs
 * ("https://evil.com"), protocol-relative paths ("//evil.com") and anything
 * that is not rooted, which closes the open-redirect hole.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith("/")) return "";
  if (value.startsWith("//")) return "";
  if (/^\/\\/.test(value)) return "";
  return value;
}

type AuthContextValue = {
  user: User | null;
  initializing: boolean;
  configured: boolean;
  /** True once signed in but before a display name exists (new user). */
  needsProfile: boolean;
  isAuthOpen: boolean;
  intent: AuthIntent;
  openAuth: (intent?: AuthIntent) => void;
  closeAuth: () => void;
  saveProfileName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [isAuthOpen, setAuthOpen] = useState(false);
  const [intent, setIntent] = useState<AuthIntent>({});
  // Tracked so a brand-new user is routed through the name step exactly once.
  const [profileChecked, setProfileChecked] = useState(false);
  const configured = isFirebaseConfigured();
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!configured) { setInitializing(false); return; }
    const auth = getFirebaseAuth();
    // Firebase owns the session. Nothing is written to storage by hand.
    setPersistence(auth, browserLocalPersistence).catch(() => {
      // Unavailable in private mode / blocked storage; session then lasts the tab.
    });
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setInitializing(false);
      if (!nextUser) setProfileChecked(false);
      if (nextUser) void recordSignIn(nextUser);
    });
  }, [configured]);

  const openAuth = useCallback((next: AuthIntent = {}) => {
    // Remember the trigger so focus can be restored when the dialog closes.
    triggerRef.current = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    setIntent({ ...next, returnTo: safeReturnTo(next.returnTo) || undefined });
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    setIntent({});
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && document.contains(trigger)) window.setTimeout(() => trigger.focus(), 0);
  }, []);

  const saveProfileName = useCallback(async (name: string) => {
    const current = getFirebaseAuth().currentUser;
    if (!current) return;
    // Stored on the Firebase user record, not in local storage.
    await updateProfile(current, { displayName: name.trim() });
    await current.reload();
    setUser(getFirebaseAuth().currentUser);
    setProfileChecked(true);
  }, []);

  const needsProfile = Boolean(user && !user.displayName && !profileChecked);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    initializing,
    configured,
    needsProfile,
    isAuthOpen,
    intent,
    openAuth,
    closeAuth,
    saveProfileName,
    signOut: async () => {
      if (!configured) return;
      await firebaseSignOut(getFirebaseAuth());
    },
  }), [user, initializing, configured, needsProfile, isAuthOpen, intent, openAuth, closeAuth, saveProfileName]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
