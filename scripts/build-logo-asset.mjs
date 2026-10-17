/**
 * Turns a supplied logo PNG into the transparent, square asset the navbar
 * needs, and writes it to public/assets/images/brand/.
 *
 * Why this exists: the supplied artwork is colour type 2 (RGB, no alpha
 * channel at all) and its corners are opaque near-black, rgba(1,1,1,255).
 * The header, footer and admin sidebar all render the logo on white, so
 * shipping that file as-is paints a black square behind the circular badge.
 * scripts/probe-logo-alpha.mjs reports exactly that before and after.
 *
 * The badge is a circle, so the mask is a circle: find the bounding box of
 * the non-black artwork, take the inscribed circle, and build an alpha channel
 * from the distance to its centre with a one-pixel feather so the edge is
 * smooth rather than stair-stepped. Everything outside becomes transparent;
 * nothing inside the badge is touched, so the dark green ring survives intact
 * (a plain "make dark pixels transparent" threshold would eat into it).
 *
 * Decoding and re-encoding happen in Chrome via the CDP driver, so there is no
 * hand-rolled PNG codec and no new dependency.
 *
 *   node scripts/build-logo-asset.mjs <base-url> <source-url-path> <out-file> [size]
 */
import { writeFileSync } from "node:fs";
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3411";
const SRC = process.argv[3] ?? "/assets/images/brand/_logo-candidate.png";
const OUT = process.argv[4] ?? "public/assets/images/brand/logo.png";
/** 512 is ample: the navbar paints it at 50px, so this covers 3x displays. */
const SIZE = Number(process.argv[5] ?? 512);

const { child, port } = await launch();
const cdp = await pageConnection(port);

const BUILD = `(async () => {
  const img = new Image();
  img.src = ${JSON.stringify(BASE + SRC)};
  await img.decode();

  const W = img.naturalWidth, H = img.naturalHeight;
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sctx = src.getContext('2d');
  sctx.drawImage(img, 0, 0);
  const sdata = sctx.getImageData(0, 0, W, H).data;

  // Bounding box of everything that is not the near-black backdrop. The ring
  // is dark green (g around 60+), comfortably above this threshold.
  const BLACK = 24;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (sdata[i] > BLACK || sdata[i + 1] > BLACK || sdata[i + 2] > BLACK) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const boxW = maxX - minX + 1, boxH = maxY - minY + 1;
  const side = Math.max(boxW, boxH);
  // Centre the square crop on the artwork's bounding box.
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const sx = Math.round(cx - side / 2), sy = Math.round(cy - side / 2);

  const out = document.createElement('canvas');
  out.width = ${SIZE}; out.height = ${SIZE};
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, sx, sy, side, side, 0, 0, ${SIZE}, ${SIZE});

  const id = octx.getImageData(0, 0, ${SIZE}, ${SIZE});
  const d = id.data;
  const R = ${SIZE} / 2;
  const centre = R - 0.5;
  let cleared = 0, feathered = 0;
  for (let y = 0; y < ${SIZE}; y++) {
    for (let x = 0; x < ${SIZE}; x++) {
      const i = (y * ${SIZE} + x) * 4;
      const dx = x - centre, dy = y - centre;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 1px feather band ending exactly at the inscribed circle.
      const a = Math.max(0, Math.min(1, R - dist));
      if (a === 0) { d[i + 3] = 0; cleared++; }
      else if (a < 1) { d[i + 3] = Math.round(255 * a); feathered++; }
    }
  }
  octx.putImageData(id, 0, 0);

  return {
    src: W + 'x' + H,
    bbox: boxW + 'x' + boxH + ' at ' + minX + ',' + minY,
    crop: side + 'px square at ' + sx + ',' + sy,
    cleared, feathered,
    dataUrl: out.toDataURL('image/png'),
  };
})()`;

try {
  await setViewport(cdp, undefined, 1280, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1500 });
  const r = await evaluate(cdp, undefined, BUILD);

  const b64 = r.dataUrl.replace(/^data:image\/png;base64,/, "");
  const bytes = Buffer.from(b64, "base64");
  writeFileSync(OUT, bytes);

  console.log(`source      ${r.src}`);
  console.log(`artwork box ${r.bbox}`);
  console.log(`square crop ${r.crop}`);
  console.log(`output      ${SIZE}x${SIZE}  ${(bytes.length / 1024) | 0}KB  -> ${OUT}`);
  console.log(`alpha       ${r.cleared} px cleared, ${r.feathered} px feathered`);
} catch (error) {
  console.error("build failed:", error && error.message ? error.message : error);
  process.exitCode = 1;
} finally {
  cdp.close();
  child.kill();
  await sleep(300);
  process.exit(process.exitCode ?? 0);
}
