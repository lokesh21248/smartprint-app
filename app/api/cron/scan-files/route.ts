import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

const MAX_SCAN_ATTEMPTS = 3;

// ─── Layer 1: Magic Byte Validation ─────────────────────────────────────────
// Validates the file's true type against its first bytes.
// Rejects files that lie about their type via extension spoofing.

function validateMagicBytes(
  buffer: ArrayBuffer
): { valid: boolean; type?: string } {
  const arr = new Uint8Array(buffer).subarray(0, 8);
  const hex = Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  if (hex.startsWith("25504446")) return { valid: true, type: "application/pdf" }; // %PDF
  if (hex.startsWith("FFD8FF")) return { valid: true, type: "image/jpeg" };
  if (hex.startsWith("89504E47")) return { valid: true, type: "image/png" };
  if (hex.startsWith("52494646")) return { valid: true, type: "image/webp" }; // RIFF (WebP)

  return { valid: false };
}

// ─── Layer 2: PDF Threat Content Analysis ──────────────────────────────────
// Scans the raw PDF byte stream for known malicious object patterns.
//
// PDFs are document-format containers — malware is embedded via JavaScript
// actions, auto-open triggers, launch actions, and embedded executables.
// We scan the raw bytes (decoded as latin-1 to preserve all byte values)
// because PDF content streams can be partially decoded without a full parser.
//
// References:
//   • OWASP Testing Guide — PDF Malware
//   • CVE-2010-0188 (Adobe Reader embedded file exploit)
//   • Didier Stevens — PDF Analysis Techniques

interface ThreatPattern {
  /** Regex tested against the decoded PDF text */
  pattern: RegExp;
  /** Human-readable threat description for audit logs */
  description: string;
  /** Risk severity */
  severity: "high" | "medium" | "low";
}

