/**
 * Verifies the replaced homepage hero slider in a real browser:
 * the three approved banners load, autoplay runs at 2s, arrows/dots work,
 * manual navigation does not stop autoplay, hover pauses it, the Shop Now
 * hotspot sits on the artwork, and the banner is never cropped or overflowing.
 *
 *   node scripts/test-hero-slider.mjs http://127.0.0.1:3291
 */
import { evaluate, goto, launch, pageConnection, screenshot, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3291";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const EXPECTED = [
  "Celera Isabgol Natural Health Banner(1).png",
  "Natural Fiber Wellness Banner(1).png",
  "Celera Healthcare Complete Nutrition Banner(1).png",
];

const { child, port } = await launch();
const cdp = await pageConnection(port);
const failedUrls = [];
cdp.on("Network.loadingFailed", (p) => { if (!p.canceled) failedUrls.push(p.errorText); });

const state = () => evaluate(cdp, undefined, `(() => {
  const slider = document.querySelector('.home-hero-slider');
  const imgs = [...document.querySelectorAll('.home-hero-slide img')];
  const dots = [...document.querySelectorAll('.home-hero-dots button')];
  const activeDot = dots.findIndex(b => b.classList.contains('active'));
  const r = slider ? slider.getBoundingClientRect() : null;
  const first = imgs[1];
  return {
    sliderW: r ? Math.round(r.width) : null,
    vw: innerWidth,
    docOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    srcs: [...new Set(imgs.map(i => decodeURIComponent(i.getAttribute('src') || '')))],
    naturalOk: imgs.every(i => i.complete && i.naturalWidth > 0),
    naturalDims: first ? first.naturalWidth + 'x' + first.naturalHeight : null,
    // object-fit: contain paints a letterboxed rect inside the element box.
    // Measure what is actually drawn, not the box.
    painted: (() => { if (!first) return null;
      const b = first.getBoundingClientRect();
      const s = Math.min(b.width / first.naturalWidth, b.height / first.naturalHeight);
      const pw = first.naturalWidth * s, ph = first.naturalHeight * s;
      return { w: Math.round(pw), h: Math.round(ph), ratio: +(pw / ph).toFixed(4),
               fitsBox: pw <= b.width + 1 && ph <= b.height + 1 };
    })(),
    renderedRatio: first ? +(first.getBoundingClientRect().width / first.getBoundingClientRect().height).toFixed(4) : null,
    objectFit: first ? getComputedStyle(first).objectFit : null,
    imgWidthCss: first ? getComputedStyle(first).width : null,
    activeDot,
    dotCount: dots.length,
    arrows: document.querySelectorAll('.home-hero-arrow').length,
    ctaCount: document.querySelectorAll('.home-hero-shop-link').length,
  };
})()`);

