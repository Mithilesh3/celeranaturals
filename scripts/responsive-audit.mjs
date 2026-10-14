/**
 * Real-browser responsive audit.
 *
 * Opens each route at each viewport in headless Chrome and measures the actual
 * rendered layout: horizontal overflow, which elements cause it, undersized tap
 * targets, console errors and failed requests. Screenshots are written so the
 * layouts can be inspected rather than assumed.
 *
 *   node scripts/responsive-audit.mjs http://localhost:3171 [--shots]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluate, goto, launch, pageConnection, screenshot, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://localhost:3171";
const SHOTS = process.argv.includes("--shots");
const OUT = path.join(process.cwd(), ".audit");
mkdirSync(OUT, { recursive: true });

export const VIEWPORTS = [
  { name: "320", width: 320, height: 640, mobile: true },
  { name: "360", width: 360, height: 740, mobile: true },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "430", width: 430, height: 932, mobile: true },
  { name: "768", width: 768, height: 1024, mobile: true },
  { name: "1024", width: 1024, height: 768, mobile: false },
  { name: "1280", width: 1280, height: 800, mobile: false },
  { name: "1440", width: 1440, height: 900, mobile: false },
];

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/shop", name: "shop" },
  { path: "/product/celera-naturals-isabgol-psyllium-husk-2x100g", name: "product" },
  { path: "/about", name: "about" },
  { path: "/contact", name: "contact" },
  { path: "/account", name: "account" },
  { path: "/cart", name: "cart" },
  { path: "/checkout", name: "checkout" },
  { path: "/wishlist", name: "wishlist" },
  { path: "/admin", name: "admin-login" },
];

/**
 * Runs in the page. Reports overflow against the viewport and names the
 * elements responsible, ignoring anything deliberately positioned off-screen
 * (closed drawers, visually-hidden helpers).
 */
const PROBE = `(() => {
  const vw = window.innerWidth;
  const maskedBody = getComputedStyle(document.body).overflowX;
  const maskedHtml = getComputedStyle(document.documentElement).overflowX;
  // Measure the TRUE document width with any overflow-x:hidden lifted, so a
  // blanket clip cannot report a defect as fixed. Restored immediately after.
  const prevBody = document.body.style.overflowX;
  const prevHtml = document.documentElement.style.overflowX;
  document.body.style.overflowX = 'visible';
  document.documentElement.style.overflowX = 'visible';
  const trueDocW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  document.body.style.overflowX = prevBody;
  document.documentElement.style.overflowX = prevHtml;

  const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const describe = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
      : '';
    return el.tagName.toLowerCase() + id + cls;
  };
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // Off-canvas drawers and scrim layers are intentional, not defects.
    if (style.position === 'fixed' && (style.transform || '').includes('matrix')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      offenders.push({ sel: describe(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
    }
  }
  offenders.sort((a, b) => b.right - a.right);

  // Interactive controls that are hard to tap.
  const small = [];
  for (const el of document.querySelectorAll('button, a, input, select, [role="button"]')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 32) small.push({ sel: describe(el), h: Math.round(r.height), w: Math.round(r.width) });
  }

  // Elements wider than the viewport, EXCLUDING any that an ancestor clips.
  // A scaled product image inside overflow:hidden is contained by design and
  // is not a layout defect; reporting it would bury the real ones.
  const clippedByAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/hidden|clip|auto|scroll/.test(o.overflowX) || /hidden|clip|auto|scroll/.test(o.overflow)) return true;
    }
    return false;
  };
  const tooWide = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1 && !clippedByAncestor(el)) tooWide.push({ sel: describe(el), w: Math.round(r.width) });
  }

  return {
    vw, docW, trueDocW,
    overflow: Math.max(0, docW - vw),
    trueOverflow: Math.max(0, trueDocW - vw),
    bodyOverflowX: maskedBody,
    htmlOverflowX: maskedHtml,
    offenders: offenders.slice(0, 8),
    tooWide: tooWide.slice(0, 6),
    small: small.slice(0, 8),
    title: document.title,
  };
})()`;

