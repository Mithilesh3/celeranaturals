import { NextResponse } from "next/server";
import { checkAdmin, adminDenialMessage } from "../../../../lib/admin";
import { isAdminConfigured } from "../../../../lib/firebase-admin";
import { listCustomers } from "../../../../lib/customers-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * The customer directory, for admins only.
 *
 * Authorization is the same server-side ID-token verification plus
 * ADMIN_EMAILS allowlist used by every other admin endpoint. Nothing about
 * this data is reachable without it, and none of it is cached.
 *
 * Search and pagination run in memory over a bounded account list rather than
 * as Firestore queries, because the records come from Firebase Auth, which has
 * no query API for display name or email substrings.
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  const access = await checkAdmin(request);
  if (!access.ok) return NextResponse.json({ error: adminDenialMessage(access) }, { status: 403 });

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  try {
    const { customers, orphanOrders, capped, ordersCapped } = await listCustomers();

    const digits = query.replace(/\D/g, "");
    const matched = query
      ? customers.filter((customer) =>
          (customer.name ?? "").toLowerCase().includes(query) ||
          (customer.email ?? "").toLowerCase().includes(query) ||
          (digits.length >= 3 && (customer.phone ?? "").replace(/\D/g, "").includes(digits)))
      : customers;

    const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
    const current = Math.min(page, pageCount);
    const slice = matched.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

    return NextResponse.json({
      customers: slice,
      total: matched.length,
      totalAccounts: customers.length,
      page: current,
      pageCount,
      // Orders whose account no longer exists; shown separately, never merged.
      orphanOrders,
      capped,
      ordersCapped,
    });
  } catch {
    return NextResponse.json({ error: "Could not load customers." }, { status: 500 });
  }
}
