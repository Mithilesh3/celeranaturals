/**
 * Reports whether a logo PNG has usable transparency around its circular mark,
 * and what colour the corners actually are.
 *
 * The navbar sits on white. A logo whose corners are opaque black renders as a
 * black square there, so this has to be checked before a file is swapped in
 * rather than discovered in the browser afterwards.
 *
 *   node scripts/probe-logo-alpha.mjs http://127.0.0.1:3411 /assets/images/brand/logo.png
 */
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3411";
const PATH = process.argv[3] ?? "/assets/images/brand/logo.png";

const { child, port } = await launch();
const cdp = await pageConnection(port);

const PROBE = `(async () => {
  const img = new Image();
  img.src = ${JSON.stringify(BASE + PATH)};
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const W = c.width, H = c.height;
  const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i+1], data[i+2], data[i+3]]; };

  let opaque = 0, transparent = 0, partial = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 255) opaque++;
    else if (data[i] === 0) transparent++;
    else partial++;
  }

  const inset = Math.round(W * 0.01);
  return {
    w: W, h: H,
    corners: {
      tl: at(inset, inset), tr: at(W - 1 - inset, inset),
      bl: at(inset, H - 1 - inset), br: at(W - 1 - inset, H - 1 - inset),
    },
    centre: at(W >> 1, H >> 1),
    pct: {
      opaque: +(opaque / (W * H) * 100).toFixed(1),
      transparent: +(transparent / (W * H) * 100).toFixed(1),
      partial: +(partial / (W * H) * 100).toFixed(1),
    },
  };
})()`;

try {
  await setViewport(cdp, undefined, 1280, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1200 });
  const r = await evaluate(cdp, undefined, PROBE);
  console.log(`${PATH}  ${r.w}x${r.h}`);
  for (const [k, v] of Object.entries(r.corners)) {
    console.log(`  corner ${k}: rgba(${v.join(",")})${v[3] === 0 ? "  transparent" : "  OPAQUE"}`);
  }
  console.log(`  centre   : rgba(${r.centre.join(",")})`);
  console.log(`  alpha: ${r.pct.opaque}% opaque, ${r.pct.transparent}% transparent, ${r.pct.partial}% partial`);
} catch (error) {
  // Without this the process.exit below swallows the failure and the script
  // looks like it simply printed nothing.
  console.error("probe failed:", error && error.message ? error.message : error);
} finally {
  cdp.close();
  child.kill();
  await sleep(300);
  process.exit(0);
}