export async function auditRoutes({ cdp, sessionId, routes, viewports, label, shots = SHOTS, consoleLog, netLog }) {
  const findings = [];

  for (const route of routes) {
    for (const vp of viewports) {
      consoleLog.length = 0;
      netLog.length = 0;
      process.stdout.write(`  . ${route.name}@${vp.name}`);

      // One stuck route must not abort the whole sweep.
      let probe;
      try {
        await setViewport(cdp, sessionId, vp.width, vp.height, vp.mobile);
        await goto(cdp, sessionId, `${BASE}${route.path}`);
        probe = await evaluate(cdp, sessionId, PROBE);
      } catch (error) {
        process.stdout.write(`  FAILED: ${error.message}\n`);
        findings.push({ route: route.name, vp: vp.name, error: error.message });
        continue;
      }
      process.stdout.write(`  doc=${probe.docW}\n`);

      if (shots) {
        await screenshot(cdp, sessionId, path.join(OUT, `${label}-${route.name}-${vp.name}.png`));
      }

      findings.push({
        route: route.name,
        path: route.path,
        vp: vp.name,
        ...probe,
        consoleErrors: [...consoleLog],
        failedRequests: [...netLog],
      });
    }
  }
  return findings;
}

export function report(findings, heading) {
  console.log(`\n=== ${heading}`);
  let problems = 0;
  for (const f of findings) {
    if (f.error) { console.log(`  ERROR  ${f.route} @${f.vp}: ${f.error}`); problems++; continue; }
    const flags = [];
    if (f.trueOverflow > 0) {
      flags.push(`OVERFLOW +${f.trueOverflow}px${f.overflow === 0 ? " (masked by overflow-x:hidden)" : ""}`);
    }
    if (f.tooWide?.length) flags.push(`WIDE ${f.tooWide.map((t) => `${t.sel}=${t.w}`).join(" ")}`);
    if (f.consoleErrors?.length) flags.push(`CONSOLE ${f.consoleErrors.length}`);
    if (f.failedRequests?.length) flags.push(`NET ${f.failedRequests.length}`);
    if (f.small?.length) flags.push(`TAP<32 ${f.small.length}`);
    if (flags.length) {
      problems++;
      console.log(`  ${f.route.padEnd(13)} @${f.vp.padEnd(5)} ${flags.join(" | ")}`);
      for (const o of (f.offenders ?? []).slice(0, 3)) console.log(`       -> ${o.sel} left=${o.left} right=${o.right} w=${o.w}`);
      for (const c of (f.consoleErrors ?? []).slice(0, 2)) console.log(`       !! ${c.slice(0, 150)}`);
      for (const n of (f.failedRequests ?? []).slice(0, 2)) console.log(`       xx ${n.slice(0, 150)}`);
      for (const s of (f.small ?? []).slice(0, 3)) console.log(`       ~~ tap ${s.sel} ${s.w}x${s.h}`);
    } else {
      console.log(`  ${f.route.padEnd(13)} @${f.vp.padEnd(5)} ok  (doc ${f.docW} / vw ${f.vw})`);
    }
  }
  console.log(`  --- ${problems} route/viewport combinations with findings out of ${findings.length}`);
  return problems;
}

async function main() {
  const { child, port } = await launch();
  const cdp = await pageConnection(port);
  const sessionId = undefined;

  const consoleLog = [];
  const netLog = [];
  cdp.on("Runtime.exceptionThrown", (p) => consoleLog.push(p.exceptionDetails?.exception?.description ?? "exception"));
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") consoleLog.push(p.args.map((a) => a.value ?? a.description ?? "").join(" "));
  });
  cdp.on("Network.loadingFailed", (p) => {
    if (!p.canceled) netLog.push(`${p.type} ${p.errorText}`);
  });

  try {
    const findings = await auditRoutes({
      cdp, sessionId, routes: ROUTES, viewports: VIEWPORTS, label: "store", consoleLog, netLog,
    });
    writeFileSync(path.join(OUT, "storefront.json"), JSON.stringify(findings, null, 1));
    const problems = report(findings, `STOREFRONT — ${ROUTES.length} routes x ${VIEWPORTS.length} viewports`);
    console.log(`\nscreenshots: ${SHOTS ? OUT : "(skipped, pass --shots)"}`);
    process.exitCode = problems ? 1 : 0;
  } finally {
    cdp.close();
    child.kill();
    await sleep(300);
  }
}

// pathToFileURL, not string building: on Windows a path becomes file:///D:/...
// with three slashes, so a hand-made "file://" + path never matches.
const { pathToFileURL } = await import("node:url");
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
