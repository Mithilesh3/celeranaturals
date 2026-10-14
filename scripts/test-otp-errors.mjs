/**
 * Drives the real auth modal in headless Chrome.
 *
 * Headless Chrome cannot complete Google's invisible reCAPTCHA challenge, so
 * signInWithPhoneNumber never settles here. That makes this an exact
 * reproduction of a blocked-reCAPTCHA client, and therefore a real test of the
 * timeout guard: before the fix the dialog span forever with no message.
 *
 * No SMS is sent and no account is signed in.
 *
 *   node scripts/test-otp-errors.mjs http://127.0.0.1:3191
 */
import { evaluate, goto, launch, pageConnection, screenshot, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3191";
const { child, port } = await launch();
const cdp = await pageConnection(port);

const logs = [];
cdp.on("Runtime.consoleAPICalled", (p) => {
  const text = p.args.map((a) => a.value ?? a.description ?? "").join(" ");
  if (text) logs.push(`${p.type}: ${text}`);
});

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/**
 * The modal now opens on email + password, with phone OTP one tap away, so
 * every OTP check has to switch to that step first.
 */
const toPhoneStep = () => evaluate(cdp, undefined, `(async () => {
  if (document.querySelector('#auth-phone')) return 'already';
  const link = [...document.querySelectorAll('button')].find(b => /mobile number instead/i.test(b.textContent || ''));
  if (!link) return 'link missing';
  link.click();
  await new Promise(r => setTimeout(r, 600));
  return document.querySelector('#auth-phone') ? 'phone-step' : 'did not switch';
})()`);

const submit = (digits) => evaluate(cdp, undefined, `(async () => {
  const setValue = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const field = [...document.querySelectorAll('input')].find(i => i.inputMode === 'numeric' || i.autocomplete === 'tel-national');
  if (!field) return 'no phone field';
  setValue(field, ${JSON.stringify(digits)});
  await new Promise(r => setTimeout(r, 400));
  const btn = [...document.querySelectorAll('button')].find(b => /continue|send|get code/i.test(b.textContent || ''));
  if (!btn) return 'no submit button';
  if (btn.disabled) return 'submit disabled';
  btn.click();
  return 'submitted';
})()`);

const state = () => evaluate(cdp, undefined, `(() => {
  const err = document.querySelector('.phone-auth-error');
  const hint = document.querySelector('.phone-auth-code-hint');
  const busy = [...document.querySelectorAll('button')].some(b => /verifying|sending|please wait/i.test(b.textContent || ''));
  return { message: err ? err.textContent.trim() : '', code: hint ? hint.textContent.trim() : '',
           otpStep: [...document.querySelectorAll('input')].some(i => i.maxLength === 6), busy };
})()`);

/** Polls from Node so the wait can exceed the per-command CDP timeout. */
async function waitForOutcome(maxMs) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const s = await state();
    if (s.message || s.otpStep) return { ...s, waited: Math.round((Date.now() - started) / 1000) };
    await sleep(2500);
  }
  return { message: "", otpStep: false, waited: Math.round(maxMs / 1000) };
}

try {
  await setViewport(cdp, undefined, 420, 900, true);
  await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2500 });
  check("auth modal renders on /account when signed out",
    (await evaluate(cdp, undefined, `!!document.querySelector('#auth-email')`)) === true);
  check("phone OTP is still reachable from the modal", (await toPhoneStep()) === "phone-step");

  console.log("\n--- too-short number (never reaches Firebase)");
  check("submit stays disabled for an invalid number", (await submit("12345")) === "submit disabled");

  console.log("\n--- valid number with reCAPTCHA unavailable (headless)");
  await goto(cdp, undefined, `${BASE}/account`, { waitMs: 2200 }); await toPhoneStep();
  logs.length = 0;
  check("submit is accepted for a valid number", (await submit("9811351137")) === "submitted");

  const outcome = await waitForOutcome(70_000);
  console.log("   outcome:", JSON.stringify(outcome));
  check("the dialog does not hang silently", Boolean(outcome.message), `waited ${outcome.waited}s`);
  check("the message explains a blocked reCAPTCHA",
    /reCAPTCHA|taking too long|blocker/i.test(outcome.message), outcome.message.slice(0, 90));
  check("no raw server payload is shown",
    !/BILLING_NOT_ENABLED|identitytoolkit|apiKey|Bearer|\{/.test(outcome.message));
  check("the error code shown is a safe auth/* code",
    !outcome.code || /^\(auth\/[a-z-]+\)$/.test(outcome.code), outcome.code || "(none)");
  await screenshot(cdp, undefined, ".audit/otp-timeout.png");

  console.log("\n--- retry after failure (verifier lifecycle)");
  const retry = await submit("9811351137");
  check("the form accepts a retry after a failed attempt", retry === "submitted", retry);
  const after = await waitForOutcome(70_000);
  check("the retry also reports rather than hanging", Boolean(after.message), `waited ${after.waited}s`);
  check("no reCAPTCHA 'already rendered' error on retry",
    !/already been rendered|already rendered/i.test(after.message), after.message.slice(0, 70));

  console.log("\n   browser console:");
  [...new Set(logs)].slice(0, 5).forEach((l) => console.log("     ", l.slice(0, 150)));
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  cdp.close(); child.kill(); await sleep(400);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
