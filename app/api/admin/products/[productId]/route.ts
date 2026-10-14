import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../../lib/admin";
import { isAdminConfigured } from "../../../../../lib/firebase-admin";
import {
  getProductForAdmin, listCategoriesForAdmin, setProductFlags, slugTaken, updateProduct,
} from "../../../../../lib/catalog-server";
import { normalizeProductInput, validateProductInput } from "../../../../../lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { productId } = await params;
  try {
    const product = await getProductForAdmin(productId);
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ error: "Could not load the product." }, { status: 500 });
  }
}

/** Full edit of the product fields. */
export async function PUT(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { productId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const input = normalizeProductInput((body as { product?: unknown })?.product ?? body);

  try {
    const categories = await listCategoriesForAdmin();
    // The product's own category stays valid even if it was since deactivated,
    // so editing an older product does not force a category change.
    const existing = await getProductForAdmin(productId);
    if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const allowed = categories.filter((c) => c.active || c.slug === existing.category).map((c) => c.slug);

    const problems = validateProductInput(input, allowed);
    if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 400 });

    if (await slugTaken(input.slug, productId)) {
      return NextResponse.json({ error: `The slug "${input.slug}" is already used by another product.` }, { status: 409 });
    }

    const ok = await updateProduct(productId, input);
    if (!ok) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not update the product." }, { status: 500 });
  }
}

/**
 * Publish / unpublish / archive / restore only. Deliberately narrow: nothing
 * here can touch prices, and nothing anywhere in product management can touch
 * an order's payment status.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { productId } = await params;
  let body: { published?: unknown; archived?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const flags: { published?: boolean; archived?: boolean } = {};
  if (typeof body.published === "boolean") flags.published = body.published;
  if (typeof body.archived === "boolean") flags.archived = body.archived;
  if (!Object.keys(flags).length) {
    return NextResponse.json({ error: "Nothing to change. Send published or archived." }, { status: 400 });
  }

  try {
    const ok = await setProductFlags(productId, flags);
    if (!ok) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...flags });
  } catch {
    return NextResponse.json({ error: "Could not update the product." }, { status: 500 });
  }
}

/**
 * Archive, not delete.
 *
 * Products are referenced by historical orders, so the document is kept and
 * flagged instead of removed; the storefront stops showing it immediately
 * while past orders still resolve its name and image.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { productId } = await params;
  try {
    const ok = await setProductFlags(productId, { archived: true });
    if (!ok) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ ok: true, archived: true });
  } catch {
    return NextResponse.json({ error: "Could not archive the product." }, { status: 500 });
  }
}
