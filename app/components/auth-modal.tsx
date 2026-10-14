"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, updateProfile,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import { useAuth } from "./auth-context";
import { useStore } from "./store-context";
import { describeError, errorCode } from "../../lib/auth-errors";

/** Loose client-side shape check only; Firebase is the real validator. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** Brand lockup so the dialog reads as Celera Naturals, not a generic form. */
function AuthBrand() {
  return (
    <div className="auth-brand">
      <span className="auth-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M27.7 4.3C16.3 3.6 7.3 7.9 5.5 16.1c-1.1 5 2.6 9.4 7.1 8.4 8.2-1.8 12.5-10.8 12-20.2Z" />
          <path d="M4.3 28.2c4.6-7.4 10.1-12.7 18.2-17.3" />
        </svg>
      </span>
      <span className="auth-brand__text">
        <strong>CELERANATURALS</strong>
        <small>By Celera Healthcare</small>
      </span>
    </div>
  );
}

export function AuthModal() {
  const { user, needsProfile, isAuthOpen, intent, closeAuth, saveProfileName } = useAuth();
  const { addToCart } = useStore();
  const router = useRouter();

  // Email + password is the default route in. Phone OTP is still offered and
  // unchanged, but is no longer required to create an account.
  const [step, setStep] = useState<"email" | "reset" | "name">("email");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Reset flow: its own email field, pre-filled from the login form.
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errCode, setErrCode] = useState("");

  const dialogRef = useRef<HTMLDivElement | null>(null);

  /**
   * The single "session established" path. Phone OTP calls it today; an OAuth
   * provider added later calls the same function with no further changes.
   */
  const completeSession = useCallback(() => {
    const pending = intent.pending;
    const returnTo = intent.returnTo;
    closeAuth();
    if (pending?.kind === "addToCart") addToCart(pending.productId, pending.qty);
    if (pending?.kind === "checkout") { router.push("/checkout"); return; }
    if (returnTo) router.push(returnTo);
  }, [intent, closeAuth, addToCart, router]);

  // Reset to a clean state each time the dialog opens. Email + password is the
  // entry point. Mobile OTP sign-in is no longer offered.
  useEffect(() => {
    if (!isAuthOpen) return;
    setStep(needsProfile ? "name" : "email");
    setError(""); setErrCode(""); setBusy(false);
    setPassword("");
  }, [isAuthOpen, needsProfile]);

  // The email step is where a session can appear while the dialog is open.
  const atEntryStep = step === "email";

  // A signed-in user with a complete profile never sees the flow.
  useEffect(() => {
    if (isAuthOpen && user && !needsProfile && atEntryStep) {
      closeAuth();
      router.push("/account");
    }
  }, [isAuthOpen, user, needsProfile, atEntryStep, closeAuth, router]);

  // Once Firebase reports a session, move to the name step or finish. Google
  // and email/password both resolve while the entry step is on screen.
  useEffect(() => {
    if (!isAuthOpen || !user) return;
    if (needsProfile) setStep("name");
  }, [isAuthOpen, user, needsProfile, completeSession]);

  // Escape to close, and a focus trap so Tab cannot leave the dialog.
  useEffect(() => {
    if (!isAuthOpen) return;
    const node = dialogRef.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeAuth(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isAuthOpen, closeAuth]);


  /**
   * Continue with Google. A popup keeps the customer on the page; if the
   * browser blocks it we fall back to a full-page redirect, which the SDK
   * resolves on return through the same onAuthStateChanged path everything
   * else uses. No ID token or profile data is handled here by hand.
   */
  const continueWithGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError(""); setErrCode("");
    try {
      const provider = new GoogleAuthProvider();
      // Always ask which account, rather than silently reusing the last one.
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
      // onAuthStateChanged drives the rest.
    } catch (caught) {
      const code = errorCode(caught);
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        try {
          await signInWithRedirect(getFirebaseAuth(), new GoogleAuthProvider());
          return;
        } catch (redirectError) {
          setError(describeError(redirectError, "google"));
          setErrCode(errorCode(redirectError));
          return;
        }
      }
      setError(describeError(caught, "google"));
      setErrCode(code);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  /** Email + password sign-in, or account creation with a display name. */
  /**
   * Sends a Firebase password-reset email.
   *
   * The confirmation is deliberately the same whether or not an account
   * exists: telling a stranger which addresses are registered is an account
   * enumeration leak. Firebase's own "user-not-found" is therefore treated as
   * success here, and only genuine problems (bad address, rate limit, network,
   * unauthorised domain) surface as errors.
   */
  const sendReset = useCallback(async () => {
    if (busy) return;
    const address = resetEmail.trim();
    if (!EMAIL_SHAPE.test(address)) {
      setError("Enter your registered email address.");
      setErrCode("");
      return;
    }
    setBusy(true); setError(""); setErrCode(""); setResetSent(false);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), address);
      setResetSent(true);
    } catch (caught) {
      const code = errorCode(caught);
      if (code === "auth/user-not-found" || code === "auth/invalid-recipient-email") {
        setResetSent(true);
        return;
      }
      setError(describeError(caught, "reset"));
      setErrCode(code);
    } finally {
      setBusy(false);
    }
  }, [busy, resetEmail]);

  const submitEmail = useCallback(async () => {
    if (busy) return;
    const address = email.trim();
    if (!address || password.length < 1) return;
    setBusy(true); setError(""); setErrCode("");
    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), address, password);
        const chosen = name.trim();
        // Set at creation so the customer never sees the extra name step.
        if (chosen) await updateProfile(credential.user, { displayName: chosen });
      } else {
        await signInWithEmailAndPassword(getFirebaseAuth(), address, password);
      }
      // onAuthStateChanged drives the rest.
    } catch (caught) {
      setError(describeError(caught, "email"));
      setErrCode(errorCode(caught));
    } finally {
      setBusy(false);
    }
  }, [busy, email, password, mode, name]);


  if (!isAuthOpen) return null;

  return (
    <div className="auth-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAuth(); }}>
      <div
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        ref={dialogRef}
      >
        <button className="auth-close" type="button" aria-label="Close sign in" onClick={closeAuth}>×</button>

        {step === "email" && (
          <form onSubmit={(event) => { event.preventDefault(); void submitEmail(); }}>
            <AuthBrand />
            <h2 id="auth-title">{mode === "signup" ? "Create your account" : "Sign in or create an account"}</h2>
            <p className="auth-sub">
              {mode === "signup"
                ? "Use your email and a password. You can add your mobile number later."
                : "Continue with Google, or use your email and password."}
            </p>

            <button className="auth-google" type="button" disabled={busy} onClick={() => void continueWithGoogle()}>
              {/* Google's four-colour mark, inline to avoid another dependency. */}
              <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
              </svg>
              <span>Continue with Google</span>
            </button>

            <p className="auth-divider"><span>or</span></p>

            {mode === "signup" && (
              <>
                <label htmlFor="auth-name-new">Full name</label>
                <input
                  id="auth-name-new"
                  type="text"
                  autoComplete="name"
                  value={name}
                  disabled={busy}
                  aria-describedby="auth-message"
                  onChange={(event) => { setName(event.target.value); setError(""); }}
                />
              </>
            )}

            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              autoComplete={mode === "signup" ? "email" : "username"}
              placeholder="you@example.com"
              value={email}
              disabled={busy}
              aria-describedby="auth-message"
              onChange={(event) => { setEmail(event.target.value); setError(""); setErrCode(""); }}
            />

            <label htmlFor="auth-password">Password</label>
            <div className="auth-password-field">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                value={password}
                disabled={busy}
                aria-describedby="auth-message"
                onChange={(event) => { setPassword(event.target.value); setError(""); setErrCode(""); }}
              />
              <button type="button" className="auth-password-toggle" disabled={busy} onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {/* On its own row beneath the field, so it can never collide with
                the Show control or the reCAPTCHA badge. */}
            {mode === "signin" && (
              <p className="auth-forgot">
                <button
                  type="button"
                  className="auth-linkish"
                  disabled={busy}
                  onClick={() => {
                    setResetEmail(email.trim());
                    setResetSent(false);
                    setError(""); setErrCode("");
                    setStep("reset");
                  }}
                >Forgot password?</button>
              </p>
            )}

            <button
              className="store-button store-button-primary auth-submit"
              type="submit"
              disabled={busy || !email.trim() || password.length < 1 || (mode === "signup" && !name.trim())}
            >
              {busy ? (mode === "signup" ? "Creating…" : "Signing in…") : (mode === "signup" ? "Create account" : "Sign in")}
            </button>

            <p className="auth-switch">
              {mode === "signup" ? "Already have an account? " : "New to Celera Naturals? "}
              <button type="button" className="auth-linkish" disabled={busy} onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setErrCode(""); }}>
                {mode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>

            <p className="auth-alt">
            </p>

            <p className="auth-legal">
              By continuing you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        )}

        {/* noValidate below: the browser's own bubble for type="email" would
            block our submit handler, so the customer would get a native
            tooltip here and an in-modal message everywhere else. One voice. */}
        {step === "reset" && (
          <form noValidate onSubmit={(event) => { event.preventDefault(); void sendReset(); }}>
            <AuthBrand />
            <h2 id="auth-title">Reset your password</h2>

            {resetSent ? (
              <>
                <p className="auth-sub auth-reset-sent" role="status">
                  If an account exists for this email, you will receive a password reset link.
                  Please check your inbox and spam folder.
                </p>
                <button
                  className="store-button store-button-primary auth-submit"
                  type="button"
                  onClick={() => { setStep("email"); setResetSent(false); setError(""); setErrCode(""); }}
                >Back to sign in</button>
                <p className="auth-alt">
                  <button type="button" className="auth-linkish" disabled={busy} onClick={() => void sendReset()}>
                    Resend the email
                  </button>
                </p>
              </>
            ) : (
              <>
                <p className="auth-sub">
                  Enter your registered email address and we&rsquo;ll send you a link to set a new password.
                </p>
                <label htmlFor="auth-reset-email">Email address</label>
                <input
                  id="auth-reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={resetEmail}
                  disabled={busy}
                  aria-describedby="auth-message"
                  onChange={(event) => { setResetEmail(event.target.value); setError(""); setErrCode(""); }}
                />
                <button
                  className="store-button store-button-primary auth-submit"
                  type="submit"
                  disabled={busy || !resetEmail.trim()}
                >{busy ? "Sending reset link…" : "Send reset link"}</button>
                <p className="auth-alt">
                  <button type="button" className="auth-linkish" disabled={busy} onClick={() => { setStep("email"); setError(""); setErrCode(""); }}>
                    Back to sign in
                  </button>
                </p>
              </>
            )}
          </form>
        )}

        {step === "name" && (
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !name.trim()) return;
            setBusy(true); setError("");
            try { await saveProfileName(name); completeSession(); }
            catch { setError("Could not save your name. Please try again."); }
            finally { setBusy(false); }
          }}>
            <h2 id="auth-title">What should we call you?</h2>
            {/* The identifier depends on how they signed in, so it is read from
                the session rather than assuming a phone number. */}
            <p className="auth-sub">
              Just your name — you&rsquo;re signed in as {user?.email ?? user?.phoneNumber ?? "your new account"}.
            </p>
            <label htmlFor="auth-name">Full name</label>
            <input
              id="auth-name"
              type="text"
              autoComplete="name"
              aria-describedby="auth-message"
              value={name}
              disabled={busy}
              onChange={(event) => { setName(event.target.value); setError(""); }}
            />
            <button className="store-button store-button-primary auth-submit" type="submit" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        )}

        <p id="auth-message" className="auth-message" role="status" aria-live="polite">
          {error && <><span className="phone-auth-error">{error}</span>{errCode && <span className="phone-auth-code-hint"> ({errCode})</span>}</>}
        </p>

      </div>
    </div>
  );
}
