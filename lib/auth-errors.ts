/**
 * Turns a Firebase Auth failure into a message a customer can act on.
 *
 * Pure and dependency-free so it can be unit-tested without a browser.
 *
 * Why this exists in this shape: the Firebase JS SDK only maps a subset of
 * Identity Toolkit error codes to `auth/*` codes. Anything it does not know —
 * BILLING_NOT_ENABLED is the important one here — is surfaced as a generic
 * `auth/internal-error` with the original body left on
 * `customData.serverResponse`. Switching on the `auth/*` code alone therefore
 * collapsed a precise, actionable server error into "Could not complete
 * verification. Please try again."
 *
 * So the server code is consulted FIRST, and the `auth/*` code is the fallback.
 *
 * Nothing from the raw server payload is ever returned to the UI: only these
 * fixed strings are, so no token, key or internal detail can leak into the DOM.
 */

export function errorCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

/** Raw text of the failure, used only for matching — never displayed. */
export function serverDetail(error: unknown): string {
  if (typeof error !== "object" || !error) return "";
  const source = error as { message?: unknown; customData?: { serverResponse?: unknown } };
  let text = typeof source.message === "string" ? source.message : "";
  const response = source.customData?.serverResponse;
  if (response) {
    try { text += " " + JSON.stringify(response); } catch { /* circular; message alone is enough */ }
  }
  return text;
}

/**
 * The Identity Toolkit code, e.g. "BILLING_NOT_ENABLED". Firebase formats these
 * as `CODE` or `CODE : human readable detail`, either in error.message or in
 * the attached serverResponse.
 */
export function serverErrorCode(error: unknown): string {
  const haystack = serverDetail(error);
  if (!haystack) return "";
  const known = [
    "BILLING_NOT_ENABLED",
    "OPERATION_NOT_ALLOWED",
    "SMS_REGION_NOT_ALLOWED",
    "UNSUPPORTED_PHONE_NUMBER",
    "TOO_MANY_ATTEMPTS_TRY_LATER",
    "QUOTA_EXCEEDED",
    "INVALID_PHONE_NUMBER",
    "MISSING_PHONE_NUMBER",
    "INVALID_CODE",
    "INVALID_SESSION_INFO",
    "SESSION_EXPIRED",
    "CAPTCHA_CHECK_FAILED",
    "MISSING_RECAPTCHA_TOKEN",
    "INVALID_RECAPTCHA_TOKEN",
    "INVALID_APP_CREDENTIAL",
    "API_KEY_HTTP_REFERRER_BLOCKED",
    "PERMISSION_DENIED",
  ];
  return known.find((code) => haystack.includes(code)) ?? "";
}

const SERVER_MESSAGES: Record<string, string> = {
  // Phone sign-in bills SMS, so Firebase refuses it on a project without
  // billing. Nothing in the app can work around this.
  BILLING_NOT_ENABLED:
    "SMS verification is unavailable because the Firebase project has no billing account. An administrator needs to upgrade the project to the Blaze plan to send verification codes.",
  SMS_REGION_NOT_ALLOWED:
    "SMS to this region is not enabled for this Firebase project. An administrator needs to allow India under Authentication → Settings → SMS region policy.",
  UNSUPPORTED_PHONE_NUMBER: "Verification codes cannot be sent to this number.",
  OPERATION_NOT_ALLOWED: "Phone sign-in is not enabled for this Firebase project.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts from this device. Wait a few minutes before trying again.",
  QUOTA_EXCEEDED: "The SMS limit for this project has been reached. Please try again later.",
  INVALID_PHONE_NUMBER: "That number was not accepted. Enter a 10-digit Indian mobile number.",
  MISSING_PHONE_NUMBER: "That number was not accepted. Enter a 10-digit Indian mobile number.",
  INVALID_CODE: "That code is incorrect. Check the 6 digits and try again.",
  SESSION_EXPIRED: "This code has expired. Request a new one.",
  INVALID_SESSION_INFO: "That verification session has expired. Request a new code.",
  CAPTCHA_CHECK_FAILED: "Verification check failed. Reload the page and try again.",
  MISSING_RECAPTCHA_TOKEN: "Verification check could not start. Reload the page and try again.",
  INVALID_RECAPTCHA_TOKEN: "Verification check failed. Reload the page and try again.",
  INVALID_APP_CREDENTIAL: "Verification check failed. Reload the page and try again.",
  // The API key is restricted to referrers that do not include this origin.
  API_KEY_HTTP_REFERRER_BLOCKED:
    "This site is not authorised to use the Firebase project. An administrator needs to add this domain to the API key's allowed referrers and to Authentication → Settings → Authorized domains.",
  PERMISSION_DENIED: "Sign-in is not permitted for this project right now.",
};

