/**
 * Looks for actual clipping: compares each slide image's rendered box against
 * its container, and reports how many pixels fall outside the slider's
 * overflow:hidden box at top and bottom.
 *
 *   node scripts/probe-hero-crop.mjs http://127.0.0.1:3331
 */
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3331";
const { child, port } = await launch();
const cdp = await pageConnection(port);

const PROBE = `(() => {
  const slider = document.querySelector('.home-hero-slider');
  const track = document.querySelector('.home-hero-track');
  const sr = slider.getBoundingClientRect();
  const tr = track.getBoundingClientRect();
  const sc = getComputedStyle(slider);

  const slides = [...document.querySelectorAll('.home-hero-slide')].map((sl, i) => {
    const img = sl.querySelector('img');
    const ir = img.getBoundingClientRect();
    const slr = sl.getBoundingClientRect();
    // How much of the image falls outside the slider's clipping box.
    const clipTop = Math.max(0, Math.round(sr.top - ir.top));
    const clipBottom = Math.max(0, Math.round(ir.bottom - (sr.bottom)));
    return {
      i,
      file: decodeURIComponent((img.getAttribute('src') || '').split('/').pop() || '').slice(0, 34),
      natural: img.naturalWidth + 'x' + img.naturalHeight,
      imgBox: Math.round(ir.width) + 'x' + Math.round(ir.height),
      slideH: Math.round(slr.height),
      objectFit: getComputedStyle(img).objectFit,
      cssH: getComputedStyle(img).height,
      clipTop, clipBottom,
      // Image taller than the box it sits in = guaranteed clipping.
      overflowsSlide: Math.round(ir.height) - Math.round(slr.height),
    };
  });

  return {
    vw: innerWidth,
    sliderBox: Math.round(sr.width) + 'x' + Math.round(sr.height),
    sliderMaxW: sc.maxWidth, sliderOverflow: sc.overflow,
    sliderInlineH: slider.style.height || slider.style.aspectRatio,
    trackBox: Math.round(tr.width) + 'x' + Math.round(tr.height),
    expectedImgH: Math.round(sr.width / (1672 / 941)),
    slides,
  };
})()`;

try {
  for (const w of [2560, 1920, 1700, 1440, 1280, 1024, 768, 390, 320]) {
    await setViewport(cdp, undefined, w, 900, w < 900);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 2400 });
    const r = await evaluate(cdp, undefined, PROBE);
    const worst = Math.max(...r.slides.map((s) => s.clipTop + s.clipBottom));
    const over = Math.max(...r.slides.map((s) => s.overflowsSlide));
    console.log(`\n@${w}  slider=${r.sliderBox} maxW=${r.sliderMaxW} overflow=${r.sliderOverflow}`);
    console.log(`   inline height="${r.sliderInlineH}"  track=${r.trackBox}  expected img h=${r.expectedImgH}`);
    console.log(`   img box=${r.slides[1].imgBox} cssHeight=${r.slides[1].cssH} fit=${r.slides[1].objectFit}`);
    console.log(`   image taller than slide by ${over}px   worst clip (top+bottom) = ${worst}px`);
    if (worst > 0) {
      for (const s of r.slides.filter((x) => x.clipTop + x.clipBottom > 0)) {
        console.log(`     CLIPPED slide ${s.i} "${s.file}" top=${s.clipTop} bottom=${s.clipBottom}`);
      }
    }
  }
} finally { cdp.close(); child.kill(); await sleep(300); process.exit(0); }
