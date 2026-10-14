// Finds the narrowest viewport at which the desktop header still fits, so the
// collapse breakpoint is measured rather than guessed.
import { evaluate, goto, launch, pageConnection, setViewport, sleep } from "./cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3171";
const { child, port } = await launch();
const cdp = await pageConnection(port);

const EXPR = `(() => {
  const prevB = document.body.style.overflowX, prevH = document.documentElement.style.overflowX;
  document.body.style.overflowX = 'visible'; document.documentElement.style.overflowX = 'visible';
  const doc = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  document.body.style.overflowX = prevB; document.documentElement.style.overflowX = prevH;
  const nav = document.querySelector('.icon-nav');
  const wrap = document.querySelector('.nav-wrap');
  const toggle = document.querySelector('.mobile-toggle');
  const r = nav && nav.getBoundingClientRect();
  return {
    vw: innerWidth, doc, over: Math.max(0, doc - innerWidth),
    navRight: r ? Math.round(r.right) : null,
    wrapW: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
    toggleShown: toggle ? getComputedStyle(toggle).display !== 'none' : false,
  };
})()`;

try {
  for (const width of [768, 800, 860, 900, 960, 1024, 1080, 1100, 1140, 1180, 1220, 1280]) {
    await setViewport(cdp, undefined, width, 800, width < 1024);
    await goto(cdp, undefined, `${BASE}/`, { waitMs: 500 });
    const r = await evaluate(cdp, undefined, EXPR);
    console.log(
      `vw=${String(r.vw).padStart(4)}  doc=${String(r.doc).padStart(4)}  overflow=${String(r.over).padStart(3)}` +
      `  iconNavRight=${String(r.navRight).padStart(4)}  hamburger=${r.toggleShown ? "yes" : "no "}`,
    );
  }
} finally {
  cdp.close(); child.kill(); await sleep(200); process.exit(0);
}
