import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
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
    const supabase = await createClient();

    // ── Params ────────────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket");
    const path = searchParams.get("path");
    const expiresInParam = searchParams.get("expiresIn");
    const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600;

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "Missing required params: bucket, path" },
        { status: 400 }
      );
    }

    // Validate expiresIn (max 7 days)
    if (isNaN(expiresIn) || expiresIn < 1 || expiresIn > 604800) {
      return NextResponse.json(
        { error: "expiresIn must be between 1 and 604800 seconds" },
        { status: 400 }
      );
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
