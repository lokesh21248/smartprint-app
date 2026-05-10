import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedUrl } from "@/lib/storage";

/**
 * GET /api/storage/signed-url?bucket=order-files&path=shop-id/file.pdf
 *
 * Returns a short-lived signed URL for a private storage object.
 * Requires an authenticated session — returns 401 otherwise.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Auth guard ────────────────────────────────────────────────────────────
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createAdminClient();

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

    // Validate expiresIn (max 60 seconds for production safety)
    if (isNaN(expiresIn) || expiresIn < 1 || expiresIn > 60) {
      return NextResponse.json(
        { error: "expiresIn must be between 1 and 60 seconds" },
        { status: 400 }
      );
    }

    // ── Ownership Verification ────────────────────────────────────────────────
    // Path format: "orders/[shopId]/[fileName]"
    const parts = path.split("/");
    if (parts[0] !== "orders" || !parts[1]) {
      return NextResponse.json({ error: "Invalid path format" }, { status: 400 });
    }
    const shopIdFromPath = parts[1];

    // Verify the user owns the shop extracted from the file path
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopIdFromPath)
      .eq("clerk_owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (shopError || !shop) {
      // Forbidden: Trying to access another shop's files
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Generate URL ──────────────────────────────────────────────────────────
    const signedUrl = await getSignedUrl(bucket, path, expiresIn);

    return NextResponse.json({ signedUrl, expiresIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[signed-url]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
