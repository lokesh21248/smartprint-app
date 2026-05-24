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

let isBucketConfigured = false;

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
      console.error("[PRESIGN_ERROR] Rate limit exceeded");
      return NextResponse.json(
        { success: false, error: "Too many upload requests. Please wait before uploading again." },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    // 2. Parse body
    const body = await request.json().catch(() => null);
    if (!body) {
      console.error("[PRESIGN_ERROR] Invalid JSON body");
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { shopId, fileName, fileSize, mimeType, orderId } = body as {
      shopId?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      orderId?: string;
    };

    console.log("[PRESIGN_REQUEST]", {
      fileName,
      fileSize,
      contentType: mimeType,
      shopId,
      orderId,
    });

    // 3. Validate shopId
    if (!shopId || typeof shopId !== "string") {
      console.error("[PRESIGN_ERROR] Missing shopId");
      return NextResponse.json(
        { success: false, error: "Missing required field: shopId" },
        { status: 400 }
      );
    }

    // 4. Validate file — MIME type, extension, double-extension, path traversal, size
    const validation = validateUploadRequest({ fileName, fileSize, mimeType });
    if (!validation.valid) {
      console.error("[UPLOAD_FAIL]", new Error(validation.error || "File validation failed"));
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.statusCode ?? 400 }
      );
    }

    const userAgent = request.headers.get("user-agent") ?? "unknown";
    console.log("[UPLOAD_START]", {
      fileName: validation.sanitizedName || fileName,
      fileSize,
      mimeType,
      userAgent,
    });

    // 5. Confirm shop exists and is active (prevent orphan uploads)
    const supabase = createAdminClient();

    // Verify Supabase Storage bucket is accessible and online
    const { data: bucketData, error: bucketError } = await supabase.storage.getBucket(UPLOAD_BUCKET);
    if (bucketError || !bucketData) {
      console.error("[UPLOAD_FAIL]", bucketError || new Error("Supabase storage bucket unavailable"));
      return NextResponse.json(
        { success: false, error: "Storage service is currently unavailable. Please contact support." },
        { status: 503 }
      );
    }

    // Programmatically ensure the bucket allows PDF and image MIME types.
    // Done once per warm container instance via service role.
    if (!isBucketConfigured) {
      try {
        const { error: updateError } = await supabase.storage.updateBucket(UPLOAD_BUCKET, {
          public: false,
          // image/webp added: client compressor converts large PNG/JPG → WebP before upload
          allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"],
          fileSizeLimit: 500 * 1024 * 1024, // Hardened 500 MB limit
        });
        if (updateError) {
          console.warn("[presign] Failed to update bucket configuration programmatically:", updateError.message);
        } else {
          isBucketConfigured = true;
          console.log("[presign] Successfully configured bucket allowed MIME types programmatically");
        }
      } catch (err) {
        console.error("[presign] Error while updating bucket:", err);
      }
    }

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, is_active")
      .eq("id", shopId)
      .maybeSingle();

    if (shopError || !shop) {
      console.error("[PRESIGN_ERROR] Shop not found", shopError);
      return NextResponse.json({ success: false, error: "Shop not found" }, { status: 404 });
    }

    if (!shop.is_active) {
      console.error("[PRESIGN_ERROR] Shop is inactive");
      return NextResponse.json(
        { success: false, error: "This shop is currently not accepting orders." },
        { status: 403 }
      );
    }

    // 6. Generate unique, collision-safe storage path
    //    If orderId is provided, we structure as orders/{orderId}/{filename}.
    //    Otherwise, we use the legacy timestamp-random format.
    const storagePath = orderId
      ? `orders/${orderId}/${validation.sanitizedName}`
      : generateStoragePath(shopId, validation.extension!);

    // Check if file already exists in storage and matches size
    if (orderId) {
      try {
        const { data: fileInfo } = await supabase.storage
          .from(UPLOAD_BUCKET)
          .info(storagePath);

        if (fileInfo && fileInfo.size === fileSize) {
          console.log(`[presign] File ${storagePath} already exists in storage with matching size ${fileSize}. Skipping upload.`);
          return NextResponse.json({
            alreadyExists: true,
            storagePath,
            sanitizedName: validation.sanitizedName,
            expiresIn: UPLOAD_URL_TTL_SECONDS,
          });
        }
      } catch (err) {
        console.warn(`[presign] File existence check failed for path ${storagePath}:`, err);
      }
    }

    // 7. Issue signed upload URL (client PUTs the file directly to this URL)
    const { data: signedData, error: signError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (signError || !signedData) {
      console.error("[UPLOAD_FAIL]", signError || new Error("Failed to create signed URL"));
      return NextResponse.json(
        { success: false, error: "Failed to create upload URL", details: signError?.message },
        { status: 500 }
      );
    }

    // 8. Track upload in upload_sessions table for production staging lifecycle & daily pg_cron cleanup
    const expiresAt = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(); // Staging expiration: 30 hours
    await supabase
      .from("upload_sessions")
      .insert({
        bucket_name: UPLOAD_BUCKET,
        file_name: validation.sanitizedName,
        storage_path: storagePath,
        mime_type: mimeType || "application/octet-stream",
        file_size: fileSize,
        upload_status: "pending",
        is_temporary: true,
        expires_at: expiresAt,
      })
      .then(({ error }) => {
        if (error) console.warn("[presign] upload_sessions insert failed:", error.message);
      });

    return NextResponse.json({
      signedUrl: signedData.signedUrl,   // Client PUTs the file here
      token: signedData.token,
      storagePath,                       // Client sends this to POST /api/orders
      sanitizedName: validation.sanitizedName,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error("[UPLOAD_FAIL]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate upload URL",
      },
      { status: 500 }
    );
  }
}
