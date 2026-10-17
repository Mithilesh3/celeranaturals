/**
 * Drives the header "Categories" dropdown the way a visitor does, and follows
 * each link to confirm it actually filters the shop.
 *
 *   node scripts/test-nav-dropdown.mjs http://127.0.0.1:3421
 */
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3421";

/** The four categories plus the catch-all, with the slug each must land on. */
const LINKS = [
  ["Psyllium Husk", "psyllium-husk"],
  ["Vitamins and Minerals", "vitamins-minerals"],
  ["Probiotics", "probiotics"],
  ["Protein", "protein"],
  ["View All Products", "all"],
];

const { child, port } = await launch();
const cdp = await pageConnection(port);

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

const ev = (expr) => evaluate(cdp, undefined, expr);

/**
 * Visibility only. An earlier version also required the `.open` class, which
 * made the hover case look broken (hover opens via CSS and sets no class) and
 * let a stale state pass the Escape case.
 */
const isOpen = () => ev(`getComputedStyle(document.querySelector('.nav-dropdown-menu')).display !== 'none'`);

/** Always starts from a known-closed state, so a toggle cannot invert it. */
const openIt = async () => {
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 2200 });
  await ev(`document.querySelector('.nav-dropdown-trigger').click(), 1`);
  await sleep(350);
};

/** Real mouse movement, so CSS :hover and pointer-events are exercised. */
const mouseTo = async (x, y) => {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
  await sleep(120);
};

