import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../lib/admin";
import { isAdminConfigured } from "../../../../lib/firebase-admin";
import {
  createProduct, listCategoriesForAdmin, listProductsForAdmin, slugTaken,
} from "../../../../lib/catalog-server";
import { normalizeProductInput, validateProductInput } from "../../../../lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Product management. Every method is gated by checkAdmin, which verifies a
 * Firebase ID token server-side and checks the email against the ADMIN_EMAILS
 * allowlist. No client flag has any bearing on authorization.
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });

  try {
    const [products, categories] = await Promise.all([listProductsForAdmin(), listCategoriesForAdmin()]);
    return NextResponse.json({ products, categories });
  } catch {
    return NextResponse.json({ error: "Could not load the catalogue." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  // Coerced to exactly the known fields before validation, so no extra key
  // from the request body can reach the stored document.
  const input = normalizeProductInput((body as { product?: unknown })?.product ?? body);

  try {
    const categories = await listCategoriesForAdmin();
    const problems = validateProductInput(input, categories.filter((c) => c.active).map((c) => c.slug));
    if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 400 });

    if (await slugTaken(input.slug)) {
      return NextResponse.json({ error: `The slug "${input.slug}" is already used by another product.` }, { status: 409 });
    }

    const id = await createProduct(input);
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "Could not save the product." }, { status: 500 });
  }
}