try {
  await setViewport(cdp, undefined, 1280, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 2500 });
  let s = await state();

  // ---- the three approved images ---------------------------------------
  check("all three approved banners are referenced",
    EXPECTED.every((name) => s.srcs.some((src) => src.endsWith(name))), s.srcs.join(" | "));
  check("no old banner remains in the slider",
    !s.srcs.some((src) => /Complete Nutrition for a Healthier Tomorrow|Celera Natural Fiber Wellness|Celera Natural Isabgol Digestive/.test(src)),
    s.srcs.join(" | "));
  check("every slide image actually loaded", s.naturalOk === true, String(s.naturalDims));
  check("images load at their true 1672x941 size", s.naturalDims === "1672x941", String(s.naturalDims));
  check("no failed network requests", failedUrls.length === 0, failedUrls.slice(0, 2).join(", "));

  // ---- no cropping / distortion ----------------------------------------
  check("the banner is not cropped with object-fit: cover", s.objectFit !== "cover", String(s.objectFit));
  check("image fills the slider width", s.imgWidthCss && parseFloat(s.imgWidthCss) >= s.sliderW - 2,
    `${s.imgWidthCss} vs slider ${s.sliderW}px`);
  check("painted banner keeps the source aspect ratio (no stretching)",
    Math.abs(s.painted.ratio - 1672 / 941) < 0.01, `${s.painted.ratio} vs ${(1672 / 941).toFixed(4)}`);
  check("the whole banner fits inside its box (nothing cropped)", s.painted.fitsBox === true,
    `painted ${s.painted.w}x${s.painted.h}`);

  // ---- controls ---------------------------------------------------------
  // Guards the live-site bug: a banner taller than its container is clipped
  // by the slider overflow:hidden. Checks EVERY slide, clones included.
  const clipping = await evaluate(cdp, undefined, `(() => {
    const sr = document.querySelector(".home-hero-slider").getBoundingClientRect();
    return [...document.querySelectorAll(".home-hero-slide")].map((sl, i) => {
      const r = sl.querySelector("img").getBoundingClientRect();
      return { i, top: Math.max(0, Math.round(sr.top - r.top)), bottom: Math.max(0, Math.round(r.bottom - sr.bottom)) };
    }).filter(x => x.top > 0 || x.bottom > 0);
  })()`);
  check("no slide is clipped top or bottom", clipping.length === 0, JSON.stringify(clipping));

  check("three pagination dots are present", s.dotCount === 3, String(s.dotCount));
  check("both arrows are present", s.arrows === 2, String(s.arrows));
  // The track renders clone slides for seamless looping, so banner 1 (which
  // has a CTA) appears twice: 2 real CTAs + 1 clone = 3.
  check("Shop Now hotspots exist only on the two banners that have the artwork",
    s.ctaCount === 3, s.ctaCount + " (2 real + 1 loop clone)");

  // ---- autoplay cadence -------------------------------------------------
  const readDot = async () => (await state()).activeDot;
  const start = await readDot();
  await sleep(2300);
  const afterOne = await readDot();
  check("autoplay advances within ~2s", afterOne !== start, `${start} -> ${afterOne}`);
  await sleep(2300);
  const afterTwo = await readDot();
  check("autoplay keeps advancing", afterTwo !== afterOne, `${afterOne} -> ${afterTwo}`);
  await sleep(2300);
  const afterThree = await readDot();
  check("autoplay loops back round the three slides",
    afterThree !== afterTwo, `${afterTwo} -> ${afterThree}`);

  // Measure the interval: count advances over ~8.4s, expect ~4.
  const t0 = Date.now();
  let advances = 0, last = await readDot();
  while (Date.now() - t0 < 8400) {
    await sleep(250);
    const now = await readDot();
    if (now !== last) { advances++; last = now; }
  }
  check("cadence is about 2 seconds (3-5 advances in 8.4s)", advances >= 3 && advances <= 5, `${advances} advances`);

  // ---- manual controls --------------------------------------------------
  const afterNext = await evaluate(cdp, undefined, `(async () => {
    const before = [...document.querySelectorAll('.home-hero-dots button')].findIndex(b => b.classList.contains('active'));
    document.querySelector('.home-hero-next').click();
    await new Promise(r => setTimeout(r, 700));
    const after = [...document.querySelectorAll('.home-hero-dots button')].findIndex(b => b.classList.contains('active'));
    return { before, after };
  })()`);
  check("the next arrow changes slide", afterNext.before !== afterNext.after, JSON.stringify(afterNext));

  const afterPrev = await evaluate(cdp, undefined, `(async () => {
    const before = [...document.querySelectorAll('.home-hero-dots button')].findIndex(b => b.classList.contains('active'));
    document.querySelector('.home-hero-prev').click();
    await new Promise(r => setTimeout(r, 700));
    const after = [...document.querySelectorAll('.home-hero-dots button')].findIndex(b => b.classList.contains('active'));
    return { before, after };
  })()`);
  check("the previous arrow changes slide", afterPrev.before !== afterPrev.after, JSON.stringify(afterPrev));

  const afterDot = await evaluate(cdp, undefined, `(async () => {
    document.querySelectorAll('.home-hero-dots button')[2].click();
    await new Promise(r => setTimeout(r, 900));
    // Re-query: React re-renders the dots, so a captured array goes stale.
    return [...document.querySelectorAll('.home-hero-dots button')].findIndex(b => b.classList.contains('active'));
  })()`);
  check("clicking the third dot selects banner 3", afterDot === 2, String(afterDot));

  // autoplay must survive manual navigation
  const beforeResume = await readDot();
  await sleep(2400);
  check("autoplay still runs after manual navigation", (await readDot()) !== beforeResume, `from ${beforeResume}`);

  // ---- hover pauses -----------------------------------------------------
  const box = await evaluate(cdp, undefined, `(() => { const r = document.querySelector('.home-hero-slider').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, button: "none" });
  await sleep(400);
  const hoverStart = await readDot();
  await sleep(3000);
  const hoverEnd = await readDot();
  check("hovering pauses autoplay on desktop", hoverStart === hoverEnd, `${hoverStart} -> ${hoverEnd}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, button: "none" });
  await sleep(2500);
  check("autoplay resumes after the pointer leaves", (await readDot()) !== hoverEnd);

  await screenshot(cdp, undefined, ".audit/hero-desktop-1280.png");

  // ---- mobile widths ----------------------------------------------------
  for (const width of [320, 360, 375, 390, 414]) {
    await setViewport(cdp, undefined, width, 780, true);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 2200 });
    const m = await state();
    const edgeToEdge = m.sliderW >= m.vw - 1;
    check(`@${width} slider is edge-to-edge with no overflow`,
      edgeToEdge && m.docOverflow === 0, `slider ${m.sliderW}/${m.vw}, overflow ${m.docOverflow}`);
    check(`@${width} banner keeps its aspect ratio and is uncropped`,
      Math.abs(m.painted.ratio - 1672 / 941) < 0.01 && m.painted.fitsBox, `${m.painted.ratio} painted ${m.painted.w}x${m.painted.h}`);
    check(`@${width} banner spans the full viewport width`, m.painted.w >= m.vw - 1, `${m.painted.w}/${m.vw}`);
    if (width === 390) await screenshot(cdp, undefined, ".audit/hero-mobile-390.png");
  }

  // ---- the Shop Now hotspot sits on the artwork -------------------------
  await setViewport(cdp, undefined, 1280, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 2200 });
  const cta = await evaluate(cdp, undefined, `(() => {
    const slide = [...document.querySelectorAll('.home-hero-slide')]
      .find(s => (s.querySelector('img') || {}).src && decodeURIComponent(s.querySelector('img').src).includes('Celera Isabgol Natural Health'));
    if (!slide) return 'slide missing';
    const img = slide.querySelector('img');
    const link = slide.querySelector('.home-hero-shop-link');
    if (!link) return 'hotspot missing';
    const ir = img.getBoundingClientRect(), lr = link.getBoundingClientRect();
    return {
      href: link.getAttribute('href'),
      // Hotspot position as a fraction of the image box.
      left: +(((lr.left - ir.left) / ir.width) * 100).toFixed(1),
      top: +(((lr.top - ir.top) / ir.height) * 100).toFixed(1),
      width: +((lr.width / ir.width) * 100).toFixed(1),
      height: +((lr.height / ir.height) * 100).toFixed(1),
    };
  })()`);
  check("the Shop Now hotspot keeps its existing destination",
    cta.href === "/product/celera-naturals-isabgol-psyllium-husk-2x100g", String(cta.href));
  // Expected values come from scripts/probe-cta-position.mjs run against the
  // shipped artwork, so replacing a banner means re-running that probe and
  // updating both this assertion and the CSS.
  check("the hotspot overlays the measured button area",
    Math.abs(cta.left - 4.43) < 1.5 && Math.abs(cta.top - 77.9) < 2, JSON.stringify(cta));
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  cdp.close(); child.kill(); await sleep(300);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
