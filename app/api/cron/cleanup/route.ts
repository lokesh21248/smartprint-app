import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UPLOAD_BUCKET } from "@/lib/upload-validation";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // 10 seconds (max allowed on Vercel Hobby plan)

// ── Helpers (each returns a summary object, never throws) ────────────────────

async function cleanupAbandonedSessions(supabase: ReturnType<typeof createAdminClient>, cutoff: string) {
  const { data: sessions, error } = await supabase
    .from("upload_sessions")
    .select("storage_path")
    .eq("upload_status", "uploading")
    .lt("created_at", cutoff)
    .limit(100);

  if (error || !sessions?.length) return { deletedTempFiles: 0 };

  const paths = sessions.map((s) => s.storage_path);
  // M5 FIX: Use UPLOAD_BUCKET constant instead of hardcoded "temp-uploads"
  await supabase.storage.from(UPLOAD_BUCKET).remove(paths);
  const { count } = await supabase
    .from("upload_sessions")
    .delete({ count: "exact" })
    .in("storage_path", paths);

  return { deletedTempFiles: count ?? 0 };
}

async function cleanupInfectedFiles(supabase: ReturnType<typeof createAdminClient>) {
  const { data: infected } = await supabase
    .from("order_files")
    .select("id, storage_path")
    .eq("scan_status", "infected")
    .limit(100);

  if (!infected?.length) return { cleanedInfectedFiles: 0 };

  const paths = infected.map((f) => f.storage_path);
  await supabase.storage.from(UPLOAD_BUCKET).remove(paths);
  // Keep DB record for audit purposes — only the file is removed.

  return { cleanedInfectedFiles: infected.length };
}

async function cleanupOldAuditLogs(supabase: ReturnType<typeof createAdminClient>, cutoff: string) {
  const { count } = await supabase
    .from("file_audit_logs")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);

  return { archivedAuditLogs: count ?? 0 };
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // H4 FIX: Run all 3 cleanup operations in parallel.
    // Previously sequential — risked hitting the 10s Vercel timeout if any step was slow.
    // Promise.allSettled ensures one failure never blocks the others.
    const [sessionsResult, infectedResult, auditResult] = await Promise.allSettled([
      cleanupAbandonedSessions(supabase, twentyFourHoursAgo),
      cleanupInfectedFiles(supabase),
      cleanupOldAuditLogs(supabase, thirtyDaysAgo),
    ]);

    const sessions  = sessionsResult.status  === "fulfilled" ? sessionsResult.value  : { deletedTempFiles: 0 };
    const infected  = infectedResult.status  === "fulfilled" ? infectedResult.value  : { cleanedInfectedFiles: 0 };
    const auditLogs = auditResult.status     === "fulfilled" ? auditResult.value     : { archivedAuditLogs: 0 };

    // Log any partial failures
    if (sessionsResult.status === "rejected") console.error("[cron:cleanup] cleanupAbandonedSessions failed:", sessionsResult.reason);
    if (infectedResult.status === "rejected") console.error("[cron:cleanup] cleanupInfectedFiles failed:", infectedResult.reason);
    if (auditResult.status    === "rejected") console.error("[cron:cleanup] cleanupOldAuditLogs failed:", auditResult.reason);

    return NextResponse.json({
      success: true,
      cleanedTempFiles: sessions.deletedTempFiles,
      cleanedInfectedFiles: infected.cleanedInfectedFiles,
      archivedAuditLogs: auditLogs.archivedAuditLogs,
    });
  } catch (err) {
    console.error("[cron:cleanup] Failed to run cleanup:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

