/**
 * Responsive audit of the authenticated Admin Panel.
 *
 * Authorization is NOT bypassed. A throwaway Firebase account is created and
 * a separate server instance is started with ADMIN_EMAILS set to just that
 * address, so the real allowlist in .env.local is untouched. The browser then
 * signs in through the real login form with real credentials and the server
 * verifies the ID token exactly as it does in production. The account is
 * deleted at the end.
 *
 *   node scripts/audit-admin.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { evaluate, goto, launch, pageConnection, screenshot, setViewport, sleep } from "./cdp.mjs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] ??= v;
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}

const auth = getAuth();
const PORT = 3181;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(process.cwd(), ".audit");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "320", width: 320, height: 640, mobile: true },
  { name: "360", width: 360, height: 740, mobile: true },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "430", width: 430, height: 932, mobile: true },
  { name: "768", width: 768, height: 1024, mobile: true },
  { name: "1024", width: 1024, height: 768, mobile: false },
  { name: "1280", width: 1280, height: 800, mobile: false },
  { name: "1440", width: 1440, height: 900, mobile: false },
  // Deliberately short, to exercise drawers and sticky footers.
  { name: "short-740x500", width: 740, height: 500, mobile: false },
  { name: "short-390x620", width: 390, height: 620, mobile: true },
];

const MEASURE = `(() => {
  const vw = innerWidth;
  const prevB = document.body.style.overflowX, prevH = document.documentElement.style.overflowX;
  document.body.style.overflowX = 'visible'; document.documentElement.style.overflowX = 'visible';
  const doc = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  document.body.style.overflowX = prevB; document.documentElement.style.overflowX = prevH;
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#'+el.id : '') +
    (typeof el.className === 'string' && el.className ? '.'+el.className.trim().split(/\\s+/).slice(0,2).join('.') : '');
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p); if (/hidden|clip|auto|scroll/.test(o.overflowX) || /hidden|clip|auto|scroll/.test(o.overflow)) return true; } return false; };
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1 && !clipped(el)) wide.push(describe(el) + '=' + Math.round(r.width));
  }
  const small = [];
  for (const el of document.querySelectorAll('button, a, input, select')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.height < 32) small.push(describe(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  // Is anything taller than the viewport but inside a non-scrollable box?
  const drawer = document.querySelector('.admin-drawer__panel');
  const drawerInfo = drawer ? (() => {
    const r = drawer.getBoundingClientRect();
    const body = drawer.querySelector('.admin-drawer__body');
    return { h: Math.round(r.height), fitsViewport: r.height <= innerHeight + 1,
      bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : null,
      footVisible: (() => { const f = drawer.querySelector('.admin-drawer__foot');
        if (!f) return null; const fr = f.getBoundingClientRect(); return fr.bottom <= innerHeight + 1 && fr.top >= 0; })() };
  })() : null;
  return { vw, doc, overflow: Math.max(0, doc - vw), wide: wide.slice(0, 6), small: small.slice(0, 6), drawer: drawerInfo,
    sidebarVisible: (() => { const s = document.querySelector('.admin-sidebar'); if (!s) return null;
      const r = s.getBoundingClientRect(); return r.left >= -1 && r.width > 0; })(),
    burgerVisible: (() => { const b = document.querySelector('.admin-burger'); return b ? getComputedStyle(b).display !== 'none' : null; })() };
})()`;

const stamp = Date.now();
const email = `qa-admin-${stamp}@example.invalid`;
const password = `Qa!Admin${stamp}`;
let server, user, cdp, chrome;
const findings = [];
let problems = 0;

const record = (label, vp, r) => {
  const flags = [];
  if (r.overflow > 0) flags.push(`OVERFLOW +${r.overflow}px`);
  if (r.wide.length) flags.push(`WIDE ${r.wide.join(" ")}`);
  if (r.small.length) flags.push(`TAP<32 ${r.small.length}`);
  if (r.drawer && !r.drawer.fitsViewport) flags.push(`DRAWER ${r.drawer.h}px > viewport`);
  if (r.drawer && r.drawer.footVisible === false) flags.push("DRAWER FOOTER OFFSCREEN");
  findings.push({ label, vp: vp.name, ...r });
  if (flags.length) { problems++; console.log(`  ${label.padEnd(20)} @${vp.name.padEnd(13)} ${flags.join(" | ")}`);
    for (const s of r.small.slice(0, 3)) console.log(`       ~~ ${s}`); }
  else console.log(`  ${label.padEnd(20)} @${vp.name.padEnd(13)} ok  (doc ${r.doc}/${r.vw}${r.drawer ? `, drawer ${r.drawer.h}px, foot ${r.drawer.footVisible}` : ""})`);
};

try {
  // A server left listening by an earlier run would carry a stale (deleted)
  // ADMIN_EMAILS, and the browser would hit that instead — producing a
  // confusing "Not authorised" that looks like a real authorization bug.
  try {
    await fetch(`${BASE}/admin`, { signal: AbortSignal.timeout(1500) });
    throw new Error(`port ${PORT} is already in use; stop that server first`);
  } catch (error) {
    if (String(error.message).includes("already in use")) throw error;
  }

  user = await auth.createUser({ email, password, displayName: "QA Admin" });
  console.log("created throwaway admin account");

  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, ADMIN_EMAILS: email },
    shell: true, stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/admin`); if (r.ok) break; } catch { /* starting */ }
    await sleep(500);
  }
  console.log("test server up with a scoped ADMIN_EMAILS (real .env.local untouched)");

  const browser = await launch();
  chrome = browser.child;
  cdp = await pageConnection(browser.port);

  // ---- unauthenticated admin ------------------------------------------
  console.log("\n--- /admin, signed out");
  for (const vp of VIEWPORTS) {
    await setViewport(cdp, undefined, vp.width, vp.height, vp.mobile);
    await goto(cdp, undefined, `${BASE}/admin`, { waitMs: 1100 });
    record("login", vp, await evaluate(cdp, undefined, MEASURE));
    await screenshot(cdp, undefined, path.join(OUT, `admin-login-${vp.name}.png`));
  }

  // ---- sign in through the real form ----------------------------------
  await setViewport(cdp, undefined, 1280, 800, false);
  await goto(cdp, undefined, `${BASE}/admin`, { waitMs: 1200 });
  const signedIn = await evaluate(cdp, undefined, `(async () => {
    const setValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const email = document.querySelector('#admin-email');
    const pw = document.querySelector('#admin-password');
    if (!email || !pw) return 'form not found';
    setValue(email, ${JSON.stringify(email)});
    setValue(pw, ${JSON.stringify(password)});
    const form = email.closest('form');
    const submit = document.querySelector('.admin-login__submit');
    if (!submit) return 'submit not found';
    // The submit button is disabled until React re-renders with the typed
    // values, so clicking in the same tick silently does nothing.
    await new Promise(r => setTimeout(r, 400));
    if (submit.disabled) return 'submit still disabled';
    submit.click();
    for (let i = 0; i < 28; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (document.querySelector('.admin-sidebar')) return 'dashboard';
      const err = document.querySelector('.admin-login__error');
      if (err && err.textContent.trim()) return 'error: ' + err.textContent.trim();
    }
    return 'timeout | ' + JSON.stringify({
      disabled: submit.disabled,
      btn: submit.textContent.trim(),
      err: document.querySelector('.admin-login__error')?.textContent?.trim() ?? null,
      gate: document.querySelector('.admin-gate h1')?.textContent ?? null,
      hasSidebar: !!document.querySelector('.admin-sidebar'),
      url: location.pathname,
    });
  })()`);
  console.log("\nsign-in result:", signedIn);
  if (signedIn !== "dashboard") throw new Error(`could not reach the dashboard: ${signedIn}`);

  // ---- authenticated sections -----------------------------------------
  const SECTIONS = ["Overview", "Orders", "Products", "Customers", "Newsletter Subscribers"];
  for (const section of SECTIONS) {
    console.log(`\n--- ${section}`);
    for (const vp of VIEWPORTS) {
      await setViewport(cdp, undefined, vp.width, vp.height, vp.mobile);
      await sleep(350);
      const picked = await evaluate(cdp, undefined, `(async () => {
        const open = document.querySelector('.admin-burger');
        if (open && getComputedStyle(open).display !== 'none') { open.click(); await new Promise(r => setTimeout(r, 350)); }
        const btn = [...document.querySelectorAll('.admin-sidebar nav button')]
          .find(b => b.textContent.trim().startsWith(${JSON.stringify(section)}));
        if (!btn) return 'nav button missing';
        btn.click();
        await new Promise(r => setTimeout(r, 1400));
        return 'ok';
      })()`);
      if (picked !== "ok") { console.log(`  ${section} @${vp.name}: ${picked}`); continue; }
      record(section.toLowerCase().split(" ")[0], vp, await evaluate(cdp, undefined, MEASURE));
      await screenshot(cdp, undefined, path.join(OUT, `admin-${section.split(" ")[0].toLowerCase()}-${vp.name}.png`));
    }
  }

  // ---- order details drawer -------------------------------------------
  console.log("\n--- Orders > order details drawer");
  for (const vp of VIEWPORTS) {
    await setViewport(cdp, undefined, vp.width, vp.height, vp.mobile);
    await sleep(300);
    const opened = await evaluate(cdp, undefined, `(async () => {
      const burger = document.querySelector('.admin-burger');
      if (burger && getComputedStyle(burger).display !== 'none') { burger.click(); await new Promise(r => setTimeout(r, 350)); }
      const nav = [...document.querySelectorAll('.admin-sidebar nav button')].find(b => b.textContent.trim().startsWith('Orders'));
      if (nav) { nav.click(); await new Promise(r => setTimeout(r, 1500)); }
      const row = document.querySelector('.admin-table__row, button.admin-table__row');
      if (!row) return 'no orders to open';
      row.click();
      await new Promise(r => setTimeout(r, 1600));
      return document.querySelector('.admin-drawer__panel') ? 'open' : 'drawer did not open';
    })()`);
    if (opened !== "open") { console.log(`  drawer @${vp.name}: ${opened}`); continue; }
    record("order-drawer", vp, await evaluate(cdp, undefined, MEASURE));
    await screenshot(cdp, undefined, path.join(OUT, `admin-drawer-${vp.name}.png`));
    await evaluate(cdp, undefined, `(() => { const b = document.querySelector('.admin-drawer__head button'); if (b) b.click(); return 1; })()`);
    await sleep(300);
  }

  writeFileSync(path.join(OUT, "admin.json"), JSON.stringify(findings, null, 1));
  console.log(`\n--- ${problems} combinations with findings out of ${findings.length}`);
} catch (error) {
  console.log("\nAUDIT ERROR:", error.message);
  process.exitCode = 1;
} finally {
  try { cdp?.close(); } catch { /* ignore */ }
  try { chrome?.kill(); } catch { /* ignore */ }
  if (server) {
    spawn("cmd", ["/c", `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %a`], { shell: true, stdio: "ignore" });
  }
  if (user) { await auth.deleteUser(user.uid).catch(() => {}); console.log("removed throwaway admin account"); }
  await sleep(1200);
  process.exit(process.exitCode ?? 0);
}
