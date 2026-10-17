/**
 * Reports the colour of the longest horizontal colour-run in the lower band of
 * a banner, so the SHOP NOW matcher in probe-cta-position.mjs can be tuned to
 * the artwork actually shipped instead of a remembered threshold.
 *
 *   node scripts/probe-cta-color.mjs http://127.0.0.1:3381 "<file name>"
 */
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3381";
const FILE = process.argv[3];
const { child, port } = await launch();
const cdp = await pageConnection(port);

const URL = `${BASE}/assets/images/hero/${encodeURIComponent(FILE)}`;

try {
  await setViewport(cdp, undefined, 1280, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1200 });
  const out = await evaluate(cdp, undefined, `(async () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = ${JSON.stringify(URL)};
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const at = (x, y) => { const i = (y * c.width + x) * 4; return [data[i], data[i+1], data[i+2]]; };

    // Quantise to a 16-level cube and find long runs of each bucket in the
    // lower 30% of the image, left half (where banner 1's CTA sits).
    const runs = new Map();
    for (let y = Math.floor(c.height * 0.70); y < c.height; y++) {
      let run = 0, key = null;
      for (let x = 0; x <= c.width; x++) {
        const k = x < c.width ? at(x, y).map(v => v >> 4).join(',') : null;
        if (k !== null && k === key) { run++; continue; }
        if (run >= 100 && key !== null) {
          const e = runs.get(key) || { px: 0, rows: new Set(), minX: 1e9, maxX: -1, minY: 1e9, maxY: -1 };
          e.px += run; e.rows.add(y);
          e.minX = Math.min(e.minX, x - run); e.maxX = Math.max(e.maxX, x - 1);
          e.minY = Math.min(e.minY, y); e.maxY = Math.max(e.maxY, y);
          runs.set(key, e);
        }
        key = k; run = 1;
      }
    }
    const top = [...runs.entries()]
      .map(([k, e]) => ({ bucket: k, px: e.px, rows: e.rows.size,
        box: [e.minX, e.minY, e.maxX - e.minX + 1, e.maxY - e.minY + 1],
        sample: at(Math.round((e.minX + e.maxX) / 2), Math.round((e.minY + e.maxY) / 2)) }))
      .sort((a, b) => b.px - a.px).slice(0, 8);
    return { w: c.width, h: c.height, top };
  })()`);
  console.log(`${FILE}  ${out.w}x${out.h}`);
  for (const t of out.top) {
    const [x, y, w, h] = t.box;
    console.log(`  rgb(${t.sample.join(',')})  px=${t.px} rows=${t.rows}  box=${x},${y} ${w}x${h}`);
  }
} finally { cdp.close(); child.kill(); await sleep(300); process.exit(0); }
