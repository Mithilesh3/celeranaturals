/**
 * Migrates the six hardcoded products and four categories into Firestore.
 *
 * Idempotent: each document uses the product's existing id (p1..p6) and the
 * category slug as its document id, so re-running updates in place and can
 * never create duplicates. Existing admin-edited values are preserved unless
 * --force is passed; by default a document that already exists is left alone.
 *
 *   node scripts/migrate-catalog.mjs            # dry run, shows what it would do
 *   node scripts/migrate-catalog.mjs --apply    # seed missing documents
 *   node scripts/migrate-catalog.mjs --apply --force   # overwrite from source
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { categories, products } from "./catalog-seed.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] ??= v;
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const PRODUCTS = "catalogProducts";
const CATEGORIES = "catalogCategories";

// Default stock for the migrated range. The old model only recorded
// "in-stock"/"out-of-stock" with no quantity, so a quantity has to be chosen;
// this is an operational starting point for the admin to correct, not a claim
// about real warehouse stock.
const SEED_STOCK = 100;

const now = new Date().toISOString();
let created = 0, updated = 0, skipped = 0;

for (const [index, category] of categories.entries()) {
  const ref = db.collection(CATEGORIES).doc(category.slug);
  const exists = (await ref.get()).exists;
  const doc = {
    name: category.name,
    slug: category.slug,
    description: category.description,
    image: category.image,
    active: true,
    sortOrder: index,
  };
  if (exists && !FORCE) { skipped++; console.log(`skip  category ${category.slug} (exists)`); continue; }
  console.log(`${exists ? "update" : "create"} category ${category.slug}`);
  if (APPLY) { await ref.set(doc, { merge: true }); exists ? updated++ : created++; }
}

for (const product of products) {
  const ref = db.collection(PRODUCTS).doc(product.id);
  const exists = (await ref.get()).exists;
  // originalPrice was the regular price and price was the discounted one.
  const mrp = product.originalPrice ?? product.price;
  const salePrice = product.price < mrp ? product.price : null;
  const doc = {
    slug: product.slug,
    name: product.name,
    category: product.category,
    mrp,
    salePrice,
    sku: "",
    stockQty: product.availability === "in-stock" ? SEED_STOCK : 0,
    published: true,
    archived: false,
    image: product.image,
    images: product.images ?? [product.image],
    shortDescription: product.shortDescription ?? "",
    description: product.description ?? "",
    benefits: product.benefits ?? [],
    ingredients: product.ingredients ?? [],
    badge: product.badge ?? "",
    // Existing rating data is carried across as-is; nothing is invented.
    rating: typeof product.rating === "number" ? product.rating : null,
    reviewCount: product.reviewCount ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  if (exists && !FORCE) { skipped++; console.log(`skip  product ${product.id} ${product.slug} (exists)`); continue; }
  console.log(`${exists ? "update" : "create"} product ${product.id}  ${product.slug}  mrp=${mrp} sale=${salePrice ?? "-"}`);
  if (APPLY) {
    // createdAt must survive a --force re-run.
    if (exists) { const { createdAt, ...rest } = doc; await ref.set(rest, { merge: true }); updated++; }
    else { await ref.set(doc); created++; }
  }
}

console.log(`\n${APPLY ? "applied" : "DRY RUN"} — created ${created}, updated ${updated}, skipped ${skipped}`);
if (!APPLY) console.log("Re-run with --apply to write.");
process.exit(0);
