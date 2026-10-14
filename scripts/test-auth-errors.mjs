/**
 * Unit tests for the Firebase auth error mapping.
 *
 * Runs against the real lib/auth-errors.ts via Node's built-in TypeScript
 * stripping, using error objects shaped exactly as the Firebase JS SDK builds
 * them (code + message + customData.serverResponse).
 */
import { describeError, errorCode, serverErrorCode } from "../lib/auth-errors.ts";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/** How the SDK surfaces an Identity Toolkit code it does not know. */
const sdkError = (code, serverMessage) => ({
  code,
  name: "FirebaseError",
  message: `Firebase: Error (${code}).`,
  customData: {
    serverResponse: { error: { code: 400, message: serverMessage, errors: [{ message: serverMessage, domain: "global", reason: "invalid" }] } },
  },
});

// ---- the regression this task is about --------------------------------
const billing = sdkError("auth/internal-error", "BILLING_NOT_ENABLED");
check("BILLING_NOT_ENABLED is extracted from the server response",
  serverErrorCode(billing) === "BILLING_NOT_ENABLED", serverErrorCode(billing));
check("billing failure no longer falls through to the generic message",
  describeError(billing) !== "Could not complete verification. Please try again.");
check("billing message names billing and the Blaze upgrade",
  /billing/i.test(describeError(billing)) && /Blaze/.test(describeError(billing)),
  describeError(billing).slice(0, 80));
check("billing message does not leak the raw server code",
  !/BILLING_NOT_ENABLED|identitytoolkit|apiKey/i.test(describeError(billing)));

// ---- other Identity Toolkit codes arriving as internal-error ----------
const cases = [
  ["SMS_REGION_NOT_ALLOWED", /region/i],
  ["UNSUPPORTED_PHONE_NUMBER", /cannot be sent/i],
  ["TOO_MANY_ATTEMPTS_TRY_LATER", /too many/i],
  ["QUOTA_EXCEEDED", /limit/i],
  ["INVALID_PHONE_NUMBER", /10-digit/i],
  ["CAPTCHA_CHECK_FAILED", /verification check/i],
  ["MISSING_RECAPTCHA_TOKEN", /verification check/i],
  ["API_KEY_HTTP_REFERRER_BLOCKED", /authoris|domain/i],
  ["OPERATION_NOT_ALLOWED", /not enabled/i],
];
for (const [code, expected] of cases) {
  const message = describeError(sdkError("auth/internal-error", code));
  check(`${code} maps to a specific message`, expected.test(message), message.slice(0, 70));
}

// Real Firebase formatting includes trailing detail after the code.
const withDetail = sdkError("auth/internal-error", "SMS_REGION_NOT_ALLOWED : region IN is not allowed");
check("a code followed by detail text still matches", /region/i.test(describeError(withDetail)));

// ---- mapped auth/* codes still work -----------------------------------
for (const [code, expected] of [
  ["auth/invalid-verification-code", /incorrect/i],
  ["auth/code-expired", /expired/i],
  ["auth/too-many-requests", /too many/i],
  ["auth/network-request-failed", /network/i],
  ["auth/unauthorized-domain", /authoris/i],
]) {
  const message = describeError({ code, message: `Firebase: Error (${code}).` });
  check(`${code} still maps`, expected.test(message), message.slice(0, 60));
}

// ---- region disambiguation on a mapped code ---------------------------
const regionOnAllowed = {
  code: "auth/operation-not-allowed",
  message: "Firebase: Error (auth/operation-not-allowed).",
  customData: { serverResponse: { error: { message: "SMS_REGION_NOT_ALLOWED" } } },
};
check("region refusal is distinguished from provider-disabled",
  /region/i.test(describeError(regionOnAllowed)), describeError(regionOnAllowed).slice(0, 60));
check("plain operation-not-allowed still says provider disabled",
  /not enabled/i.test(describeError({ code: "auth/operation-not-allowed", message: "Firebase: Error (auth/operation-not-allowed)." })));

// ---- robustness --------------------------------------------------------
check("unknown errors fall back to the generic message",
  describeError({ code: "auth/something-new" }) === "Could not complete verification. Please try again.");
check("null is handled", describeError(null) === "Could not complete verification. Please try again.");
check("a bare Error is handled", describeError(new Error("boom")) === "Could not complete verification. Please try again.");
check("errorCode reads the code", errorCode({ code: "auth/x" }) === "auth/x");
check("errorCode on null is empty", errorCode(null) === "");
check("circular serverResponse does not throw", (() => {
  const circular = { code: "auth/internal-error", message: "BILLING_NOT_ENABLED", customData: {} };
  circular.customData.serverResponse = circular;
  try { return /billing/i.test(describeError(circular)); } catch { return false; }
})());

// ---- no message leaks internals ---------------------------------------
const everyMessage = [
  ...cases.map(([c]) => describeError(sdkError("auth/internal-error", c))),
  describeError(billing),
];
check("no message contains a raw payload, key or token",
  everyMessage.every((m) => !/apiKey|identitytoolkit|Bearer|eyJ|serverResponse|\{/.test(m)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
