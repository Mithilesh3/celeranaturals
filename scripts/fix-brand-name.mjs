/**
 * Corrects the brand name in user-facing copy: "Celeranaturals" is one word,
 * but the brand is "Celera Naturals" (as on the logo and the product
 * packaging).
 *
 * Deliberately left alone:
 *   - celeranaturals.com and any other URL or domain
 *   - the internal Firebase app id "celeranaturals-admin"
 *   - anything inside scripts/ (the migration seed mirrors stored data)
 *
 * Run with --apply to write; otherwise it only reports.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOTS = ["app", "lib", "styles"];
const EXT = new Set([".tsx", ".ts", ".css"]);

/** Skip URLs/domains and the admin app identifier. */
const PROTECTED = [/celeranaturals\.com/gi, /celeranaturals-admin/g, /celeranaturals-\d/gi];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(full))) out.push(full);
  }
  return out;
}

let changedFiles = 0, totalEdits = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const original = readFileSync(file, "utf8");

    // Mask protected spans so replacements cannot touch them.
    const masks = [];
    let masked = original;
    for (const pattern of PROTECTED) {
      masked = masked.replace(pattern, (match) => {
        masks.push(match);
        return `\u0000MASK${masks.length - 1}\u0000`;
      });
    }

    let updated = masked
      .replace(/CELERANATURALS/g, "CELERA NATURALS")
      .replace(/Celeranaturals/g, "Celera Naturals");

    // Restore the protected spans untouched.
    updated = updated.replace(/\u0000MASK(\d+)\u0000/g, (_m, i) => masks[Number(i)]);

    if (updated === original) continue;
    const edits = (original.match(/Celeranaturals|CELERANATURALS/g) ?? []).length
      - (updated.match(/Celeranaturals|CELERANATURALS/g) ?? []).length;
    changedFiles += 1;
    totalEdits += edits;
    console.log(`${APPLY ? "fixed " : "would fix"}  ${file}  (${edits})`);
    if (APPLY) writeFileSync(file, updated);
  }
}

console.log(`\n${APPLY ? "applied" : "DRY RUN"} — ${totalEdits} replacements across ${changedFiles} files`);
if (!APPLY) console.log("Re-run with --apply to write.");
