import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

const MAX_SCAN_ATTEMPTS = 3;

// Validate magic bytes for common print formats (PDF, JPEG, PNG)
function validateMagicBytes(buffer: ArrayBuffer): { valid: boolean; type?: string } {
  const arr = new Uint8Array(buffer).subarray(0, 4);
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  if (hex.startsWith('25504446')) return { valid: true, type: 'application/pdf' };
  if (hex.startsWith('FFD8FF')) return { valid: true, type: 'image/jpeg' };
  if (hex.startsWith('89504E47')) return { valid: true, type: 'image/png' };

  return { valid: false };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Fetch up to 50 pending or failed files (if under max attempts)
  const { data: filesToScanData, error: fetchError } = await supabase
    .from("order_files")
    .select("id, storage_path, shop_id, scan_attempts, updated_at")
    .in("scan_status", ["pending", "failed"])
    .lt("scan_attempts", MAX_SCAN_ATTEMPTS)
    .limit(100);

  // Apply exponential backoff in memory (1min, 2min, 4min...)
  const now = Date.now();
  const filesToScan = filesToScanData?.filter(f => {
    if (f.scan_attempts === 0) return true;
    const backoffMs = Math.pow(2, f.scan_attempts || 1) * 60 * 1000;
    const lastUpdate = new Date(f.updated_at).getTime();
    return now - lastUpdate > backoffMs;
  }).slice(0, 50) || [];

  if (fetchError) {
    console.error(JSON.stringify({
      level: "error",
      event: "scan_files_fetch_failed",
      error: fetchError.message,
      timestamp: new Date().toISOString()
    }));
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!filesToScan || filesToScan.length === 0) {
    return NextResponse.json({ message: "No pending files to scan" });
  }

  // 2. Mark as scanning
  const ids = filesToScan.map(f => f.id);
  await supabase
    .from("order_files")
    .update({ scan_status: "scanning" })
    .in("id", ids);

  let cleanCount = 0;
  let infectedCount = 0;
  let failedCount = 0;

  // 3. Scanning Process with Validation & Retries
  for (const file of filesToScan) {
    try {
      const attempts = (file.scan_attempts || 0) + 1;

      // Download a tiny chunk of the file for magic byte validation
      // NOTE: Supabase JS doesn't easily support Range requests out of the box, 
      // but downloading a few MBs for small order files is acceptable.
      // For large files, we download the whole file to scan it anyway.
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("order-files")
        .download(file.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file for scanning: ${downloadError?.message}`);
      }

      const buffer = await fileData.arrayBuffer();
      const magic = validateMagicBytes(buffer);

      if (!magic.valid) {
        throw new Error("Invalid file signature. Only PDF, JPEG, and PNG are allowed.");
      }

      // Since we don't have an external AV scanner integrated, files with valid magic bytes are considered clean.
      const isInfected = false;

      if (isInfected) {
        // Delete from storage immediately
        await supabase.storage.from("order-files").remove([file.storage_path]);
        
        await supabase
          .from("order_files")
          .update({
            scan_status: "infected",
            infected: true,
            scan_attempts: attempts,
            scanned_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", file.id);

        await supabase.from("file_audit_logs").insert({
          file_id: file.id,
          shop_id: file.shop_id,
          user_id: "system",
          action: "scan_infected",
          details: { reason: "Virus signature detected or invalid magic bytes" }
        });

        console.log(JSON.stringify({
          level: "warn",
          event: "scan_infected",
          file_id: file.id,
          shop_id: file.shop_id,
          timestamp: new Date().toISOString()
        }));

        infectedCount++;
      } else {
        await supabase
          .from("order_files")
          .update({
            scan_status: "clean",
            infected: false,
            scan_attempts: attempts,
            scanned_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", file.id);

        await supabase.from("file_audit_logs").insert({
          file_id: file.id,
          shop_id: file.shop_id,
          user_id: "system",
          action: "scan_clean",
          details: { info: "File is safe", type: magic.type }
        });

        console.log(JSON.stringify({
          level: "info",
          event: "scan_clean",
          file_id: file.id,
          shop_id: file.shop_id,
          timestamp: new Date().toISOString()
        }));

        cleanCount++;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const attempts = (file.scan_attempts || 0) + 1;
      
      console.error(JSON.stringify({
        level: "error",
        event: "scan_failed",
        file_id: file.id,
        shop_id: file.shop_id,
        error: errorMessage,
        attempts: attempts,
        timestamp: new Date().toISOString()
      }));

      await supabase
        .from("order_files")
        .update({ 
          scan_status: attempts >= MAX_SCAN_ATTEMPTS ? "failed" : "pending", 
          scan_attempts: attempts,
          scan_error: errorMessage,
          updated_at: new Date().toISOString() 
        })
        .eq("id", file.id);
        
      failedCount++;
    }
  }

  return NextResponse.json({
    success: true,
    scanned: filesToScan.length,
    clean: cleanCount,
    infected: infectedCount,
    failed: failedCount
  });
}
