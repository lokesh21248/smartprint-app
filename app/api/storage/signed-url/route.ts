import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSignedUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageShop } from "@/lib/auth/shop-access";
import { getServerRole } from "@/lib/auth/role-guard";
import { rateLimit, rateLimitHeaders } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  // ── 1. Auth guard ─────────────────────────────────────────────────────────────
  const authObj = await auth();
  const userId = authObj.userId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Rate limit (100 requests / minute) ──────────────────────────────────────
  const rl = rateLimit(`signed_url_${userId}`, 100, 60);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 100) }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const bucket = searchParams.get("bucket");
    const path = searchParams.get("path");

    if (!bucket || !path) {
      return NextResponse.json({ error: "Missing params: bucket and path are required" }, { status: 400 });
    }

    // Path traversal validation
    if (path.includes("..") || path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Resolve Clerk role claim
    const clerkRole = String(
      (authObj.sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ?? ""
    )
      .trim()
      .toLowerCase();

    // ── 3. Parallel check role + initial DB lookups (FIX P2) ──────────────────
    const [role, orderFileRes, uploadSessionRes] = await Promise.all([
      getServerRole(userId, clerkRole),
      supabase
        .from("order_files")
        .select("shop_id, uploaded_by")
        .eq("storage_path", path)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("upload_sessions")
        .select("order_id")
        .eq("storage_path", path)
        .limit(1)
        .maybeSingle(),
    ]);

    let resolvedShopId: string | null = null;
    let resolvedUploadedBy: string | null = null;

    if (orderFileRes.data) {
      resolvedShopId = orderFileRes.data.shop_id;
      resolvedUploadedBy = orderFileRes.data.uploaded_by;
    } else if (uploadSessionRes.data?.order_id) {
      const { data: order } = await supabase
        .from("orders")
        .select("shop_id")
        .eq("id", uploadSessionRes.data.order_id)
        .limit(1)
        .maybeSingle();
      if (order) {
        resolvedShopId = order.shop_id;
      }
    }

    // ── 4. Fallback: Parse path segment ──────────────────────────────────────
    if (!resolvedShopId) {
      const segments = path.split("/");
      if (segments.length >= 2 && segments[0] === "orders") {
        const idSegment = segments[1];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(idSegment)) {
          // Parallelize checks for shops and orders fallback (Fix waterfall)
          const [shopRes, orderRes] = await Promise.all([
            supabase
              .from("shops")
              .select("id")
              .eq("id", idSegment)
              .limit(1)
              .maybeSingle(),
            supabase
              .from("orders")
              .select("shop_id")
              .eq("id", idSegment)
              .limit(1)
              .maybeSingle(),
          ]);
          if (shopRes.data) {
            resolvedShopId = shopRes.data.id;
          } else if (orderRes.data) {
            resolvedShopId = orderRes.data.shop_id;
          }
        }
      }
    }

    if (!resolvedShopId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // ── 5. Authorization rules ───────────────────────────────────────────────
    if (role === "admin") {
      // Allowed
    } else if (role === "customer") {
      // Allowed only if the file belongs to their own order
      if (!resolvedUploadedBy || resolvedUploadedBy !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // Owners, managers, and staff must be assigned to this shop
      const isAuthorized = await canManageShop(userId, resolvedShopId, clerkRole);
      if (!isAuthorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Generate signed URL — 1 hour TTL (lib/storage handles in-memory TTL caching!)
    const signedUrl = await createSignedUrl(bucket, path, 3600);

    return NextResponse.json({ signedUrl });
  } catch (err) {
    console.error("[SIGNED_URL_FATAL]", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
