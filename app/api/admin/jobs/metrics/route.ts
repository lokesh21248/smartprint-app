import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/auth/admin";

export async function GET() {
  const { authorized, response, userId } = await requireAdmin();
  if (!authorized) return response;

  logAdminAction({ userId: userId!, action: "view_metrics" });

  const supabase = createAdminClient();

  const [counts, logs] = await Promise.all([
    supabase.from("webhook_jobs").select("status", { count: "exact" }),
    supabase.from("job_logs").select("*").order("created_at", { ascending: false }).limit(50)
  ]);

  // Aggregate counts by status
  const statusCounts: Record<string, number> = {
    pending: 0,
    processing: 0,
    failed: 0,
    dead: 0
  };

  const { data: jobs } = await supabase.from("webhook_jobs").select("status");
  jobs?.forEach(j => {
    statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
  });

  return NextResponse.json({
    summary: statusCounts,
    recent_logs: logs.data
  });
}
