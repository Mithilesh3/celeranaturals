"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider, RecaptchaVerifier, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInWithPhoneNumber, signInWithPopup, signInWithRedirect,
  updateProfile, type ConfirmationResult,
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import { useAuth } from "./auth-context";
import { useStore } from "./store-context";
import { OtpInput } from "./otp-input";
import { describeError, errorCode, VERIFICATION_TIMEOUT_MESSAGE } from "../../lib/auth-errors";

/**
 * Invisible reCAPTCHA normally resolves in a second or two. If it is blocked —
 * by an extension, a strict network, or a browser that cannot reach Google's
 * challenge — signInWithPhoneNumber never settles and the dialog would spin
 * forever with no explanation. This bounds that wait.
 */
const VERIFICATION_TIMEOUT_MS = 45_000;

const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("verification-timeout")), ms),
    ),
  ]);

const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const RESEND_SECONDS = 30;
const MAX_RESENDS = 3;
const LOCKOUT_MINUTES = 15;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

const formatPhone = (digits: string) => digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : `+91 ${digits}`;

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
  const [step, setStep] = useState<"email" | "phone" | "otp" | "name">("email");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errCode, setErrCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resends, setResends] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const recaptchaRef = useRef<HTMLDivElement | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  const resetVerifier = useCallback(() => {
    try { verifierRef.current?.clear(); } catch { /* already detached */ }
    verifierRef.current = null;
  }, []);

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
  // entry point; phone OTP is one tap away but no longer required.
  useEffect(() => {
    if (!isAuthOpen) return;
    setStep(needsProfile ? "name" : "email");
    setCode(""); setError(""); setErrCode(""); setBusy(false);
    setPassword("");
  }, [isAuthOpen, needsProfile]);

  // "email" and "phone" are both entry steps: either can be the one on screen
  // when a session appears or when an already-signed-in user opens the dialog.
  const atEntryStep = step === "email" || step === "phone";

  // A signed-in user with a complete profile never sees the flow.
  useEffect(() => {
    if (isAuthOpen && user && !needsProfile && atEntryStep) {
      closeAuth();
      router.push("/account");
    }
  }, [isAuthOpen, user, needsProfile, atEntryStep, closeAuth, router]);

  // Once Firebase reports a session, move to the name step or finish. Google
  // and email/password resolve while the entry step is on screen; phone OTP
  // resolves on the otp step. All three end at the same completeSession().
  useEffect(() => {
    if (!isAuthOpen || !user) return;
    if (needsProfile) setStep("name");
    else if (step === "otp") completeSession();
  }, [isAuthOpen, user, needsProfile, step, completeSession]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => () => resetVerifier(), [resetVerifier]);

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

  const sendCode = useCallback(async (isResend: boolean) => {
    if (!INDIAN_MOBILE.test(phone)) {
      setError("Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.");
      return;
    }
    if (Date.now() < lockedUntil) {
      setError(`Too many code requests. Try again in ${LOCKOUT_MINUTES} minutes.`);
      return;
    }
    if (isResend && resends >= MAX_RESENDS) {
      setLockedUntil(Date.now() + LOCKOUT_MINUTES * 60_000);
      setError(`Too many code requests. Try again in ${LOCKOUT_MINUTES} minutes.`);
      return;
    }
    const container = recaptchaRef.current;
    if (!container) return;

    setBusy(true); setError(""); setErrCode("");
    try {
      resetVerifier();
      // Invisible reCAPTCHA stays enabled for every user, including production.
      verifierRef.current = new RecaptchaVerifier(getFirebaseAuth(), container, { size: "invisible" });
      confirmationRef.current = await withTimeout(
        signInWithPhoneNumber(getFirebaseAuth(), `+91${phone}`, verifierRef.current),
        VERIFICATION_TIMEOUT_MS,
      );
      setStep("otp");
      setCode("");
      setCooldown(RESEND_SECONDS);
      if (isResend) setResends((count) => count + 1);
    } catch (caught) {
      // The verifier is single-use once it has been consumed or has failed;
      // clearing it here is what lets the next attempt render a fresh one.
      resetVerifier();
      const timedOut = caught instanceof Error && caught.message === "verification-timeout";
      setError(timedOut ? VERIFICATION_TIMEOUT_MESSAGE : describeError(caught));
      setErrCode(timedOut ? "auth/timeout" : errorCode(caught));
    } finally {
      setBusy(false);
    }
  }, [phone, resends, lockedUntil, resetVerifier]);

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

  const verify = useCallback(async (entered: string) => {
    const confirmation = confirmationRef.current;
    if (!confirmation) {
      setStep("phone");
      setError("That verification session has expired. Request a new code.");
      return;
    }
    if (!/^\d{6}$/.test(entered) || busy) return;
    setBusy(true); setError(""); setErrCode("");
    try {
      await confirmation.confirm(entered);
      confirmationRef.current = null;
      resetVerifier();
      // onAuthStateChanged drives the next step (name, or completeSession).
    } catch (caught) {
      setError(describeError(caught));
      setErrCode(errorCode(caught));
      setCode("");
      if (errorCode(caught) === "auth/code-expired") { confirmationRef.current = null; setStep("phone"); }
    } finally {
      setBusy(false);
    }
  }, [busy, resetVerifier]);

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
              <button type="button" className="auth-linkish" disabled={busy} onClick={() => { setStep("phone"); setError(""); setErrCode(""); }}>
                Use my mobile number instead
              </button>
            </p>

            <p className="auth-legal">
              By continuing you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        )}

        {step === "phone" && (
          <form onSubmit={(event) => { event.preventDefault(); if (!busy) void sendCode(false); }}>
            <AuthBrand />
            <h2 id="auth-title">Sign in with your mobile</h2>
            <p className="auth-sub">Enter your mobile number and we&rsquo;ll text you a one-time code. No password needed.</p>
            <label htmlFor="auth-phone">Mobile number</label>
            <div className="phone-auth-field">
              <span className="phone-auth-prefix" aria-hidden="true">+91</span>
              <input
                id="auth-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                placeholder="10-digit mobile number"
                aria-describedby="auth-message"
                value={phone}
                disabled={busy}
                onChange={(event) => { setPhone(event.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); setErrCode(""); }}
              />
            </div>
            <button className="store-button store-button-primary auth-submit" type="submit" disabled={busy || !INDIAN_MOBILE.test(phone)}>
              {busy ? "Sending…" : "Continue"}
            </button>

            <p className="auth-alt">
              <button type="button" className="auth-linkish" disabled={busy} onClick={() => { setStep("email"); setError(""); setErrCode(""); }}>
                Use email and password instead
              </button>
            </p>

            <p className="auth-legal">
              By continuing you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={(event) => { event.preventDefault(); void verify(code); }}>
            <AuthBrand />
            <h2 id="auth-title">Enter the code</h2>
            <p className="auth-sub">
              Sent to {formatPhone(phone)}.{" "}
              <button type="button" className="auth-linkish" onClick={() => { setStep("phone"); setCode(""); setError(""); confirmationRef.current = null; resetVerifier(); }}>
                Change number
              </button>
            </p>
            <OtpInput value={code} onChange={(next) => { setCode(next); setError(""); }} onComplete={verify} disabled={busy} describedBy="auth-message" />
            <button className="store-button store-button-primary auth-submit" type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify"}
            </button>
            <p className="auth-resend" aria-live="polite">
              {cooldown > 0
                ? `Resend code in ${cooldown}s`
                : resends >= MAX_RESENDS
                  ? `Too many requests. Try again in ${LOCKOUT_MINUTES} minutes.`
                  : <button type="button" className="auth-linkish" disabled={busy} onClick={() => void sendCode(true)}>Resend code</button>}
            </p>
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
              Just your name — you&rsquo;re signed in as {user?.email ?? user?.phoneNumber ?? formatPhone(phone)}.
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

        <div ref={recaptchaRef} />
      </div>
    </div>
  );
}