const PDF_THREAT_PATTERNS: ThreatPattern[] = [
  // ── High severity — direct code execution ────────────────────────────────
  {
    pattern: /\/JavaScript\s*[<([\s]/i,
    description: "Embedded JavaScript action",
    severity: "high",
  },
  {
    pattern: /\/JS\s*[<([\s]/i,
    description: "Embedded JavaScript (short form)",
    severity: "high",
  },
  {
    pattern: /\/OpenAction\s*[<[\/]/i,
    description: "Auto-execute action on document open",
    severity: "high",
  },
  {
    pattern: /\/Launch\s*[<[\/]/i,
    description: "Launch external application action",
    severity: "high",
  },
  {
    pattern: /\/EmbeddedFile\s/i,
    description: "Embedded file object (potential dropper)",
    severity: "high",
  },
  {
    pattern: /app\.alert\s*\(/i,
    description: "Acrobat JavaScript alert call",
    severity: "high",
  },
  {
    pattern: /app\.exec\s*\(/i,
    description: "Acrobat JavaScript exec call",
    severity: "high",
  },
  // ── Medium severity — suspicious but not always malicious ───────────────
  {
    pattern: /\/AA\s*[<[\/]/i,
    description: "Additional Actions dictionary (auto-trigger)",
    severity: "medium",
  },
  {
    pattern: /\/RichMedia\s/i,
    description: "RichMedia annotation (Flash/video embed)",
    severity: "medium",
  },
  {
    pattern: /\/XFA\s/i,
    description: "XFA form (legacy, exploitable in old Acrobat)",
    severity: "medium",
  },
  // ── Low severity — informational, flag but don't block ──────────────────
  {
    pattern: /\/URI\s*\(\s*https?:\/\//i,
    description: "External URI link",
    severity: "low",
  },
];

interface AnalysisResult {
  /** Whether the file should be quarantined */
  infected: boolean;
  /** All matched patterns (for audit log) */
  threats: Array<{ description: string; severity: string }>;
  /** Highest severity found */
  maxSeverity: "high" | "medium" | "low" | null;
}

function analyzePdfContent(buffer: ArrayBuffer): AnalysisResult {
  // Decode as latin-1 (ISO-8859-1) — maps each byte to the corresponding
  // Unicode code point, preserving all byte values for regex scanning.
  // This is safe for pattern matching even on compressed/encoded streams
  // because PDF object dictionaries (where threat keywords live) are always
  // in plain ASCII.
  const text = new TextDecoder("iso-8859-1").decode(buffer);

  const threats: Array<{ description: string; severity: string }> = [];

  for (const { pattern, description, severity } of PDF_THREAT_PATTERNS) {
    // Reset stateful regex before each test
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      threats.push({ description, severity });
    }
  }

  const highThreat = threats.some((t) => t.severity === "high");
  const mediumThreat = threats.some((t) => t.severity === "medium");

  // Block on ANY high-severity threat.
  // Medium is flagged in the log but currently allowed (can be tightened).
  const infected = highThreat;

  const maxSeverity = highThreat
    ? "high"
    : mediumThreat
    ? "medium"
    : threats.length > 0
    ? "low"
    : null;

  return { infected, threats, maxSeverity };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
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
  await supabase
    .from("order_files")
    .update({ scan_status: "scanning" })
    .in("id", ids);

  let cleanCount = 0;
  let infectedCount = 0;
  let failedCount = 0;

  // ── 3. Scan each file ───────────────────────────────────────────────────────
  for (const file of filesToScan) {
    const attempts = (file.scan_attempts ?? 0) + 1;

    try {
      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("order-files")
        .download(file.storage_path);

      if (downloadError || !fileData) {
        throw new Error(
          `Download failed: ${downloadError?.message ?? "no data returned"}`
        );
      }

      const buffer = await fileData.arrayBuffer();

      // ── Layer 1: Magic byte check ─────────────────────────────────────────
      const magic = validateMagicBytes(buffer);

      if (!magic.valid) {
        // File type spoofing — quarantine immediately, no content scan needed
        await supabase
          .from("order_files")
          .update({
            scan_status: "infected",
            infected: true,
            scan_attempts: attempts,
            scanned_at: new Date().toISOString(),
            scan_error: "Invalid file signature — type spoofing detected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", file.id);

        // Remove from storage immediately
        await supabase.storage
          .from("order-files")
          .remove([file.storage_path]);

        await supabase.from("file_audit_logs").insert({
          file_id: file.id,
          shop_id: file.shop_id,
          user_id: "system",
          action: "scan_infected",
          details: {
            reason: "Invalid magic bytes — file type spoofing",
            layer: 1,
          },
        });

        console.warn(
          JSON.stringify({
            level: "warn",
            event: "scan_infected_magic_bytes",
            file_id: file.id,
            shop_id: file.shop_id,
            storage_path: file.storage_path,
            timestamp: new Date().toISOString(),
          })
        );

        infectedCount++;
        continue;
      }

      // ── Layer 2: PDF content analysis ────────────────────────────────────
      // Only apply to PDFs — image formats (JPEG, PNG, WebP) don't support
      // embedded scripts and only need the magic byte check.
      let analysisResult: AnalysisResult = {
        infected: false,
        threats: [],
        maxSeverity: null,
      };

      if (magic.type === "application/pdf") {
        analysisResult = analyzePdfContent(buffer);
      }

      if (analysisResult.infected) {
        // ── INFECTED: quarantine the file ─────────────────────────────────
        await supabase
          .from("order_files")
          .update({
            scan_status: "infected",
            infected: true,
            scan_attempts: attempts,
            scanned_at: new Date().toISOString(),
            scan_error: `Threats detected: ${analysisResult.threats
              .map((t) => t.description)
              .join(", ")}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", file.id);

        // Remove file from storage — do not expose to shop owner
        await supabase.storage
          .from("order-files")
          .remove([file.storage_path]);

        await supabase.from("file_audit_logs").insert({
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
            timestamp: new Date().toISOString(),
          })
        );

        infectedCount++;
      } else {
        // ── CLEAN: mark as safe ───────────────────────────────────────────
        await supabase
          .from("order_files")
          .update({
            scan_status: "clean",
            infected: false,
            scan_attempts: attempts,
            scanned_at: new Date().toISOString(),
            scan_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", file.id);

        await supabase.from("file_audit_logs").insert({
          file_id: file.id,
          shop_id: file.shop_id,
          user_id: "system",
          action: "scan_clean",
          details: {
            mime_type: magic.type,
            low_severity_flags: analysisResult.threats.filter(
              (t) => t.severity === "low"
            ),
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
            timestamp: new Date().toISOString(),
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

      await supabase
        .from("order_files")
        .update({
          scan_status: attempts >= MAX_SCAN_ATTEMPTS ? "failed" : "pending",
          scan_attempts: attempts,
          scan_error: errorMessage,
          updated_at: new Date().toISOString(),
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
    failed: failedCount,
  });
}
