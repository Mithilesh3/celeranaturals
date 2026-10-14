import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../lib/admin";
import { getStorageStatus } from "../../../../lib/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_DIRS = ["assets/images/products", "assets/images/category-cutouts"];
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

/**
 * Lists product images that genuinely exist in the repository, so the admin
 * picker can only offer real files. Nothing is invented: the list is a
 * directory read, and a missing directory contributes nothing.
 *
 * Also reports whether an upload target is configured, so the UI can tell the
 * truth about uploads instead of offering a control that cannot work.
 */
export async function GET(request: Request) {
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });

  const images: string[] = [];
  for (const dir of MEDIA_DIRS) {
    try {
      const entries = await readdir(path.join(process.cwd(), "public", dir), { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
          images.push(`${dir}/${entry.name}`);
        }
      }
    } catch {
      // Directory absent in this deployment; simply contributes no images.
    }
  }

  return NextResponse.json({ images: images.sort(), storage: await getStorageStatus() });
}
