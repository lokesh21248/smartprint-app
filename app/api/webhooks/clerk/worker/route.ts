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
      // Sync metadata to existing shop only — never insert a new one here.
      const updates: Record<string, string> = { updated_at: new Date().toISOString() };
      if (userData.public_metadata?.shopName) updates.name = userData.public_metadata.shopName;
      if (userData.public_metadata?.location) updates.address_line1 = userData.public_metadata.location;
      if (userData.public_metadata?.phone) updates.owner_phone = userData.public_metadata.phone;
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

export async function POST(req: Request) {
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
      for (const job of failures) {
        const nextRetryCount = job.retry_count + 1;
        const isDead = nextRetryCount >= MAX_RETRIES;
        await supabase
          .from("webhook_jobs")
          .update({
            status: isDead ? "dead" : "failed",
            retry_count: nextRetryCount,
            next_retry_at: isDead
              ? null
              : new Date(Date.now() + (BACKOFF_SECONDS[job.retry_count] ?? 1800) * 1000).toISOString(),
            last_error: job._error,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
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
