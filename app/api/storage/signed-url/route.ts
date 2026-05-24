import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { validateStoragePath, UPLOAD_BUCKET } from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

// Force service role server-side client to guarantee signed URL permissions for private objects
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * GET /api/storage/signed-url?bucket=order-files&path=orders/shop-id/file.pdf
 *
 * Returns a short-lived signed URL for a private storage object.
 * Requires authenticated session + shop ownership verification.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Auth guard ────────────────────────────────────────────────────────────
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Params ────────────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket");
    const path = searchParams.get("path");
    const expiresInParam = searchParams.get("expiresIn");
    const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600; // Default to 1 hour (3600s)

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "Missing required params: bucket, path" },
        { status: 400 }
      );
    }

    // ── Log exact path (Point 8) ──────────────────────────────────────────────
    console.log("[SIGNED_URL_PATH]", path);

    // ── Bucket validation — only allow the uploads bucket ─────────────────────
    if (bucket !== UPLOAD_BUCKET) {
      return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
    }

    // ── Path validation — block traversal attacks + malformed paths ────────────
    const pathCheck = validateStoragePath(path);
    if (!pathCheck.valid) {
      console.warn(`[SECURITY] Blocked storage path: "${path}" — ${pathCheck.error}`);
      return NextResponse.json({ error: pathCheck.error }, { status: 400 });
    }

    // Validate expiresIn (max 3600 seconds)
    if (isNaN(expiresIn) || expiresIn < 1 || expiresIn > 3600) {
      return NextResponse.json(
        { error: "expiresIn must be between 1 and 3600 seconds" },
        { status: 400 }
      );
    }

    // ── Ownership verification ────────────────────────────────────────────────
    // The pathCheck.shopId segment can be either shopId or orderId.
    const uuid = pathCheck.shopId!;
    let shopId = uuid;

    // Check if uuid is an orderId to find its shopId
    const { data: orderData } = await supabaseAdmin
      .from("orders")
      .select("shop_id")
      .eq("id", uuid)
      .maybeSingle();

    if (orderData) {
      shopId = orderData.shop_id;
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .eq("clerk_owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (shopError || !shop) {
      // Forbidden: trying to access another shop's files
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Verify storage object exists physically (Point 6) ─────────────────────
    const lastSlashIndex = path.lastIndexOf("/");
    const folder = lastSlashIndex !== -1 ? path.substring(0, lastSlashIndex) : "";
    const filename = lastSlashIndex !== -1 ? path.substring(lastSlashIndex + 1) : path;

    const { data: fileExists, error: listError } = await supabaseAdmin.storage
      .from(bucket)
      .list(folder);

    if (listError) {
      console.error("[SIGNED_URL_ERROR]", listError);
      return NextResponse.json(
        { error: `Failed to list storage directory: ${listError.message}` },
        { status: 500 }
      );
    }

    const present = fileExists?.some((f: any) => f.name === filename);
    if (!present) {
      console.error("[SIGNED_URL_ERROR] File missing in storage bucket list:", path);
      return NextResponse.json(
        { error: "Requested document does not exist in storage." },
        { status: 404 }
      );
    }

    // ── Generate signed URL server-side (Point 5) ─────────────────────────────
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) {
      console.error("[SIGNED_URL_ERROR]", error);
      return NextResponse.json(
        { error: error?.message || "Failed to generate signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl, expiresIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[signed-url]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
