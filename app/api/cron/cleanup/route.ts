import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // 10 seconds (max allowed on Vercel Hobby plan)

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    let deletedTempFiles = 0;

    // 1. Delete abandoned temp uploads (upload_sessions older than 24h and status = 'uploading')
    const { data: abandonedSessions, error: sessionErr } = await supabase
      .from("upload_sessions")
      .select("storage_path")
      .eq("upload_status", "uploading")
      .lt("created_at", twentyFourHoursAgo)
      .limit(100);

    if (!sessionErr && abandonedSessions && abandonedSessions.length > 0) {
      const paths = abandonedSessions.map(s => s.storage_path);
      
      // Delete from bucket
      await supabase.storage.from("temp-uploads").remove(paths);
      
      // Delete from DB
      const { count } = await supabase
        .from("upload_sessions")
        .delete({ count: "exact" })
        .in("storage_path", paths);
        
      deletedTempFiles = count || 0;
    }

    // 2. Delete infected files that might have been stuck
    const { data: infectedFiles } = await supabase
      .from("order_files")
      .select("id, storage_path")
      .eq("scan_status", "infected")
      .limit(100);

    if (infectedFiles && infectedFiles.length > 0) {
      const paths = infectedFiles.map(f => f.storage_path);
      await supabase.storage.from("order-files").remove(paths);
      // We keep the DB record for audit purposes, but the file is gone.
    }

    // 3. Archive/Delete old audit logs (>30 days)
    const { count: deletedAuditLogs } = await supabase
      .from("file_audit_logs")
      .delete({ count: "exact" })
      .lt("created_at", thirtyDaysAgo);

    return NextResponse.json({
      success: true,
      cleanedTempFiles: deletedTempFiles,
      cleanedInfectedFiles: infectedFiles?.length || 0,
      archivedAuditLogs: deletedAuditLogs || 0
    });
  } catch (err) {
    console.error("[cron:cleanup] Failed to run cleanup:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
