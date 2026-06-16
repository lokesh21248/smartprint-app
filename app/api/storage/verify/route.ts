import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateStoragePath, UPLOAD_BUCKET } from "@/lib/upload-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { storagePath, expectedSize } = body as {
      storagePath?: string;
      expectedSize?: number;
    };

    if (!storagePath || expectedSize === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: storagePath, expectedSize" },
        { status: 400 }
      );
    }

    // Security: block path traversal and unauthorized access
    const pathCheck = validateStoragePath(storagePath);
    if (!pathCheck.valid) {
      console.warn(`[SECURITY] Blocked verify path: "${storagePath}" — ${pathCheck.error}`);
      return NextResponse.json({ success: false, error: pathCheck.error }, { status: 400 });
    }

    const admin = createAdminClient();

    /** Mark both tracking tables as uploaded — called from both verify paths */
    const markUploaded = async (path: string) => {
      const payload = { security_status: "pending", scan_status: "pending", upload_status: "uploaded" };
      
      const updateUploadedFiles = async () => {
        try {
          await admin
            .from("uploaded_files")
            .update(payload)
            .eq("storage_path", path);
        } catch {
          // ignore — table may not exist
        }
      };

      await Promise.all([
        admin
          .from("upload_sessions")
          .update(payload)
          .eq("storage_path", path),
        updateUploadedFiles(),
      ]);
    };

    // ── Method 1: .info() — fast, single API call ─────────────────────────────
    try {
      const { data: fileInfo, error: infoError } = await admin.storage
        .from(UPLOAD_BUCKET)
        .info(storagePath);

      if (!infoError && fileInfo) {
        if (fileInfo.size === expectedSize) {
          await markUploaded(storagePath);
          return NextResponse.json({ success: true, verified: true, size: fileInfo.size });
        }
        return NextResponse.json({
          success: false,
          verified: false,
          error: `Size mismatch. Expected ${expectedSize} bytes, storage has ${fileInfo.size} bytes.`,
        });
      }
    } catch (err) {
      console.warn("[SUPABASE_VERIFY_INFO_FALLBACK] info() threw:", err);
    }

    // ── Method 2: Fallback — list folder ─────────────────────────────────────
    const folderPath = storagePath.substring(0, storagePath.lastIndexOf("/"));
    const filename = storagePath.substring(storagePath.lastIndexOf("/") + 1);

    const { data: fileList, error: listError } = await admin.storage
      .from(UPLOAD_BUCKET)
      .list(folderPath, { search: filename });

    if (listError) {
      console.error("[SUPABASE_VERIFY_ERROR]", listError.message);
      return NextResponse.json({
        success: false,
        verified: false,
        error: `Integrity check failed: ${listError.message}`,
      });
    }

    const uploadedFileItem = fileList?.find((f: { name: string }) => f.name === filename);
    if (!uploadedFileItem) {
      console.error("[SUPABASE_VERIFY_MISSING]", { path: storagePath });
      return NextResponse.json({ success: false, verified: false, error: "File missing in storage bucket." });
    }

    const actualSize = uploadedFileItem.metadata?.size ?? 0;
    if (actualSize === 0) {
      return NextResponse.json({ success: false, verified: false, error: "File is empty (0 bytes) in storage bucket." });
    }

    if (actualSize !== expectedSize) {
      console.error("[SUPABASE_VERIFY_SIZE_MISMATCH]", { path: storagePath, expectedSize, actualSize });
      return NextResponse.json({
        success: false,
        verified: false,
        error: `Size mismatch. Expected ${expectedSize} bytes, got ${actualSize} bytes.`,
      });
    }

    await markUploaded(storagePath);
    console.log("[SUPABASE_VERIFY_SUCCESS_LIST]", { path: storagePath, size: actualSize });
    return NextResponse.json({ success: true, verified: true, size: actualSize });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[SUPABASE_VERIFY_EXCEPTION]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
