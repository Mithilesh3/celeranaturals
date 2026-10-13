/**
 * Horizontal-overflow finder. Paste into the browser console on any page.
 *
 * Reversible and non-invasive: it temporarily sets `overflow-x: visible` on
 * <html>/<body> so real overflow becomes measurable (the site ships
 * `overflow-x: hidden`, which hides offenders rather than fixing them), takes
 * the measurements, then restores the original values. Nothing is persisted and
 * no production CSS is modified.
 *
 * Usage:  findOverflow()            // current viewport
 *         findOverflow(true)        // also outline offenders in red for 5s
 */
function findOverflow(outline = false) {
  const html = document.documentElement;
  const prevHtml = html.style.overflowX;
  const prevBody = document.body.style.overflowX;
  html.style.overflowX = "visible";
  document.body.style.overflowX = "visible";

  const limit = html.clientWidth;
  const offenders = [];

  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const right = r.right + window.scrollX;
    const left = r.left + window.scrollX;
    if (right <= limit + 1 && left >= -1) continue;

    // An element that scrolls its own content on purpose is not page overflow.
    const style = getComputedStyle(el);
    const selfScrolls = ["auto", "scroll"].includes(style.overflowX);
    offenders.push({
      selector: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
        (el.className && typeof el.className === "string"
          ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
          : ""),
      overflowPx: Math.round(Math.max(right - limit, -left)),
      intentional: selfScrolls,
      element: el,
    });
  }

  html.style.overflowX = prevHtml;
  document.body.style.overflowX = prevBody;

  // Keep only the outermost offender in each branch; children inherit the blame.
  const roots = offenders.filter((o) => !offenders.some((p) => p !== o && p.element.contains(o.element)));
  const accidental = roots.filter((o) => !o.intentional).sort((a, b) => b.overflowPx - a.overflowPx);
  const intentional = roots.filter((o) => o.intentional);

  console.log(`viewport ${limit}px — ${accidental.length} accidental, ${intentional.length} intentionally scrollable`);
  if (accidental.length) console.table(accidental.map(({ selector, overflowPx }) => ({ selector, overflowPx })));
  else console.log("No accidental horizontal overflow at this width.");
  if (intentional.length) {
    console.log("Intentionally scrollable (ignore):", intentional.map((o) => o.selector).join(", "));
  }

  if (outline) {
    accidental.forEach((o) => { o.element.style.outline = "2px solid red"; });
    setTimeout(() => accidental.forEach((o) => { o.element.style.outline = ""; }), 5000);
  }
  return accidental;
}

if (typeof window !== "undefined") window.findOverflow = findOverflow;
