import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedUrl } from "@/lib/storage";
import { validateStoragePath, UPLOAD_BUCKET } from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

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
    const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 60;

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "Missing required params: bucket, path" },
        { status: 400 }
      );
    }

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

    // Validate expiresIn (max 60 seconds for production safety)
    if (isNaN(expiresIn) || expiresIn < 1 || expiresIn > 60) {
      return NextResponse.json(
        { error: "expiresIn must be between 1 and 60 seconds" },
        { status: 400 }
      );
    }

    // ── Ownership verification ────────────────────────────────────────────────
    // The shopId was validated by validateStoragePath above.
    const supabase = createAdminClient();
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("id", pathCheck.shopId!)
      .eq("clerk_owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (shopError || !shop) {
      // Forbidden: trying to access another shop's files
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Generate signed URL ──────────────────────────────────────────────────
    const signedUrl = await getSignedUrl(bucket, path, expiresIn);

    return NextResponse.json({ signedUrl, expiresIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[signed-url]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