const AUTH_MESSAGES: Record<string, string> = {
  "auth/operation-not-allowed": "Phone sign-in is not enabled for this Firebase project.",
  "auth/invalid-phone-number": "That number was not accepted. Enter a 10-digit Indian mobile number.",
  "auth/missing-phone-number": "That number was not accepted. Enter a 10-digit Indian mobile number.",
  "auth/invalid-verification-code": "That code is incorrect. Check the 6 digits and try again.",
  "auth/code-expired": "This code has expired. Request a new one.",
  "auth/too-many-requests": "Too many attempts from this device. Wait a few minutes before trying again.",
  "auth/quota-exceeded": "The SMS limit for this project has been reached. Please try again later.",
  "auth/network-request-failed": "Network problem. Your details are kept — check your connection and try again.",
  "auth/captcha-check-failed": "Verification check failed. Reload the page and try again.",
  "auth/invalid-app-credential": "Verification check failed. Reload the page and try again.",
  "auth/unauthorized-domain": "This site is not authorised for sign-in. An administrator needs to add this domain under Authentication → Settings → Authorized domains.",
  // Retained for SDK versions that do map this; today it arrives as
  // auth/internal-error and is caught by the server-code branch above.
  "auth/billing-not-enabled": SERVER_MESSAGES.BILLING_NOT_ENABLED,
  "auth/timeout": "Verification timed out. Check your connection and try again.",

  // Email + password
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Enter your password.",
  "auth/weak-password": "Choose a password of at least 6 characters.",
  "auth/email-already-in-use": "An account already exists with this email. Sign in instead.",
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "No account found with this email. Create one instead.",
  "auth/user-disabled": "This account has been disabled. Contact support for help.",

  // Google / federated
  "auth/popup-closed-by-user": "The Google sign-in window was closed before finishing.",
  "auth/cancelled-popup-request": "",
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site, or try again.",
  "auth/account-exists-with-different-credential":
    "An account already exists with this email using a different sign-in method. Use that method instead.",
  "auth/operation-not-supported-in-this-environment":
    "Google sign-in isn't available in this browser. Try email and password instead.",
};

/** Raised by the modal when reCAPTCHA never resolves, so the UI cannot hang. */
export const VERIFICATION_TIMEOUT_MESSAGE =
  "Verification is taking too long to start. This is usually a blocked reCAPTCHA. Reload the page, disable any ad or script blocker for this site, and try again.";

/** Which sign-in method produced the error; only changes provider-specific wording. */
export type AuthMethod = "phone" | "google" | "email" | "reset";

const NOT_ENABLED: Record<AuthMethod, string> = {
  phone: "Phone sign-in is not enabled for this Firebase project.",
  google: "Google sign-in is not enabled for this project yet. An administrator needs to turn it on in Firebase Authentication → Sign-in method → Google.",
  email: "Email and password sign-in is not enabled for this Firebase project.",
  reset: "Password reset is not enabled for this Firebase project.",
};

export function describeError(error: unknown, method: AuthMethod = "phone"): string {
  const code = errorCode(error);

  // "Provider disabled" is the same code for every provider but needs
  // different wording, so the caller's method decides.
  if (code === "auth/operation-not-allowed") {
    return /region/i.test(serverDetail(error)) ? SERVER_MESSAGES.SMS_REGION_NOT_ALLOWED : NOT_ENABLED[method];
  }

  // The server code is more specific than the SDK's bucketed auth/* code and
  // is checked first; a region refusal and a billing refusal both arrive as
  // auth/internal-error but need very different messages.
  const fromServer = SERVER_MESSAGES[serverErrorCode(error)];
  if (fromServer) return fromServer;

  const mapped = AUTH_MESSAGES[code];
  if (mapped !== undefined) return mapped;
  if (method === "phone") return "Could not complete verification. Please try again.";
  if (method === "reset") return "Could not send the reset email. Please try again in a moment.";
  return "Could not sign you in. Please try again.";
}
