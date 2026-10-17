/**
 * Generates the browser-tab icon set from the existing brand logo.
 *
 * Source is public/assets/images/brand/logo.png — the real Celera Naturals
 * mark the navbar uses, not a redrawn or substitute icon. It is already a
 * square 512x512 RGBA with the circular badge inscribed and transparent
 * corners, so no padding or re-centring is needed; anything non-square would
 * have had to be centred on a square canvas instead of stretched.
 *
 * Writes the Next.js App Router file conventions, which is what makes every
 * route pick the icon up without per-page metadata:
 *   app/favicon.ico      16 + 32 + 48, served at /favicon.ico
 *   app/icon.png         512, emitted as <link rel="icon">
 *   app/apple-icon.png   180, emitted as <link rel="apple-touch-icon">
 *
 * apple-icon is flattened onto white on purpose: iOS composites a transparent
 * home-screen icon onto black, which would turn the badge's clear corners into
 * black ones. The badge's own interior is white, so a white square is the
 * visually consistent choice. The other two keep their transparency.
 *
 * Resizing happens in Chrome via the CDP driver, so there is no image
 * dependency to install.
 *
 *   node scripts/build-favicons.mjs http://127.0.0.1:3451
 */
import { writeFileSync } from "node:fs";
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3451";
const SOURCE = "/assets/images/brand/logo.png";

/** ICO entries. 48 is used by Windows taskbar/shortcuts, 16 and 32 by tabs. */
const ICO_SIZES = [16, 32, 48];

const { child, port } = await launch();
const cdp = await pageConnection(port);

/**
 * @param {number} size
 * @param {boolean} flatten paint onto white instead of keeping transparency
 */
const renderAt = (size, flatten) => `(async () => {
  const img = new Image();
  img.src = ${JSON.stringify(BASE + SOURCE)};
  await img.decode();
  const c = document.createElement('canvas');
  c.width = ${size}; c.height = ${size};
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (${flatten}) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ${size}, ${size}); }
  ctx.drawImage(img, 0, 0, ${size}, ${size});
  return { src: img.naturalWidth + 'x' + img.naturalHeight, dataUrl: c.toDataURL('image/png') };
})()`;

const pngAt = async (size, flatten = false) => {
  const r = await evaluate(cdp, undefined, renderAt(size, flatten));
  return { src: r.src, bytes: Buffer.from(r.dataUrl.replace(/^data:image\/png;base64,/, ""), "base64") };
};

/**
 * Assembles a PNG-in-ICO. Every browser in use supports PNG-compressed ICO
 * entries, and it avoids hand-rolling a BMP encoder with its bottom-up rows
 * and AND-mask padding.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach((image, index) => {
    const at = index * 16;
    // 0 means 256 in the ICO directory; none of our sizes hit that, but the
    // modulo keeps it correct if a 256 entry is ever added.
    directory.writeUInt8(image.size % 256, at);
    directory.writeUInt8(image.size % 256, at + 1);
    directory.writeUInt8(0, at + 2); // palette size
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(image.bytes.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.bytes.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.bytes)]);
}

try {
  await setViewport(cdp, undefined, 800, 600, false);
  await goto(cdp, undefined, `${BASE}/`, { waitMs: 1500 });

  const icoParts = [];
  for (const size of ICO_SIZES) {
    const { src, bytes } = await pngAt(size);
    icoParts.push({ size, bytes });
    if (size === ICO_SIZES[0]) console.log(`source      ${src}  ${SOURCE}`);
  }
  const ico = buildIco(icoParts);
  writeFileSync("app/favicon.ico", ico);
  console.log(`favicon.ico  ${ICO_SIZES.join(" + ")}  ${(ico.length / 1024).toFixed(1)}KB`);

  // 192, not the source's 512: browsers fetch this for the tab, and the full
  // 512 weighed 245KB for something drawn at 16-32px. 192 still covers
  // high-DPI tabs and Android home screens at a fifth of the bytes.
  const icon = await pngAt(192);
  writeFileSync("app/icon.png", icon.bytes);
  console.log(`icon.png     192x192  ${(icon.bytes.length / 1024).toFixed(1)}KB`);

  const apple = await pngAt(180, true);
  writeFileSync("app/apple-icon.png", apple.bytes);
  console.log(`apple-icon   180x180 on white  ${(apple.bytes.length / 1024).toFixed(1)}KB`);
} catch (error) {
  console.error("build failed:", error && error.message ? error.message : error);
  process.exitCode = 1;
} finally {
  cdp.close();
  child.kill();
  await sleep(300);
  process.exit(process.exitCode ?? 0);
}
