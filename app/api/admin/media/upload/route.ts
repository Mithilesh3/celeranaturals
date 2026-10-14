import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../../lib/admin";
import { getStorageStatus, uploadProductImage } from "../../../../../lib/media-storage";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "../../../../../lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Uploads a product image to Cloud Storage and returns its public URL.
 *
 * If Storage is not provisioned this returns 503 with the setup steps rather
 * than accepting bytes it cannot persist. Image data is never stored in
 * Firestore — only the returned URL is saved on the product document.
 */
export async function POST(request: Request) {
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });

  const status = await getStorageStatus();
  if (!status.available) {
    return NextResponse.json({
      error: `Image upload is not available: ${status.reason}`,
      setup: status.setup,
    }, { status: 503 });
  }

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Malformed upload." }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Image must be a JPEG, PNG or WebP file." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: `Image must be ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB or smaller.` }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const url = await uploadProductImage(bytes, file.type, file.name || "product.jpg");
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Could not upload the image." }, { status: 500 });
  }
}
