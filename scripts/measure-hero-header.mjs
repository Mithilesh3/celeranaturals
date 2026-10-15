/**
 * Measures the homepage header and hero at the listed widths: is the header
 * visible and on top, how much vertical space does the hero take, is there a
 * gap between sections, and does anything overflow?
 *
 *   node scripts/measure-hero-header.mjs http://127.0.0.1:3311
 */
import { evaluate, goto, launch, pageConnection, screenshot, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3311";
const { child, port } = await launch();
const cdp = await pageConnection(port);

const MEASURE = `(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
      w: Math.round(r.width), left: Math.round(r.left),
      position: cs.position, zIndex: cs.zIndex, display: cs.display }; };

  const strip = box('.top-strip');
  const header = box('.site-header');
  const slider = box('.home-hero-slider');
  const hero = box('.home-hero');
  const img = (() => { const el = [...document.querySelectorAll('.home-hero-slide')]
      .find(s => s.getBoundingClientRect().left >= -2 && s.getBoundingClientRect().right <= innerWidth + 2);
    const i = el && el.querySelector('img'); if (!i) return null;
    const r = i.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top),
      ratio: +(r.width / r.height).toFixed(4), natural: i.naturalWidth + 'x' + i.naturalHeight }; })();

  // What actually sits at the very top-left and top-centre of the page?
  const atTop = (x, y) => { const e = document.elementFromPoint(x, y);
    return e ? e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ').filter(Boolean).slice(0,2).join('.') : null; };

  // First section after the hero, and the gap between them.
  const afterHero = (() => {
    const h = document.querySelector('.home-hero');
    if (!h) return null;
    let n = h.nextElementSibling;
    while (n && n.getBoundingClientRect().height === 0) n = n.nextElementSibling;
    if (!n) return null;
    const r = n.getBoundingClientRect(), hr = h.getBoundingClientRect();
    return { tag: n.tagName.toLowerCase() + '.' + String(n.className||'').split(' ').slice(0,2).join('.'),
      gap: Math.round(r.top - hr.bottom), h: Math.round(r.height) };
  })();

  return {
    vw: innerWidth, vh: innerHeight,
    docOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    strip, header, hero, slider, img,
    headerVisible: header ? header.bottom > 0 && header.h > 0 : false,
    topLeftEl: atTop(5, 5), topMidEl: atTop(Math.round(innerWidth / 2), 5),
    headerMidEl: header ? atTop(Math.round(innerWidth / 2), Math.round(header.top + header.h / 2)) : null,
    heroShareOfViewport: hero ? +((hero.h / innerHeight) * 100).toFixed(1) : null,
    afterHero,
    pageH: Math.round(document.documentElement.scrollHeight),
  };
})()`;

try {
  for (const [w, h] of [[320, 640], [360, 740], [375, 812], [390, 844], [414, 896], [768, 1024], [1280, 900]]) {
    await setViewport(cdp, undefined, w, h, w < 900);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 2400 });
    const r = await evaluate(cdp, undefined, MEASURE);
    console.log(`\n@${w}x${h}  page=${r.pageH}  overflowX=${r.docOverflow}`);
    console.log(`  strip  h=${r.strip?.h}  header h=${r.header?.h} pos=${r.header?.position} z=${r.header?.zIndex} top=${r.header?.top}`);
    console.log(`  hero   h=${r.hero?.h} (${r.heroShareOfViewport}% of viewport)  slider h=${r.slider?.h}`);
    console.log(`  image  ${r.img?.w}x${r.img?.h} ratio=${r.img?.ratio} natural=${r.img?.natural} top=${r.img?.top}`);
    console.log(`  topmost at (5,5)=${r.topLeftEl}  at header centre=${r.headerMidEl}`);
    console.log(`  after hero: ${r.afterHero?.tag} gap=${r.afterHero?.gap}px`);
    if (w === 390 || w === 1280) await screenshot(cdp, undefined, `.audit/heroheader-${w}.png`);
  }
} finally { cdp.close(); child.kill(); await sleep(300); process.exit(0); }
