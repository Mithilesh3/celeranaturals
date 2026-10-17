/**
 * Checks the full-width hero brief at the widths that were asked for.
 *
 * Replaces the earlier probe-hero-fits.mjs, which asserted the opposite
 * requirement (whole banner above the fold). That was superseded: the banner
 * is now full-bleed and is allowed to extend past the fold.
 *
 * Per width:
 *   - the slider spans the viewport, with no inset and no horizontal scroll
 *   - the artwork fills the slider and is neither cropped nor letterboxed
 *   - the announcement bar and navbar are fully visible ABOVE the hero,
 *     with no overlap
 *   - the hero is not a card: no rounded corners, no drop shadow
 *   - the height does not change as the slides advance
 *
 *   node scripts/test-hero-fullwidth.mjs http://127.0.0.1:3401
 */
import { evaluate, goto, launch, pageConnection, screenshot, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3401";
const WIDTHS = [
  [1920, 1080],
  [1440, 900],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [320, 568],
];

const PROBE = `(() => {
  const hero = document.querySelector('.home-hero');
  const slider = document.querySelector('.home-hero-slider');
  const header = document.querySelector('.site-header');
  const strip = document.querySelector('.top-strip');

  // The image covering the most of the viewport, so a mid-transition sample
  // still measures a real slide instead of matching nothing.
  const img = [...document.querySelectorAll('.home-hero-slide img')]
    .map((i) => {
      const r = i.getBoundingClientRect();
      return { i, r, seen: Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) };
    })
    .filter((o) => o.r.width > 0)
    .sort((a, b) => b.seen - a.seen)[0];

  const sr = slider.getBoundingClientRect();
  const hr = hero.getBoundingClientRect();
  const headerR = header.getBoundingClientRect();
  const sc = getComputedStyle(slider);

  const out = {
    vw: innerWidth,
    vh: innerHeight,
    sliderW: Math.round(sr.width),
    sliderH: Math.round(sr.height),
    sliderLeft: Math.round(sr.left),
    heroW: Math.round(hr.width),
    heroTop: Math.round(hr.top),
    headerBottom: Math.round(headerR.bottom),
    stripTop: Math.round(strip ? strip.getBoundingClientRect().top : 0),
    radius: sc.borderTopLeftRadius,
    shadow: sc.boxShadow,
    maxW: sc.maxWidth,
    docOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
  };
  if (img) {
    const b = img.r, n = img.i;
    const scale = Math.min(b.width / n.naturalWidth, b.height / n.naturalHeight);
    out.paintedW = Math.round(n.naturalWidth * scale);
    out.paintedH = Math.round(n.naturalHeight * scale);
    out.boxW = Math.round(b.width);
    out.boxH = Math.round(b.height);
    // Non-zero means object-fit is letterboxing inside a differently shaped box.
    out.letterbox = (out.boxH - out.paintedH) + (out.boxW - out.paintedW);
    out.ratio = +(n.naturalWidth / n.naturalHeight).toFixed(4);
    // Pixels of artwork falling outside the slider's clipping box.
    out.clipped = Math.max(0, Math.round(sr.top - b.top)) + Math.max(0, Math.round(b.bottom - sr.bottom));
  }
  return out;
})()`;

/* Sampled from Node in a loop: the CDP helper does not await promises, so an
   in-page setInterval would resolve to an unusable object. */
const HEIGHT_NOW = `Math.round(document.querySelector('.home-hero-slider').getBoundingClientRect().height)`;

const { child, port } = await launch();
const cdp = await pageConnection(port);

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

try {
  for (const [w, h] of WIDTHS) {
    await setViewport(cdp, undefined, w, h, w < 900);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 2400 });
    const r = await evaluate(cdp, undefined, PROBE);

    console.log(`\n@${w}x${h}  slider=${r.sliderW}x${r.sliderH} left=${r.sliderLeft}  maxW=${r.maxW}`);

    check(`@${w} slider spans the full viewport width`,
      r.sliderW >= r.vw - 1 && r.sliderLeft === 0, `${r.sliderW}/${r.vw} at left=${r.sliderLeft}`);
    check(`@${w} hero section has no side margins`,
      r.heroW >= r.vw - 1, `${r.heroW}/${r.vw}`);
    check(`@${w} artwork fills the slider`,
      r.paintedW >= r.sliderW - 1, `painted ${r.paintedW} vs slider ${r.sliderW}`);
    check(`@${w} artwork is neither cropped nor letterboxed`,
      r.clipped === 0 && r.letterbox === 0 && r.ratio === 1.7768,
      `clipped ${r.clipped}px, letterbox ${r.letterbox}px, ratio ${r.ratio}`);
    check(`@${w} navbar sits fully above the hero with no overlap`,
      r.stripTop >= 0 && r.headerBottom <= r.heroTop,
      `strip top ${r.stripTop}, header bottom ${r.headerBottom}, hero top ${r.heroTop}`);
    check(`@${w} hero is not styled as a card`,
      r.radius === "0px" && r.shadow === "none", `radius ${r.radius}, shadow ${r.shadow.slice(0, 28)}`);
    check(`@${w} no horizontal page overflow`, r.docOverflow === 0, `${r.docOverflow}px`);

    if (w === 1920 || w === 390) {
      await screenshot(cdp, undefined, `.audit/fullwidth-${w}.png`);
    }
  }

  // ---- height stability across slide changes ------------------------------
  await setViewport(cdp, undefined, 1440, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 2400 });
  // Sample across more than two full 2s autoplay cycles of three slides.
  const heights = [];
  for (let i = 0; i < 32; i++) {
    heights.push(await evaluate(cdp, undefined, HEIGHT_NOW));
    await sleep(250);
  }
  const unique = [...new Set(heights)];
  check("slider height never changes as the slides advance",
    unique.length === 1, `${unique.length} distinct height(s): ${unique.join(", ")}`);
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  cdp.close();
  child.kill();
  await sleep(300);
  process.exit(fail ? 1 : 0);
}
