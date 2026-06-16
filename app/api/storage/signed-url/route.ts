import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSignedUrl } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageShop } from "@/lib/auth/shop-access";
import { getServerRole } from "@/lib/auth/role-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const role = await getServerRole();

    // Resolve shopId and orderId ownership
    let resolvedShopId: string | null = null;
    let resolvedUploadedBy: string | null = null;

    // 1. Try order_files lookup
    const { data: orderFile } = await supabase
      .from("order_files")
      .select("shop_id, uploaded_by")
      .eq("storage_path", path)
      .limit(1)
      .maybeSingle();

    if (orderFile) {
      resolvedShopId = orderFile.shop_id;
      resolvedUploadedBy = orderFile.uploaded_by;
    } else {
      // 2. Try upload_sessions lookup
      try {
        const { data: uploadSession } = await supabase
          .from("upload_sessions")
          .select("order_id")
          .eq("storage_path", path)
          .limit(1)
          .maybeSingle();

        if (uploadSession?.order_id) {
          const { data: order } = await supabase
            .from("orders")
            .select("shop_id")
            .eq("id", uploadSession.order_id)
            .limit(1)
            .maybeSingle();
          if (order) {
            resolvedShopId = order.shop_id;
          }
        }
      } catch (err) {
        console.warn("[signed-url] upload_sessions lookup skipped:", err);
      }
    }

    // 3. Fallback: Parse path segment
    if (!resolvedShopId) {
      const segments = path.split("/");
      if (segments.length >= 2 && segments[0] === "orders") {
        const idSegment = segments[1];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(idSegment)) {
          // Check if it is a shop ID
          const { data: shop } = await supabase
            .from("shops")
            .select("id")
            .eq("id", idSegment)
            .limit(1)
            .maybeSingle();
          if (shop) {
            resolvedShopId = shop.id;
          } else {
            // Check if it is an order ID
            const { data: order } = await supabase
              .from("orders")
              .select("shop_id")
              .eq("id", idSegment)
              .limit(1)
              .maybeSingle();
            if (order) {
              resolvedShopId = order.shop_id;
            }
          }
        }
      }
    }

    if (!resolvedShopId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // ── Authorization rules ──────────────────────────────────────────────────
    if (role === "admin") {
      // Allowed
    } else if (role === "customer") {
      // Allowed only if the file belongs to their own order
      if (!resolvedUploadedBy || resolvedUploadedBy !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // Owners, managers, and staff must be assigned to this shop
      const isAuthorized = await canManageShop(userId, resolvedShopId);
      if (!isAuthorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Generate signed URL — 1 hour TTL
    const signedUrl = await createSignedUrl(bucket, path, 3600);

    return NextResponse.json({ signedUrl });
  } catch (err) {
    console.error("[SIGNED_URL_FATAL]", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
