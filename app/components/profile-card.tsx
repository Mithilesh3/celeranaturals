"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import { getFirebaseAuth } from "./firebase";
import { formatIST } from "../../lib/orders";
import { PROFILE_NAME_MAX, formatCustomerPhone, validateContactPhone, validateDisplayName } from "../../lib/customers";

/**
 * The signed-in customer's own profile.
 *
 * Read from /api/account/profile, which resolves the account from a verified
 * ID token — this component never sends a uid, so it can only ever show the
 * caller's own record. Fields Firebase does not hold are shown as "Not
 * provided" rather than filled in with a guess.
 */
const providerLabel = (id: string) =>
  ({ "google.com": "Google", password: "Email and password", phone: "Mobile OTP" } as Record<string, string>)[id] ?? id;

type Profile = {
  name: string | null;
  /** OTP-verified, from the Firebase Auth record. */
  phone: string | null;
  /** Self-declared in the profile. NOT verified — labelled as such in the UI. */
  contactPhone: string | null;
  providers: string[];
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export function ProfileCard({ enabled }: { enabled: boolean }) {
  const { saveProfileName } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const response = await fetch("/api/account/profile", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) { setFailed(true); return; }
      setFailed(false);
      setProfile((await response.json()).profile);
    } catch { setFailed(true); }
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);

  const problem = validateDisplayName(name);
  // Optional field: only validated once something has been typed.
  const phoneProblem = contactPhone.trim() ? validateContactPhone(contactPhone) : null;

  const save = async () => {
    if (busy || problem || phoneProblem) return;
    setBusy(true); setError(""); setSaved("");
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ displayName: name, contactPhone: contactPhone.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not save your profile."); return; }
      // Keep the client auth record in step so the header greeting updates too.
      await saveProfileName(data.displayName).catch(() => {});
      setEditing(false);
      setSaved("Profile updated.");
      await load();
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <section className="panel" aria-labelledby="acc-profile">
      <h2 id="acc-profile" className="panel__heading">Profile</h2>

      {profile === null && !failed ? <p className="panel__hint">Loading your profile…</p>
        : failed ? <p className="panel__hint">Could not load your profile right now. Please try again shortly.</p>
        : (
          <>
            <dl className="detail-list">
              <div><dt>Name</dt><dd>{profile!.name ?? "Not set"}</dd></div>
              {/* The verified number and the self-declared one are shown as
                  separate facts; a typed number is never presented as verified. */}
              {profile!.phone && (
                <div><dt>Mobile number</dt><dd>{formatCustomerPhone(profile!.phone)} <small className="profile-verified">Verified</small></dd></div>
              )}
              <div>
                <dt>{profile!.phone ? "Alternate mobile" : "Mobile number"}</dt>
                <dd>
                  {profile!.contactPhone ? `+91 ${profile!.contactPhone.slice(0, 5)} ${profile!.contactPhone.slice(5)}` : "Not provided"}
                  {profile!.contactPhone && <small className="profile-unverified">Not verified</small>}
                </dd>
              </div>
              <div><dt>Email</dt><dd>{profile!.email ?? "Not provided"}</dd></div>
              <div><dt>Sign-in method</dt><dd>{(profile!.providers ?? []).map(providerLabel).join(", ") || "Not available"}</dd></div>
              <div><dt>Member since</dt><dd>{profile!.createdAt ? formatIST(profile!.createdAt) : "Not available"}</dd></div>
              <div><dt>Last sign-in</dt><dd>{profile!.lastSignInAt ? formatIST(profile!.lastSignInAt) : "Not available"}</dd></div>
            </dl>

            {saved && <p className="panel__hint" role="status">{saved}</p>}
            {error && <p className="phone-auth-error" role="alert">{error}</p>}

            {editing ? (
              <>
                <label className="checkout-field" htmlFor="profile-name">
                  <span>Your name</span>
                  <input
                    id="profile-name"
                    value={name}
                    maxLength={PROFILE_NAME_MAX}
                    disabled={busy}
                    autoComplete="name"
                    onChange={(event) => setName(event.target.value)}
                  />
                  {name.trim() && problem && <small className="phone-auth-error">{problem}</small>}
                </label>
                <label className="checkout-field" htmlFor="profile-contact-phone">
                  <span>{profile!.phone ? "Alternate mobile number" : "Mobile number"}</span>
                  <div className="phone-auth-field">
                    <span className="phone-auth-prefix" aria-hidden="true">+91</span>
                    <input
                      id="profile-contact-phone"
                      inputMode="numeric"
                      maxLength={10}
                      autoComplete="tel-national"
                      value={contactPhone}
                      disabled={busy}
                      aria-invalid={Boolean(phoneProblem)}
                      onChange={(event) => setContactPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                    />
                  </div>
                  {phoneProblem && <small className="phone-auth-error">{phoneProblem}</small>}
                  {/* Stated plainly: typing a number here does not verify it. */}
                  <small className="panel__hint">
                    Used for delivery updates. It isn&rsquo;t verified — only a number confirmed by OTP is.
                  </small>
                </label>
                <div className="address-book__actions">
                  <button className="store-button store-button-primary" type="button" disabled={busy || Boolean(problem) || Boolean(phoneProblem)} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save name"}
                  </button>
                  <button className="store-button store-button-secondary" type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button
                className="store-button store-button-secondary panel__action"
                type="button"
                onClick={() => { setName(profile!.name ?? ""); setContactPhone(profile!.contactPhone ?? ""); setSaved(""); setError(""); setEditing(true); }}
              >
                {profile!.name ? "Edit name" : "Add your name"}
              </button>
            )}
            <p className="panel__hint">
              Your mobile number and email are used to sign in, so they can&rsquo;t be changed here.
            </p>
          </>
        )}
    </section>
  );
}
