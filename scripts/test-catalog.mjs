/**
 * End-to-end checks for admin product management and the public catalogue.
 *
 * The decisive test is that a product published through the admin API becomes
 * visible on the real /shop and /product/[slug] HTML, and that a draft never
 * is. Everything it creates is removed at the end.
 *
 *   node scripts/test-catalog.mjs http://localhost:3131
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] ??= v;
}

const BASE = process.argv[2] ?? "http://localhost:3131";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });
}
const auth = getAuth();
const db = getFirestore();

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

async function idTokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(data.error?.message ?? "token mint failed");
  return data.idToken;
}

const req = (path, token, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

const html = async (path) => {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  return { status: res.status, body: await res.text() };
};

const stamp = Date.now();
const SLUG = `qa-test-widget-${stamp}`;
const NAME = `QA Test Widget ${stamp}`;
const created = { products: [], users: [], orders: [] };

async function main() {
  const adminEmail = (process.env.ADMIN_EMAILS ?? "").split(",")[0].trim();
  const adminUser = await auth.getUserByEmail(adminEmail);
  const adminToken = await idTokenFor(adminUser.uid);

  const customer = await auth.createUser({ email: `qa-cat-${stamp}@example.invalid`, password: `Pw!${stamp}` });
  created.users.push(customer.uid);
  const customerToken = await idTokenFor(customer.uid);

  // ---- 1. authorization -------------------------------------------------
  for (const [label, token, expected] of [
    ["anonymous", null, 403],
    ["signed-in customer", customerToken, 403],
  ]) {
    const list = await req("/api/admin/products", token);
    check(`${label} cannot list products`, list.status === expected, String(list.status));
    const post = await req("/api/admin/products", token, { method: "POST", body: JSON.stringify({ product: { name: "x" } }) });
    check(`${label} cannot create a product`, post.status === expected, String(post.status));
    const patch = await req("/api/admin/products/p1", token, { method: "PATCH", body: JSON.stringify({ published: false }) });
    check(`${label} cannot publish/unpublish`, patch.status === expected, String(patch.status));
    const del = await req("/api/admin/products/p1", token, { method: "DELETE" });
    check(`${label} cannot archive a product`, del.status === expected, String(del.status));
    const media = await req("/api/admin/media", token);
    check(`${label} cannot list media`, media.status === expected, String(media.status));
  }

  // ---- 2. migrated catalogue --------------------------------------------
  const listed = await (await req("/api/admin/products", adminToken)).json();
  check("the six migrated products are present", listed.products.length >= 6, `${listed.products.length} products`);
  check("the four categories are present", listed.categories.length >= 4, `${listed.categories.length} categories`);
  const p1 = listed.products.find((p) => p.id === "p1");
  check("migrated pricing is preserved (p1 mrp 398 / sale 375)", p1?.mrp === 398 && p1?.salePrice === 375, `mrp=${p1?.mrp} sale=${p1?.salePrice}`);
  check("migrated product keeps its slug", p1?.slug === "celera-naturals-isabgol-psyllium-husk-2x100g", p1?.slug);

  // ---- 3. validation ----------------------------------------------------
  const base = {
    name: NAME, slug: SLUG, category: "probiotics", mrp: 500, salePrice: 400,
    sku: "QA-1", stockQty: 7, image: "assets/images/products/sporcel.png",
    shortDescription: "QA fixture product.", description: "Created by the automated catalogue test.",
    published: false,
  };
  const create = (product, token = adminToken) =>
    req("/api/admin/products", token, { method: "POST", body: JSON.stringify({ product }) });

  for (const [label, product] of [
    ["missing name", { ...base, name: "" }],
    ["sale price above regular price", { ...base, salePrice: 900 }],
    ["negative regular price", { ...base, mrp: -5 }],
    ["negative stock", { ...base, stockQty: -2 }],
    ["unknown category", { ...base, category: "not-a-category" }],
    ["no image", { ...base, image: "", images: [] }],
    ["publishing with no short description", { ...base, published: true, shortDescription: "" }],
  ]) {
    const res = await create(product);
    const body = await res.json().catch(() => ({}));
    check(`create rejects ${label}`, res.status === 400, `${res.status} ${(body.error ?? "").slice(0, 70)}`);
  }

  const badImage = await create({ ...base, image: "https://evil.example/x.png", images: [] });
  check("create rejects an image on an untrusted host", badImage.status === 400, String(badImage.status));

  // ---- 4. create as draft -----------------------------------------------
  const made = await create(base);
  const madeBody = await made.json();
  check("admin can create a draft product", made.ok, made.ok ? madeBody.id : JSON.stringify(madeBody).slice(0, 120));
  if (!made.ok) throw new Error("cannot continue without a product");
  const id = madeBody.id;
  created.products.push(id);

  const dup = await create({ ...base, name: "Another", slug: SLUG });
  check("duplicate slug is refused", dup.status === 409, String(dup.status));

  // ---- 5. drafts are invisible to the public ----------------------------
  const draftShop = await html("/shop");
  check("draft is absent from /shop", !draftShop.body.includes(NAME), `/shop ${draftShop.status}`);
  const draftDetail = await html(`/product/${SLUG}`);
  check("draft product page 404s", draftDetail.status === 404, String(draftDetail.status));
  const draftLegacy = await html(`/product.html?slug=${SLUG}`);
  check("draft legacy URL 404s", draftLegacy.status === 404, String(draftLegacy.status));

  // ---- 6. publishing makes it public ------------------------------------
  const publish = await req(`/api/admin/products/${id}`, adminToken, { method: "PATCH", body: JSON.stringify({ published: true }) });
  check("admin can publish", publish.ok, String(publish.status));

  const liveShop = await html("/shop");
  check("published product appears on /shop", liveShop.body.includes(NAME), `/shop ${liveShop.status}`);
  const liveDetail = await html(`/product/${SLUG}`);
  check("published product page loads", liveDetail.status === 200 && liveDetail.body.includes(NAME), String(liveDetail.status));
  check("product detail shows the sale price", liveDetail.body.includes("400"), "looking for 400");
  check("published product is in its category filter",
    liveShop.body.includes("probiotics") && liveShop.body.includes(NAME));

  // ---- 7. editing flows through to the storefront -----------------------
  const edited = { ...base, published: true, mrp: 600, salePrice: 450, stockQty: 3, name: `${NAME} v2` };
  const update = await req(`/api/admin/products/${id}`, adminToken, { method: "PUT", body: JSON.stringify({ product: edited }) });
  check("admin can edit a product", update.ok, String(update.status));
  const editedShop = await html("/shop");
  check("edited name is live on /shop", editedShop.body.includes(`${NAME} v2`));
  check("edited price is live on /shop", editedShop.body.includes("450"));

  // ---- 8. checkout uses trusted catalogue prices -------------------------
  const ADDRESS = {
    fullName: "QA Buyer", phone: "9811111111", line1: "1 QA Street", locality: "QA Area",
    city: "Lucknow", state: "Uttar Pradesh", pincode: "226010",
  };
  const order = (body) => req("/api/orders/create", customerToken, { method: "POST", body: JSON.stringify(body) });

  // 450 rupees = 45000 paise for one unit; claiming anything else must fail.
  const wrongTotal = await order({ items: [{ id, qty: 1 }], address: ADDRESS, expectedTotal: 1 });
  check("checkout rejects a client-claimed total that disagrees", wrongTotal.status === 409, String(wrongTotal.status));

  const overStock = await order({ items: [{ id, qty: 10 }], address: ADDRESS });
  const overBody = await overStock.json().catch(() => ({}));
  check("checkout rejects more than available stock", overStock.status === 400, `${overStock.status} ${(overBody.error ?? "").slice(0, 60)}`);

  const placed = await order({ items: [{ id, qty: 1 }], address: ADDRESS });
  const placedBody = await placed.json().catch(() => ({}));
  check("checkout succeeds at the catalogue price", placed.ok, placed.ok ? `total ${placedBody.amount}` : JSON.stringify(placedBody).slice(0, 140));

  if (placed.ok) {
    created.orders.push(placedBody.orderId);
    const stored = (await db.collection("orders").doc(placedBody.orderId).get()).data();
    const line = stored.items[0];
    check("order snapshots the catalogue unit price", line.unitPrice === 45000, `unitPrice ${line.unitPrice}`);
    check("order snapshots the product name", line.name === `${NAME} v2`, line.name);
    check("order snapshots the SKU", line.sku === "QA-1", String(line.sku));

    // Change the product afterwards; the order must not move.
    await req(`/api/admin/products/${id}`, adminToken, {
      method: "PUT",
      body: JSON.stringify({ product: { ...edited, name: `${NAME} RENAMED`, mrp: 999, salePrice: 999 } }),
    });
    const after = (await db.collection("orders").doc(placedBody.orderId).get()).data();
    check("editing a product does not change a historical order",
      after.items[0].unitPrice === 45000 && after.items[0].name === `${NAME} v2` && after.amounts.total === stored.amounts.total,
      `unitPrice ${after.items[0].unitPrice}, total ${after.amounts.total}`);
  }

  // ---- 9. out of stock ---------------------------------------------------
  await req(`/api/admin/products/${id}`, adminToken, {
    method: "PUT", body: JSON.stringify({ product: { ...edited, name: `${NAME} RENAMED`, stockQty: 0 } }),
  });
  const oos = await order({ items: [{ id, qty: 1 }], address: ADDRESS });
  const oosBody = await oos.json().catch(() => ({}));
  check("checkout rejects an out-of-stock product", oos.status === 400, `${oos.status} ${(oosBody.error ?? "").slice(0, 60)}`);
  const oosShop = await html("/shop");
  check("out-of-stock product still lists, marked unavailable", oosShop.body.includes(`${NAME} RENAMED`));

  // ---- 10. unpublish and archive ----------------------------------------
  const unpublish = await req(`/api/admin/products/${id}`, adminToken, { method: "PATCH", body: JSON.stringify({ published: false }) });
  check("admin can unpublish", unpublish.ok, String(unpublish.status));
  const goneShop = await html("/shop");
  check("unpublished product disappears from /shop", !goneShop.body.includes(`${NAME} RENAMED`));
  const goneDetail = await html(`/product/${SLUG}`);
  check("unpublished product page 404s", goneDetail.status === 404, String(goneDetail.status));

  await req(`/api/admin/products/${id}`, adminToken, { method: "PATCH", body: JSON.stringify({ published: true }) });
  const archived = await req(`/api/admin/products/${id}`, adminToken, { method: "DELETE" });
  check("admin can archive a product", archived.ok, String(archived.status));
  const archivedDoc = (await db.collection("catalogProducts").doc(id).get()).data();
  check("archive is soft: the document still exists", Boolean(archivedDoc), "document present");
  check("archiving also unpublishes", archivedDoc.archived === true && archivedDoc.published === false,
    `archived=${archivedDoc.archived} published=${archivedDoc.published}`);
  const archivedShop = await html("/shop");
  check("archived product is off the storefront", !archivedShop.body.includes(`${NAME} RENAMED`));

  const restore = await req(`/api/admin/products/${id}`, adminToken, { method: "PATCH", body: JSON.stringify({ archived: false }) });
  const restored = (await db.collection("catalogProducts").doc(id).get()).data();
  check("restoring brings it back as a draft, not live",
    restore.ok && restored.archived === false && restored.published === false,
    `published=${restored.published}`);

  // ---- 11. existing storefront still works ------------------------------
  const home = await html("/");
  check("homepage renders with catalogue products", home.status === 200 && home.body.includes("Featured Products"));
  const existing = await html("/product/celera-naturals-isabgol-psyllium-husk-2x100g");
  check("a migrated product page still loads", existing.status === 200 && existing.body.includes("Isabgol"), String(existing.status));
  const shopCount = await html("/shop");
  check("migrated products are on the shop page", shopCount.body.includes("SporCel") && shopCount.body.includes("CELEPRO"));

  // ---- 12. storage status is reported honestly --------------------------
  const media = await (await req("/api/admin/media", adminToken)).json();
  check("media library lists real repository images", media.images.length >= 7, `${media.images.length} images`);
  check("media images are genuine repo paths", media.images.every((i) => i.startsWith("assets/images/")));
  check("storage status is reported", typeof media.storage?.available === "boolean", `available=${media.storage?.available}`);
  if (!media.storage.available) {
    const upload = await req("/api/admin/media/upload", adminToken, { method: "POST", body: new FormData() });
    check("upload refuses honestly when storage is absent", upload.status === 503, String(upload.status));
  }
}

try {
  await main();
} catch (error) {
  check("harness completed", false, error.message);
} finally {
  for (const id of created.products) await db.collection("catalogProducts").doc(id).delete().catch(() => {});
  for (const id of created.orders) await db.collection("orders").doc(id).delete().catch(() => {});
  for (const uid of created.users) {
    await db.recursiveDelete(db.collection("users").doc(uid)).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  console.log(`\ncleanup: removed ${created.products.length} products, ${created.orders.length} orders, ${created.users.length} users`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
