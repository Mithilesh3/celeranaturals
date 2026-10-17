/**
 * Walks the ancestor chain above the hero slider reporting each box's width
 * and its padding/margin/max-width, so a width inset can be traced to the
 * element that actually causes it instead of patched at the slider.
 *
 *   node scripts/probe-hero-width.mjs http://127.0.0.1:3382
 */
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3382";
const { child, port } = await launch();
const cdp = await pageConnection(port);

const CHAIN = `(() => {
  const out = [];
  for (let el = document.querySelector('.home-hero-slider'); el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    out.push({
      tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).slice(0, 2).join('.') : ''),
      w: Math.round(el.getBoundingClientRect().width),
      left: Math.round(el.getBoundingClientRect().left),
      pad: cs.paddingLeft + '/' + cs.paddingRight,
      mar: cs.marginLeft + '/' + cs.marginRight,
      maxW: cs.maxWidth,
      width: cs.width,
    });
  }
  return { vw: innerWidth, chain: out };
})()`;

try {
  for (const w of [390, 768, 1280]) {
    await setViewport(cdp, undefined, w, 844, w < 900);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 2600 });
    const r = await evaluate(cdp, undefined, CHAIN);
    console.log(`\n@${r.vw}`);
    for (const c of r.chain) {
      const inset = r.vw - c.w;
      console.log(
        `  w=${String(c.w).padStart(5)} (inset ${String(inset).padStart(3)})  left=${String(c.left).padStart(4)}  ${c.tag}` +
        `  pad=${c.pad} mar=${c.mar} maxW=${c.maxW} width=${c.width}`,
      );
    }
  }
} finally {
  cdp.close();
  child.kill();
  await sleep(300);
  process.exit(0);
}
