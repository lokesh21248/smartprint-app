import { createAdminClient } from "@/lib/supabase/admin";
import { deleteShop } from "@/lib/supabase/shop";
import { NextResponse } from "next/server";

const MAX_RETRIES = 5;
const WORKER_MAX_TIME_MS = 5000;
// Smart retry backoff: 10s, 30s, 2min, 5min, 30min
const BACKOFF_SECONDS = [10, 30, 120, 300, 1800];

// --- Inline concurrency limiter (avoids p-limit ESM issues in Next.js) ---
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

// --- Dynamic batch size based on queue depth ---
import { SupabaseClient } from "@supabase/supabase-js";

interface WebhookJob {
  id: string;
  payload: {
    type: string;
    data: {
      id: string;
      public_metadata?: {
        shopName?: string;
        location?: string;
        phone?: string;
      };
    };
  };
  retry_count: number;
  status: string;
  _error?: string;
}

// --- Dynamic batch size based on queue depth ---
async function getDynamicBatchSize(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("webhook_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "failed"]);
  
  if (!count || count < 20) return 5;
  if (count < 100) return 10;
  return 20;
}

// --- Process a single job ---
async function processJob(supabase: SupabaseClient, job: WebhookJob): Promise<"success" | "failed"> {
  try {
    const payload = job.payload;
    const userData = payload.data;

    if (payload.type === "user.created") {
      // Intentionally no-op: shops are created explicitly via /create-shop.
    } else if (payload.type === "user.updated") {
      // Sync metadata and standard profile fields to existing shop only
      const updates: Record<string, string> = { updated_at: new Date().toISOString() };
      
      // Sync from public metadata
      if (userData.public_metadata?.shopName) updates.name = userData.public_metadata.shopName;
      if (userData.public_metadata?.location) updates.address_line1 = userData.public_metadata.location;
      if (userData.public_metadata?.phone) updates.owner_phone = userData.public_metadata.phone;

      // Sync from standard Clerk profile
      interface ClerkUserPayload {
        first_name?: string | null;
        last_name?: string | null;
        primary_email_address_id?: string | null;
        email_addresses?: { id: string; email_address: string }[];
      }
      const rawUser = payload.data as ClerkUserPayload;
      if (rawUser.first_name || rawUser.last_name) {
        updates.owner_name = [rawUser.first_name, rawUser.last_name].filter(Boolean).join(" ").trim();
      }
      
      if (rawUser.email_addresses && rawUser.primary_email_address_id) {
        const primaryEmail = rawUser.email_addresses.find(
          (e: { id: string; email_address?: string }) => e.id === rawUser.primary_email_address_id
        )?.email_address;
        if (primaryEmail) updates.owner_email = primaryEmail;
      }

      if (Object.keys(updates).length > 1) {
        await supabase.from("shops").update(updates).eq("clerk_owner_id", userData.id);
      }
    } else if (payload.type === "user.deleted") {
      await deleteShop(supabase, userData.id);
    }

    return "success";
  } catch (err: unknown) {
    // Attach error to job for bulk update
    const error = err as Error;
    job._error = error.message;
    return "failed";
  }
}

export async function POST() {
  const supabase = createAdminClient();
  const workerStart = Date.now();

  // 1. Acquire Worker Lock
  const { error: lockError } = await supabase
    .from("worker_locks")
    .insert({ id: "main_worker", locked_at: new Date().toISOString() });

  if (lockError) {
    return NextResponse.json({ status: lockError.code === "23505" ? "busy" : "error" });
  }

  const limit = createLimiter(5); // Max 5 concurrent jobs
  let totalProcessed = 0;
  let batchCount = 0;

  try {
    while (Date.now() - workerStart < WORKER_MAX_TIME_MS) {
      // 2. Dynamic Batch Size
      const batchSize = await getDynamicBatchSize(supabase);
      const batchStart = Date.now();

      const { data: jobs, error: fetchError } = await supabase.rpc("pickup_webhook_jobs", {
        limit_count: batchSize,
      }) as { data: WebhookJob[] | null, error: { message: string } | null };

      if (fetchError || !jobs?.length) break;

      // 3. Controlled Parallel Processing (max 5 concurrent)
      const results = await Promise.all(
        jobs.map((job) => limit(() => processJob(supabase, job)))
      );

      const successes = jobs.filter((_, i) => results[i] === "success");
      const failures = jobs.filter((_, i) => results[i] === "failed");

      // 4. Bulk Finalize: Successes → status = 'completed'
      if (successes.length > 0) {
        await supabase
          .from("webhook_jobs")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .in("id", successes.map((j) => j.id));
        totalProcessed += successes.length;
      }

      // 5. Bulk Finalize: Failures → smart retry scheduling
      // 🟡 M1 FIX: Replaced sequential for-loop (N DB calls) with 2 parallel bulk updates.
      // Dead jobs and retry jobs are updated in one Promise.all, not one-at-a-time.
      if (failures.length > 0) {
        const deadJobs = failures.filter((j) => j.retry_count + 1 >= MAX_RETRIES);
        const retryJobs = failures.filter((j) => j.retry_count + 1 < MAX_RETRIES);
        const nowTs = new Date().toISOString();

        await Promise.all([
          deadJobs.length > 0 &&
            supabase
              .from("webhook_jobs")
              .update({
                status: "dead",
                retry_count: MAX_RETRIES,
                next_retry_at: null,
                last_error: deadJobs[0]?._error ?? "max retries exceeded",
                updated_at: nowTs,
              })
              .in("id", deadJobs.map((j) => j.id)),

          // Each retry job may have a different next_retry_at due to backoff;
          // update shared fields in bulk and leave per-job backoff at its current slot.
          retryJobs.length > 0 &&
            supabase
              .from("webhook_jobs")
              .update({
                status: "failed",
                updated_at: nowTs,
              })
              .in("id", retryJobs.map((j) => j.id)),
        ].filter(Boolean));

        // Per-job retry_count + next_retry_at still needs individual updates
        // because backoff is position-dependent. Run in parallel (not sequential).
        await Promise.all(
          retryJobs.map((job) =>
            supabase
              .from("webhook_jobs")
              .update({
                retry_count: job.retry_count + 1,
                next_retry_at: new Date(
                  Date.now() + (BACKOFF_SECONDS[job.retry_count] ?? 1800) * 1000
                ).toISOString(),
                last_error: job._error,
              })
              .eq("id", job.id)
          )
        );
      }

      batchCount++;

      // 6. Observability: Per-batch log
      console.log(JSON.stringify({
        status: "batch_complete",
        batch: batchCount,
        batchSize: jobs.length,
        successes: successes.length,
        failures: failures.length,
        batchTimeMs: Date.now() - batchStart,
        timestamp: new Date().toISOString(),
      }));
    }

    return NextResponse.json({
      processed: totalProcessed,
      batches: batchCount,
      elapsedMs: Date.now() - workerStart,
    });

  } finally {
    // 7. Always release lock
    await supabase.from("worker_locks").delete().eq("id", "main_worker");
  }
}
