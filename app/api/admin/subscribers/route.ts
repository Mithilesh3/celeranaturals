import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../lib/admin";
import { adminDb, isAdminConfigured } from "../../../../lib/firebase-admin";
import { NEWSLETTER_COLLECTION } from "../../../../lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const EXPORT_CAP = 5_000;

type SubscriberRow = { email: string; status: string; source: string; createdAt: string | null };

function toRow(data: FirebaseFirestore.DocumentData): SubscriberRow {
  const created = data.createdAt;
  return {
    email: String(data.email ?? ""),
    status: String(data.status ?? "subscribed"),
    source: String(data.source ?? ""),
    // Firestore Timestamp -> ISO, tolerating docs written before the field existed.
    createdAt: created && typeof created.toDate === "function" ? created.toDate().toISOString() : null,
  };
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });
  const admin = access.user;

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const cursor = url.searchParams.get("cursor");

  const collection = adminDb().collection(NEWSLETTER_COLLECTION);
  let query: FirebaseFirestore.Query = collection.orderBy("createdAt", "desc");
  if (status && status !== "all") query = query.where("status", "==", status);

  if (format === "csv") {
    const snapshot = await query.limit(EXPORT_CAP).get();
    const rows = snapshot.docs.map((doc) => toRow(doc.data()));
    const csv = [
      "email,status,source,subscribed_at",
      ...rows.map((r) => [r.email, r.status, r.source, r.createdAt ?? ""].map(csvCell).join(",")),
    ].join("\r\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="newsletter-subscribers.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (cursor) query = query.startAfter(new Date(cursor));
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const docs = snapshot.docs.slice(0, PAGE_SIZE);
  const hasMore = snapshot.size > PAGE_SIZE;

  let rows = docs.map((doc) => toRow(doc.data()));
  if (search) rows = rows.filter((row) => row.email.toLowerCase().includes(search));

  return NextResponse.json({
    subscribers: rows,
    nextCursor: hasMore ? rows[rows.length - 1]?.createdAt ?? null : null,
    searchScopedToPage: Boolean(search),
  });
}
