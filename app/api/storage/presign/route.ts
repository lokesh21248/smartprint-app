import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitPresign, rateLimitHeaders } from "@/lib/ratelimit";
import {
  validateUploadRequest,
  generateStoragePath,
  UPLOAD_BUCKET,
  UPLOAD_URL_TTL_SECONDS,
} from "@/lib/upload-validation";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/storage/presign
 *
 * Issues a short-lived Supabase Storage upload URL so the browser can upload
 * PDFs DIRECTLY to Supabase Storage — bypassing Vercel entirely.
 *
 * Flow:
 * 1. Client → POST /api/storage/presign   { shopId, fileName, fileSize, mimeType }
 * 2. Server validates + issues signed upload URL (120s TTL)
 * 3. Client → PUT <signedUploadUrl>  (binary PDF, direct to Supabase)
 * 4. Client → POST /api/orders        { filePath, ... }  (tiny JSON payload)
 */

export async function POST(request: Request) {
  try {
    // 1. Rate limit — 20 uploads/hour/IP (in-memory, zero DB cost)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "anonymous";
    const rl = rateLimitPresign(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait before uploading again." },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    // 2. Parse body
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { shopId, fileName, fileSize, mimeType } = body as {
      shopId?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
    };

    // 3. Validate shopId
    if (!shopId || typeof shopId !== "string") {
      return NextResponse.json(
        { error: "Missing required field: shopId" },
        { status: 400 }
      );
    }

    // 4. Validate file — MIME type, extension, double-extension, path traversal, size
    const validation = validateUploadRequest({ fileName, fileSize, mimeType });
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.statusCode ?? 400 }
      );
    }

    // 5. Confirm shop exists and is active (prevent orphan uploads)
    const supabase = createAdminClient();
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, is_active")
      .eq("id", shopId)
      .maybeSingle();

    if (shopError || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    if (!shop.is_active) {
      return NextResponse.json(
        { error: "This shop is currently not accepting orders." },
        { status: 403 }
      );
    }

    // 6. Generate unique, collision-safe storage path
    //    Uses timestamp + random — original filename is NOT used to prevent
    //    path traversal, collisions, and encoding issues.
    const storagePath = generateStoragePath(shopId, validation.extension!);

    // 7. Issue signed upload URL (client PUTs the file directly to this URL)
    const { data: signedData, error: signError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (signError || !signedData) {
      console.error("[presign] Failed to create signed URL:", signError?.message);
      return NextResponse.json(
        { error: "Failed to create upload URL" },
        { status: 500 }
      );
    }

    // 8. Track upload for auto-cleanup (runs every 2 hours via pg_cron)
    await supabase
      .from("uploaded_documents")
      .insert({ file_path: storagePath })
      .then(({ error }) => {
        if (error) console.warn("[presign] uploaded_documents insert failed:", error.message);
      });

    return NextResponse.json({
      signedUrl: signedData.signedUrl,   // Client PUTs the file here
      token: signedData.token,
      storagePath,                       // Client sends this to POST /api/orders
      sanitizedName: validation.sanitizedName,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[presign] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
