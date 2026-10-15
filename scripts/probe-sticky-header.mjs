/**
 * Does the header actually stay put when the page scrolls?
 *
 * `position: sticky` silently stops working if ANY ancestor is a scroll
 * container — overflow-x: hidden on html/body is the classic cause. This walks
 * the ancestor chain and then scrolls for real to see what happens.
 *
 *   node scripts/probe-sticky-header.mjs http://127.0.0.1:3351
 */
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3351";
const { child, port } = await launch();
const cdp = await pageConnection(port);

const ANCESTORS = `(() => {
  const header = document.querySelector('.site-header');
  const chain = [];
  for (let el = header.parentElement; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    const clips = /hidden|auto|scroll|clip/.test(cs.overflow) || /hidden|auto|scroll|clip/.test(cs.overflowX) || /hidden|auto|scroll|clip/.test(cs.overflowY);
    chain.push({
      tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
      overflow: cs.overflow, overflowX: cs.overflowX, overflowY: cs.overflowY,
      transform: cs.transform === 'none' ? 'none' : 'set',
      filter: cs.filter === 'none' ? 'none' : 'set',
      breaksSticky: clips || cs.transform !== 'none' || cs.filter !== 'none',
    });
  }
  const hcs = getComputedStyle(header);
  return { headerPosition: hcs.position, headerTop: hcs.top, headerZ: hcs.zIndex, chain };
})()`;

const AFTER_SCROLL = `(() => {
  const h = document.querySelector('.site-header').getBoundingClientRect();
  const strip = document.querySelector('.top-strip').getBoundingClientRect();
  return { scrollY: Math.round(scrollY), headerTop: Math.round(h.top), headerBottom: Math.round(h.bottom),
    stripTop: Math.round(strip.top),
    headerOnScreen: h.bottom > 0 && h.top < innerHeight };
})()`;

try {
  for (const [w, h] of [[1920, 900], [390, 844]]) {
    await setViewport(cdp, undefined, w, h, w < 900);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 2400 });

    const a = await evaluate(cdp, undefined, ANCESTORS);
    console.log(`\n@${w}  header position=${a.headerPosition} top=${a.headerTop} z=${a.headerZ}`);
    const blockers = a.chain.filter((c) => c.breaksSticky);
    if (blockers.length) {
      console.log("  ANCESTORS THAT BREAK position:sticky:");
      for (const c of blockers) console.log(`    ${c.tag}  overflow=${c.overflow} overflowX=${c.overflowX} overflowY=${c.overflowY} transform=${c.transform}`);
    } else {
      console.log("  no sticky-breaking ancestor found");
    }

    for (const y of [0, 300, 900]) {
      await evaluate(cdp, undefined, `window.scrollTo(0, ${y}), 1`);
      await sleep(500);
      const s = await evaluate(cdp, undefined, AFTER_SCROLL);
      console.log(`  scrollY=${String(s.scrollY).padStart(4)}  header top=${String(s.headerTop).padStart(5)}  onScreen=${s.headerOnScreen}`);
    }
  }
} finally { cdp.close(); child.kill(); await sleep(300); process.exit(0); }
