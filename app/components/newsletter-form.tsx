"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
type State = "idle" | "sending" | "done" | "error";

export function NewsletterForm() {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const normalized = email.trim().toLowerCase();
    if (!normalized) { setState("error"); setMessage("Enter your email address."); return; }
    if (!EMAIL.test(normalized)) { setState("error"); setMessage("Enter a valid email address."); return; }

    inFlight.current = true;
    setState("sending");
    setMessage("");
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState("error");
        setMessage(data.error ?? "Could not save your subscription. Please try again.");
        return;
      }
      setState("done");
      setMessage(data.alreadySubscribed
        ? "You're already on the list — nothing more to do."
        : "You're subscribed! We'll keep you updated.");
      setEmail("");
    } catch {
      setState("error");
      setMessage("Network problem. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setState((current) => (current === "sending" ? "idle" : current));
    }
  }

  const sending = state === "sending";

  return (
    <>
      <form className="newsletter" onSubmit={submit} noValidate>
        <label className="store-sr-only" htmlFor={inputId}>Email address</label>
        <input
          id={inputId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Enter your email"
          maxLength={254}
          value={email}
          disabled={sending}
          aria-describedby={`${inputId}-status`}
          aria-invalid={state === "error"}
          onChange={(event) => { setEmail(event.target.value); if (state === "error") { setState("idle"); setMessage(""); } }}
        />
        <button className="btn btn-primary" type="submit" disabled={sending || !email.trim()}>
          {sending ? "Subscribing…" : "Subscribe"}
        </button>
      </form>

      <p
        id={`${inputId}-status`}
        className={`newsletter-status${state === "error" ? " is-error" : state === "done" ? " is-done" : ""}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>

      {/* States plainly what this does: it records an address, nothing is sent yet. */}
      <p className="newsletter-consent">
        We record your address so we can send product updates once mailing is set up. No marketing emails are being sent today.
        See our <Link href="https://celeranaturals.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
      </p>
    </>
  );
}
