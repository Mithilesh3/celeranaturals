/**
 * Finds the SHOP NOW artwork inside each banner by scanning the decoded image
 * in a real browser canvas, so the invisible hotspot link can be placed on the
 * button rather than guessed from eyeballing the picture.
 *
 *   node scripts/probe-cta-position.mjs http://127.0.0.1:3381
 *
 * Connected components, not per-row colour runs. Two earlier approaches failed
 * on the current artwork and are worth not repeating:
 *
 *  - Longest run per row: the white "SHOP NOW" label punches a hole through
 *    the middle of the pill, so the rows crossing the text have only two short
 *    amber segments and drop out, splitting the pill into two slivers.
 *  - Bounding box of every matching pixel: on banner 1 the pill is the same
 *    dark green as the trust-badge text below it, so the box swallowed both
 *    and came out 282px tall instead of ~60px.
 *
 * A filled pill is one large connected blob (the ring joins around the text).
 * Glyphs and foliage are many small separate blobs. So: build a colour mask,
 * label components with an iterative flood fill, and keep the largest one that
 * is actually pill-shaped (wide, not tall, and reasonably solid).
 */
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3381";
const { child, port } = await launch();
const cdp = await pageConnection(port);

const scan = (url, matchBody, fromY) => evaluate(cdp, undefined, `(async () => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = ${JSON.stringify(url)};
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const W = c.width, H = c.height;
  const match = (r, g, b) => { ${matchBody} };

  const y0 = Math.floor(H * ${fromY});
  const mask = new Uint8Array(W * H);
  for (let y = y0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (match(data[i], data[i + 1], data[i + 2])) mask[y * W + x] = 1;
    }
  }

  // Iterative flood fill (recursion would blow the stack on a 1672px blob).
  const seen = new Uint8Array(W * H);
  const comps = [];
  const stack = new Int32Array(W * H);
  for (let y = y0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const start = y * W + x;
      if (!mask[start] || seen[start]) continue;
      let sp = 0;
      stack[sp++] = start;
      seen[start] = 1;
      let area = 0, minX = W, maxX = -1, minY = H, maxY = -1;
      while (sp > 0) {
        const p = stack[--sp];
        const py = (p / W) | 0, px = p - py * W;
        area++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        // 8-connected: diagonals keep an antialiased pill ring joined up.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || nx >= W || ny < y0 || ny >= H) continue;
            const q = ny * W + nx;
            if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
          }
        }
      }
      comps.push({ area, minX, maxX, minY, maxY });
    }
  }

  const pills = comps
    .map((k) => {
      const w = k.maxX - k.minX + 1, h = k.maxY - k.minY + 1;
      return { ...k, w, h, aspect: w / h, fill: k.area / (w * h) };
    })
    // A CTA pill is wider than tall, at least 10% of the banner wide, and the
    // blob genuinely occupies its box rather than being a sprawling outline.
    .filter((k) => k.w >= W * 0.10 && k.aspect >= 2 && k.aspect <= 12 && k.fill >= 0.35 && k.h >= H * 0.03)
    .sort((a, b) => b.area - a.area);

  if (!pills.length) return { found: false, w: W, h: H, components: comps.length };
  const t = pills[0];
  return {
    found: true, w: W, h: H, components: comps.length, candidates: pills.length,
    box: { x: t.minX, y: t.minY, w: t.w, h: t.h },
    fill: +t.fill.toFixed(2), aspect: +t.aspect.toFixed(2),
    pct: {
      left: +(t.minX / W * 100).toFixed(2),
      top: +(t.minY / H * 100).toFixed(2),
      width: +(t.w / W * 100).toFixed(2),
      height: +(t.h / H * 100).toFixed(2),
    },
  };
})()`);

const asset = (name) => `${BASE}/assets/images/hero/${encodeURIComponent(name)}`;

try {
  await setViewport(cdp, undefined, 1280, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1200 });

  // Banner 1: very dark forest-green pill, measured at rgb(1,52,12).
  const isabgol = await scan(
    asset("Celera Isabgol Natural Health Banner(1).png"),
    "return r < 80 && g > 25 && g < 110 && b < 80 && g - r > 20 && g - b > 15;",
    0.70,
  );
  console.log("isabgol SHOP NOW:", JSON.stringify(isabgol));

  // Banner 2: amber/yellow pill. High red and green, low blue.
  const fiber = await scan(
    asset("Natural Fiber Wellness Banner(1).png"),
    "return r > 200 && g > 150 && g < 215 && b < 90 && r - b > 120;",
    0.70,
  );
  console.log("fiber   SHOP NOW:", JSON.stringify(fiber));

  // Banner 3 should have no CTA artwork; same amber probe for confirmation.
  const nutrition = await scan(
    asset("Celera Healthcare Complete Nutrition Banner(1).png"),
    "return r > 200 && g > 150 && g < 215 && b < 90 && r - b > 120;",
    0.70,
  );
  console.log("nutrition amber:", JSON.stringify(nutrition));
} finally {
  cdp.close(); child.kill(); await sleep(300); process.exit(0);
}
