import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateMagicBytes,
  analyzePdfContent,
  type PdfAnalysisResult,
} from "@/lib/security/file-scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // 10 seconds (max allowed on Vercel Hobby plan)

const MAX_SCAN_ATTEMPTS = 3;

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const startTime = Date.now();
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>.
  // Manual calls during testing must include the same header.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ── 1. Fetch pending / previously-failed files (with exponential backoff) ──
  const { data: filesToScanData, error: fetchError } = await supabase
    .from("order_files")
    .select("id, storage_path, shop_id, scan_attempts, updated_at")
    .in("scan_status", ["pending", "failed"])
    .lt("scan_attempts", MAX_SCAN_ATTEMPTS)
    .order("created_at", { ascending: true }) // FIFO — oldest files first
    .limit(100);

  if (fetchError) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "scan_files_fetch_failed",
        error: fetchError.message,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // Apply exponential backoff in memory: 1min, 2min, 4min per attempt
  const now = Date.now();
  const filesToScan = (filesToScanData ?? [])
    .filter((f) => {
      if ((f.scan_attempts ?? 0) === 0) return true;
      const backoffMs = Math.pow(2, f.scan_attempts ?? 1) * 60 * 1000;
      const lastUpdate = new Date(f.updated_at).getTime();
      return now - lastUpdate > backoffMs;
    })
    .slice(0, 50);

  if (filesToScan.length === 0) {
    return NextResponse.json({ message: "No pending files to scan", scanned: 0 });
  }

  // ── 2. Mark batch as "scanning" (prevents double-processing) ───────────────
  const ids = filesToScan.map((f) => f.id);
  await supabase.from("order_files").update({ scan_status: "scanning" }).in("id", ids);

  let cleanCount = 0;
  let infectedCount = 0;
  let failedCount = 0;
  const processedIds: string[] = [];

  // ── Accumulators for batch DB writes (FIX P6) ─────────────────────────────
  // Instead of one DB write per file (N writes), we accumulate results and
  // flush them at the end in batched upserts. This reduces DB round-trips
  // from O(N) to O(1) for status updates.
  type FileUpdateRow = {
    id: string;
    scan_status: string;
    infected: boolean;
    scan_attempts: number;
    scanned_at: string;
    scan_error: string | null;
    updated_at: string;
  };
  type AuditLogRow = {
    file_id: string;
    shop_id: string;
    user_id: string;
    action: string;
    details: Record<string, unknown>;
  };

  const fileUpdates: FileUpdateRow[] = [];
  const auditLogs: AuditLogRow[] = [];

  // ── 3. Scan each file ───────────────────────────────────────────────────────
  for (const file of filesToScan) {
    // 10s Hobby timeout guard: stop batch early with safety buffer
    if (Date.now() - startTime > 8000) {
      console.log(`[scan-files] Approaching execution limit (8s). Stopping batch early.`);
      // Reset unprocessed files back to pending so the next cron run picks them up
      const unprocessedIds = filesToScan
        .map((f) => f.id)
        .filter((id) => !processedIds.includes(id));
      if (unprocessedIds.length > 0) {
        await supabase
          .from("order_files")
          .update({ scan_status: "pending" })
          .in("id", unprocessedIds);
      }
      break;
    }

    processedIds.push(file.id);
    const attempts = (file.scan_attempts ?? 0) + 1;
    const now_iso = new Date().toISOString();

    try {
      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("order-files")
        .download(file.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Download failed: ${downloadError?.message ?? "no data returned"}`);
      }

      const buffer = await fileData.arrayBuffer();

      // ── Layer 1: Magic byte check (uses shared lib/security/file-scanner.ts) ─
      const magic = validateMagicBytes(buffer);

      if (!magic.valid) {
        // File type spoofing — quarantine immediately, no content scan needed
        // Remove from storage immediately (don't expose to shop owner)
        await supabase.storage.from("order-files").remove([file.storage_path]);

        fileUpdates.push({
          id: file.id,
          scan_status: "infected",
          infected: true,
          scan_attempts: attempts,
          scanned_at: now_iso,
          scan_error: "Invalid file signature — type spoofing detected",
          updated_at: now_iso,
        });
        auditLogs.push({
          file_id: file.id,
          shop_id: file.shop_id,
          user_id: "system",
          action: "scan_infected",
          details: { reason: "Invalid magic bytes — file type spoofing", layer: 1 },
        });

        console.warn(
          JSON.stringify({
            level: "warn",
            event: "scan_infected_magic_bytes",
            file_id: file.id,
            shop_id: file.shop_id,
            storage_path: file.storage_path,
            timestamp: now_iso,
          })
        );

        infectedCount++;
        continue;
      }

      // ── Layer 2: PDF content analysis (uses shared lib/security/file-scanner.ts) ─
      // Only apply to PDFs — image formats (JPEG, PNG, WebP) don't support
      // embedded scripts and only need the magic byte check.
      let analysisResult: PdfAnalysisResult = {
        infected: false,
        threats: [],
        maxSeverity: null,
      };

      if (magic.type === "application/pdf") {
        analysisResult = analyzePdfContent(buffer);
      }

      if (analysisResult.infected) {
        // Remove infected file from storage immediately
        await supabase.storage.from("order-files").remove([file.storage_path]);

        fileUpdates.push({
          id: file.id,
          scan_status: "infected",
          infected: true,
          scan_attempts: attempts,
          scanned_at: now_iso,
          scan_error: `Threats detected: ${analysisResult.threats.map((t) => t.description).join(", ")}`,
          updated_at: now_iso,
        });
        auditLogs.push({
          file_id: file.id,
          shop_id: file.shop_id,
          user_id: "system",
          action: "scan_infected",
          details: {
            reason: "Malicious PDF content detected",
            layer: 2,
            threats: analysisResult.threats,
            maxSeverity: analysisResult.maxSeverity,
          },
        });

        console.warn(
          JSON.stringify({
            level: "warn",
            event: "scan_infected_pdf_content",
            file_id: file.id,
            shop_id: file.shop_id,
            storage_path: file.storage_path,
            threats: analysisResult.threats,
            max_severity: analysisResult.maxSeverity,
            timestamp: now_iso,
          })
        );

        infectedCount++;
      } else {
        // CLEAN: accumulate for batch write
        fileUpdates.push({
          id: file.id,
          scan_status: "clean",
          infected: false,
          scan_attempts: attempts,
          scanned_at: now_iso,
          scan_error: null,
          updated_at: now_iso,
        });
        auditLogs.push({
          file_id: file.id,
          shop_id: file.shop_id,
          user_id: "system",
          action: "scan_clean",
          details: {
            mime_type: magic.type,
            low_severity_flags: analysisResult.threats.filter((t) => t.severity === "low"),
          },
        });

        console.log(
          JSON.stringify({
            level: "info",
            event: "scan_clean",
            file_id: file.id,
            shop_id: file.shop_id,
            mime_type: magic.type,
            low_flags: analysisResult.threats.length,
            timestamp: now_iso,
          })
        );

        cleanCount++;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.error(
        JSON.stringify({
          level: "error",
          event: "scan_failed",
          file_id: file.id,
          shop_id: file.shop_id,
          error: errorMessage,
          attempts,
          timestamp: new Date().toISOString(),
        })
      );

      // Accumulate failure update for batch write
      fileUpdates.push({
        id: file.id,
        scan_status: attempts >= MAX_SCAN_ATTEMPTS ? "failed" : "pending",
        infected: false,
        scan_attempts: attempts,
        scanned_at: new Date().toISOString(),
        scan_error: errorMessage,
        updated_at: new Date().toISOString(),
      });

      failedCount++;
    }
  }

  // ── 4. FIX P6: Batch flush all DB writes (was N individual writes, now 2) ──
  // Using upsert on id to update existing rows atomically.
  const flushErrors: string[] = [];

  if (fileUpdates.length > 0) {
    const { error: updateErr } = await supabase
      .from("order_files")
      .upsert(fileUpdates, { onConflict: "id" });
    if (updateErr) {
      flushErrors.push(`order_files upsert: ${updateErr.message}`);
      console.error("[scan-files] Batch order_files update failed:", updateErr.message);
    }
  }

  if (auditLogs.length > 0) {
    const { error: auditErr } = await supabase.from("file_audit_logs").insert(auditLogs);
    if (auditErr) {
      flushErrors.push(`file_audit_logs insert: ${auditErr.message}`);
      console.error("[scan-files] Batch audit log insert failed:", auditErr.message);
    }
  }

  return NextResponse.json({
    success: flushErrors.length === 0,
    scanned: cleanCount + infectedCount + failedCount,
    clean: cleanCount,
    infected: infectedCount,
    failed: failedCount,
    ...(flushErrors.length > 0 && { flushErrors }),
  });
}