try {
  // ---- desktop: pointer behaviour ---------------------------------------
  await setViewport(cdp, undefined, 1440, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 2600 });

  check("menu starts closed", (await isOpen()) === false, "");

  await openIt();
  check("clicking the trigger opens the menu", (await isOpen()) === true, "");

  // The classic failure: a gap between trigger and menu that the pointer
  // crosses, dropping :hover and closing the menu before it is reached.
  const geom = await ev(`(() => {
    const t = document.querySelector('.nav-dropdown-trigger').getBoundingClientRect();
    const m = document.querySelector('.nav-dropdown-menu').getBoundingClientRect();
    const d = document.querySelector('.nav-dropdown').getBoundingClientRect();
    return { gap: Math.round(m.top - t.bottom), dropBottom: Math.round(d.bottom), menuTop: Math.round(m.top),
      tx: Math.round(t.x + t.width / 2), ty: Math.round(t.y + t.height / 2),
      mx: Math.round(m.x + m.width / 2), my: Math.round(m.y + 20),
      menuLeft: Math.round(m.left), menuRight: Math.round(m.right), vw: innerWidth };
  })()`);
  console.log(`      trigger->menu gap ${geom.gap}px`);

  // Walk the pointer from the trigger down into the menu, as a user would.
  await mouseTo(geom.tx, geom.ty);
  const steps = Math.max(1, Math.ceil((geom.my - geom.ty) / 6));
  for (let i = 1; i <= steps; i++) {
    await mouseTo(
      Math.round(geom.tx + ((geom.mx - geom.tx) * i) / steps),
      Math.round(geom.ty + ((geom.my - geom.ty) * i) / steps),
    );
  }
  check("menu survives the pointer travelling from trigger to menu",
    (await isOpen()) === true, `gap ${geom.gap}px`);

  // ---- hover-only opening, then crossing the gap without clicking --------
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 2200 });
  await mouseTo(geom.tx, geom.ty);
  await sleep(250);
  check("hovering the trigger opens the menu", (await isOpen()) === true, "");

  for (let i = 1; i <= steps; i++) {
    await mouseTo(
      Math.round(geom.tx + ((geom.mx - geom.tx) * i) / steps),
      Math.round(geom.ty + ((geom.my - geom.ty) * i) / steps),
    );
  }
  check("hover-opened menu survives the pointer crossing the gap",
    (await isOpen()) === true, `gap ${geom.gap}px, no click used`);

  // ---- dismissal --------------------------------------------------------
  // Park the virtual pointer well away from the nav first: CSS hover alone
  // can hold the menu open, which would make these look like failures of the
  // click/Escape handling rather than of the test setup.
  const park = async () => mouseTo(20, 700);

  await openIt();
  await park();
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 20, y: 700, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 20, y: 700, button: "left", clickCount: 1 });
  await sleep(300);
  check("clicking outside closes the menu", (await isOpen()) === false, "");

  await openIt();
  await park();
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  check("Escape closes the menu", (await isOpen()) === false, "");
  check("Escape returns focus to the trigger",
    (await ev(`document.activeElement === document.querySelector('.nav-dropdown-trigger')`)) === true, "");

  // ---- aria -------------------------------------------------------------
  await openIt();
  await park();
  check("aria-expanded reflects the open state",
    (await ev(`document.querySelector('.nav-dropdown-trigger').getAttribute('aria-expanded')`)) === "true", "");

  // ---- the menu must stay on screen -------------------------------------
  for (const w of [1024, 1219, 1220, 1280, 1440, 1920]) {
    await setViewport(cdp, undefined, w, 900, false);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 2200 });
    // The desktop nav is hidden below 1220px, where the mobile drawer takes
    // over. Asserting against a 0x0 box there passes trivially and proves
    // nothing, so measure the trigger and report the skip honestly.
    const shown = await ev(`(() => { const t = document.querySelector('.nav-dropdown-trigger');
      return t ? Math.round(t.getBoundingClientRect().width) : 0; })()`);
    if (!shown) { console.log(`      @${w} desktop nav hidden (mobile drawer is used), skipped`); continue; }
    await openIt();
    const box = await ev(`(() => { const m = document.querySelector('.nav-dropdown-menu').getBoundingClientRect();
      return { left: Math.round(m.left), right: Math.round(m.right), vw: innerWidth,
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) }; })()`);
    check(`@${w} menu stays within the viewport`,
      box.left >= 0 && box.right <= box.vw && box.overflow === 0,
      `left ${box.left}, right ${box.right}/${box.vw}, page overflow ${box.overflow}px`);
  }

  // ---- every link redirects and filters ---------------------------------
  await setViewport(cdp, undefined, 1440, 900, false);
  for (const [label, slug] of LINKS) {
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 2200 });
    await openIt();
    const clicked = await ev(`(() => {
      const link = [...document.querySelectorAll('.nav-dropdown-menu a')]
        .find((a) => a.textContent.trim().startsWith(${JSON.stringify(label)}));
      if (!link) return null;
      const href = link.getAttribute('href');
      link.click();
      return href;
    })()`);
    await sleep(2200);
    const landed = await ev(`(() => {
      const checked = document.querySelector('input[name=category]:checked');
      return { url: location.pathname + location.search, slug: checked ? checked.value : null,
        shown: document.querySelectorAll('.commerce-product-card').length,
        menuOpen: !!document.querySelector('.nav-dropdown.open') };
    })()`);
    check(`"${label}" navigates to the shop filtered by ${slug}`,
      landed.url.startsWith("/shop") && landed.slug === slug && landed.shown > 0,
      `href ${clicked} -> ${landed.url}, selected ${landed.slug}, ${landed.shown} product(s)`);
    check(`"${label}" leaves the menu closed after navigating`, landed.menuOpen === false, "");
  }

  // ---- mobile accordion -------------------------------------------------
  await setViewport(cdp, undefined, 390, 844, true);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 2400 });
  const mobile = await ev(`(() => {
    const burger = document.querySelector('.hamburger, .menu-toggle, [aria-label*="enu" i]');
    if (burger) burger.click();
    return new Promise((r) => setTimeout(() => {
      const group = document.querySelector('.mobile-category-group');
      if (!group) return r({ found: false });
      const summary = group.querySelector('summary');
      summary.click();
      setTimeout(() => {
        const links = [...group.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') }));
        const s = summary.getBoundingClientRect();
        r({ found: true, open: group.hasAttribute('open'), links, tap: Math.round(s.height) });
      }, 250);
    }, 450));
  })()`);
  if (!mobile.found) {
    check("mobile categories accordion exists", false, "no .mobile-category-group in the drawer");
  } else {
    check("mobile categories accordion opens", mobile.open === true, "");
    check("mobile accordion lists the same categories",
      mobile.links.length >= LINKS.length, `${mobile.links.length} link(s)`);
    check("mobile category rows meet the 44px touch target",
      mobile.tap >= 44, `summary ${mobile.tap}px tall`);
  }
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  cdp.close();
  child.kill();
  await sleep(300);
  process.exit(fail ? 1 : 0);
}
