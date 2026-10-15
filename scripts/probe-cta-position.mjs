/**
 * Finds the SHOP NOW artwork inside each banner by scanning the decoded image
 * in a real browser canvas, so the invisible hotspot link can be placed on the
 * button rather than guessed from eyeballing the picture.
 *
 *   node scripts/probe-cta-position.mjs http://127.0.0.1:3291
 */
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3291";
const { child, port } = await launch();
const cdp = await pageConnection(port);

/**
 * Scans the lower half of the banner for a run of saturated button colour.
 * `match` is evaluated per pixel in the page.
 */
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
  const match = (r, g, b) => { ${matchBody} };
  // A filled pill produces long unbroken horizontal runs of its colour;
  // scattered foliage of a similar hue does not. Only long runs count.
  const MIN_RUN = Math.max(100, Math.floor(c.width * 0.07));
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, hits = 0;
  const startY = Math.floor(c.height * ${fromY});
  for (let y = startY; y < c.height; y++) {
    let run = 0;
    for (let x = 0; x <= c.width; x++) {
      const i = (y * c.width + x) * 4;
      const on = x < c.width && match(data[i], data[i + 1], data[i + 2]);
      if (on) { run++; continue; }
      if (run >= MIN_RUN) {
        hits += run;
        const s0 = x - run, e0 = x - 1;
        if (s0 < minX) minX = s0;
        if (e0 > maxX) maxX = e0;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      run = 0;
    }
  }
  if (hits < 500) return { found: false, hits, w: c.width, h: c.height };
  return {
    found: true, hits, w: c.width, h: c.height,
    box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    pct: {
      left: +(minX / c.width * 100).toFixed(2),
      top: +(minY / c.height * 100).toFixed(2),
      width: +((maxX - minX + 1) / c.width * 100).toFixed(2),
      height: +((maxY - minY + 1) / c.height * 100).toFixed(2),
    },
  };
})()`);

try {
  await setViewport(cdp, undefined, 1280, 900, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1200 });

  // Banner 1: dark green pill. Deep green, low blue, green clearly above red.
  const isabgol = await scan(
    `${BASE}/assets/images/hero/${encodeURIComponent("Celera Isabgol Natural Health Banner(1).png")}`,
    "return g > 70 && g < 150 && r < 70 && b < 80 && g - r > 35 && g - b > 25;",
    0.70,
  );
  console.log("isabgol SHOP NOW:", JSON.stringify(isabgol));

  // Banner 2: amber/yellow pill. High red and green, low blue.
  const fiber = await scan(
    `${BASE}/assets/images/hero/${encodeURIComponent("Natural Fiber Wellness Banner(1).png")}`,
    "return r > 200 && g > 150 && g < 215 && b < 90 && r - b > 120;",
    0.70,
  );
  console.log("fiber   SHOP NOW:", JSON.stringify(fiber));

  // Banner 3 should have no CTA artwork; same amber probe for confirmation.
  const nutrition = await scan(
    `${BASE}/assets/images/hero/${encodeURIComponent("Celera Healthcare Complete Nutrition Banner(1).png")}`,
    "return r > 200 && g > 150 && g < 215 && b < 90 && r - b > 120;",
    0.70,
  );
  console.log("nutrition amber:", JSON.stringify(nutrition));
} finally {
  cdp.close(); child.kill(); await sleep(300); process.exit(0);
}
