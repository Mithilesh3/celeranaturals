/**
 * Measures the hero on production (the stated visual reference) and on the
 * local build at the same viewport, so the target dimensions are read from
 * the real page instead of guessed.
 *
 *   node scripts/compare-hero-prod.mjs https://celeranaturals.com http://127.0.0.1:3321
 */
import { evaluate, goto, launch, pageConnection, screenshot, setViewport, sleep } from "./cdp.mjs";

const PROD = process.argv[2] ?? "https://celeranaturals.com";
const LOCAL = process.argv[3] ?? "http://127.0.0.1:3321";

const MEASURE = `(() => {
  const hero = document.querySelector('.home-hero');
  const slider = document.querySelector('.home-hero-slider');
  const imgs = [...document.querySelectorAll('.home-hero-slide img, .home-hero img')];
  const visible = imgs
    .map(i => ({ i, r: i.getBoundingClientRect() }))
    .filter(o => o.r.width > 0 && o.r.left > -2 && o.r.right < innerWidth + 2)[0]
    || (imgs[1] ? { i: imgs[1], r: imgs[1].getBoundingClientRect() } : null);
  const out = {
    vw: innerWidth, vh: innerHeight,
    heroH: hero ? Math.round(hero.getBoundingClientRect().height) : null,
    sliderH: slider ? Math.round(slider.getBoundingClientRect().height) : null,
    sliderW: slider ? Math.round(slider.getBoundingClientRect().width) : null,
    sliderMaxW: slider ? getComputedStyle(slider).maxWidth : null,
  };
  if (visible) {
    const b = visible.r, n = visible.i;
    const s = Math.min(b.width / n.naturalWidth, b.height / n.naturalHeight);
    out.natural = n.naturalWidth + 'x' + n.naturalHeight;
    out.naturalRatio = +(n.naturalWidth / n.naturalHeight).toFixed(4);
    out.boxW = Math.round(b.width); out.boxH = Math.round(b.height);
    out.paintedW = Math.round(n.naturalWidth * s); out.paintedH = Math.round(n.naturalHeight * s);
    out.src = decodeURIComponent((n.getAttribute('src') || '').split('/').pop() || '');
    out.objectFit = getComputedStyle(n).objectFit;
  }
  return out;
})()`;

const { child, port } = await launch();
const cdp = await pageConnection(port);

try {
  for (const [w, h] of [[1920, 900], [1280, 900], [390, 844]]) {
    await setViewport(cdp, undefined, w, h, w < 900);

    let prod = null;
    try {
      await goto(cdp, undefined, PROD, { waitMs: 4000 });
      prod = await evaluate(cdp, undefined, MEASURE);
    } catch (error) {
      prod = { error: error.message.slice(0, 80) };
    }
    if (w === 1920 && !prod.error) await screenshot(cdp, undefined, ".audit/prod-hero-1920.png");

    await goto(cdp, undefined, LOCAL, { waitMs: 2600 });
    const local = await evaluate(cdp, undefined, MEASURE);

    console.log(`\n=== ${w}x${h}`);
    if (prod.error) console.log(`  PROD  unreachable: ${prod.error}`);
    else console.log(`  PROD   hero=${prod.heroH}px  painted=${prod.paintedW}x${prod.paintedH}  natural=${prod.natural} (${prod.naturalRatio})  file=${prod.src}`);
    console.log(`  LOCAL  hero=${local.heroH}px  painted=${local.paintedW}x${local.paintedH}  natural=${local.natural} (${local.naturalRatio})  file=${local.src}`);
    if (!prod.error && prod.heroH && local.heroH) {
      console.log(`  -> local is ${(local.heroH / prod.heroH).toFixed(2)}x the production hero height`);
    }
  }
} finally {
  cdp.close(); child.kill(); await sleep(300); process.exit(0);
}
