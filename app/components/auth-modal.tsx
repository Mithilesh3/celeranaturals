"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { getFirebaseAuth } from "./firebase";
import { useAuth } from "./auth-context";
import { useStore } from "./store-context";
import { OtpInput } from "./otp-input";

const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const RESEND_SECONDS = 30;
const MAX_RESENDS = 3;
const LOCKOUT_MINUTES = 15;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

function errorCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

/** Firebase overloads some codes, so the server text is needed to disambiguate. */
function serverDetail(error: unknown): string {
  if (typeof error !== "object" || !error) return "";
  const source = error as { message?: unknown; customData?: { serverResponse?: unknown } };
  let text = typeof source.message === "string" ? source.message : "";
  const response = source.customData?.serverResponse;
  if (response) { try { text += " " + JSON.stringify(response); } catch { /* ignore */ } }
  return text;
}

function describeError(error: unknown): string {
  const code = errorCode(error);
  const detail = serverDetail(error);
  switch (code) {
    case "auth/operation-not-allowed":
      return /region/i.test(detail)
        ? "SMS to this region is not enabled for this Firebase project. An administrator needs to allow India under Authentication → Settings → SMS region policy."
        : "Phone sign-in is not enabled for this Firebase project.";
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "That number was not accepted. Enter a 10-digit Indian mobile number.";
    case "auth/invalid-verification-code":
      return "That code is incorrect. Check the 6 digits and try again.";
    case "auth/code-expired":
      return "This code has expired. Request a new one.";
    case "auth/too-many-requests":
      return "Too many attempts from this device. Wait a few minutes before trying again.";
    case "auth/quota-exceeded":
      return "The SMS limit for this project has been reached. Please try again later.";
    case "auth/network-request-failed":
      return "Network problem. Your details are kept — check your connection and try again.";
    case "auth/captcha-check-failed":
    case "auth/invalid-app-credential":
      return "Verification check failed. Reload the page and try again.";
    case "auth/billing-not-enabled":
      return "SMS delivery is not available on the current Firebase plan.";
    default:
      return "Could not complete verification. Please try again.";
  }
}

const formatPhone = (digits: string) => digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : `+91 ${digits}`;

export function AuthModal() {
  const { user, needsProfile, isAuthOpen, intent, closeAuth, saveProfileName } = useAuth();
  const { addToCart } = useStore();
  const router = useRouter();

  const [step, setStep] = useState<"phone" | "otp" | "name">("phone");
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

  // Reset to a clean state each time the dialog opens.
  useEffect(() => {
    if (!isAuthOpen) return;
    setStep(needsProfile ? "name" : "phone");
    setCode(""); setError(""); setErrCode(""); setBusy(false);
  }, [isAuthOpen, needsProfile]);

  // A signed-in user with a complete profile never sees the flow.
  useEffect(() => {
    if (isAuthOpen && user && !needsProfile && step === "phone") {
      closeAuth();
      router.push("/account");
    }
  }, [isAuthOpen, user, needsProfile, step, closeAuth, router]);

  // Once Firebase reports a session, move to the name step or finish.
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
      confirmationRef.current = await signInWithPhoneNumber(getFirebaseAuth(), `+91${phone}`, verifierRef.current);
      setStep("otp");
      setCode("");
      setCooldown(RESEND_SECONDS);
      if (isResend) setResends((count) => count + 1);
    } catch (caught) {
      resetVerifier();
      setError(describeError(caught));
      setErrCode(errorCode(caught));
    } finally {
      setBusy(false);
    }
  }, [phone, resends, lockedUntil, resetVerifier]);

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

        {step === "phone" && (
          <form onSubmit={(event) => { event.preventDefault(); if (!busy) void sendCode(false); }}>
            <h2 id="auth-title">Sign in or create an account</h2>
            <p className="auth-sub">We&rsquo;ll send a one-time code to your mobile number.</p>
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

            {/* Slot reserved for "Continue with Google" and its divider.
                Intentionally not rendered yet; completeSession() is the shared
                path an OAuth provider will call. */}
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={(event) => { event.preventDefault(); void verify(code); }}>
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
            <p className="auth-sub">Just your name — you&rsquo;re signed in as {user?.phoneNumber ?? formatPhone(phone)}.</p>
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
