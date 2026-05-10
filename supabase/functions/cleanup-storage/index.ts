import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// --- Types ---
interface UploadedDocument {
  id: string;
  file_path: string;
  created_at: string;
}

interface OrderRecord {
  file_s3_key: string;
  status: string;
}

interface CleanupResponse {
  success: boolean;
  deleted: number;
  errors?: string[];
}

// --- Initialization ---
const supabaseUrl = Deno.env.get("APP_SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY");
const cleanupSecret = Deno.env.get("CLEANUP_SECRET");

// Fail fast if misconfigured
if (!supabaseUrl || !supabaseServiceKey || !cleanupSecret) {
  console.error("CRITICAL: Missing environment variables for cleanup function.");
  // We can't even write to DB logs if client config is missing
}

const supabase = createClient(supabaseUrl || "", supabaseServiceKey || "");

Deno.serve(async (req) => {
  const errors: string[] = [];
  let deletedCount = 0;

  try {
    // 1. SECURITY & ENVIRONMENT VALIDATION
    if (!supabaseUrl || !supabaseServiceKey || !cleanupSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Server misconfigured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${cleanupSecret}`) {
      console.warn("Unauthorized access attempt to cleanup-storage");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[Cleanup] Starting storage cleanup routine...");

    // 2. FETCH ELIGIBLE FILES (Batch Processing)
    // Retention period: 2 hours
    const retentionThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: files, error: fetchError } = await supabase
      .from("uploaded_documents")
      .select("id, file_path, created_at")
      .lt("created_at", retentionThreshold)
      .limit(500); // Batch limit to prevent timeouts

    if (fetchError) {
      throw new Error(`Failed to fetch documents: ${fetchError.message}`);
    }

    if (!files || files.length === 0) {
      console.log("[Cleanup] No eligible files found.");
      return logAndRespond("SUCCESS", 0, []);
    }

    console.log(`[Cleanup] Found ${files.length} candidate files older than 2 hours.`);

    // 3. SAFE DELETION RULES (Cross-check with active orders)
    const candidatePaths = files.map((f: UploadedDocument) => f.file_path);

    // Find any candidate files that are currently attached to ACTIVE orders
    // Active = anything NOT completed/cancelled/rejected
    const { data: activeOrders, error: orderCheckError } = await supabase
      .from("orders")
      .select("file_s3_key, status")
      .in("file_s3_key", candidatePaths)
      .not("status", "in", "('COMPLETED', 'CANCELLED', 'REJECTED')");

    if (orderCheckError) {
      throw new Error(`Failed to check active orders: ${orderCheckError.message}`);
    }

    // Create a Set of paths that must be preserved
    const protectedPaths = new Set(
      (activeOrders || []).map((o: OrderRecord) => o.file_s3_key)
    );

    // Filter out protected files
    const filesToDelete = files.filter((f: UploadedDocument) => !protectedPaths.has(f.file_path));

    console.log(`[Cleanup] Preserving ${protectedPaths.size} files tied to active orders.`);
    console.log(`[Cleanup] Proceeding to delete ${filesToDelete.length} files.`);

    if (filesToDelete.length === 0) {
      return logAndRespond("SUCCESS", 0, []);
    }

    const pathsToDelete = filesToDelete.map((f: UploadedDocument) => f.file_path);
    const idsToDelete = filesToDelete.map((f: UploadedDocument) => f.id);

    // 4. STORAGE SAFETY (Delete from storage first)
    const { error: storageError } = await supabase.storage
      .from("order-files")
      .remove(pathsToDelete);

    if (storageError) {
      // Partial failure in storage
      errors.push(`Storage deletion error: ${storageError.message}`);
      // If storage fails completely, we do not delete from tracking DB 
      // so it will be retried next run.
      throw new Error("Aborting due to storage removal failure.");
    }

    // 5. METADATA CLEANUP (Delete DB second)
    const { error: dbError } = await supabase
      .from("uploaded_documents")
      .delete()
      .in("id", idsToDelete);

    if (dbError) {
      errors.push(`Metadata deletion error: ${dbError.message}`);
      // Storage deleted but DB tracking remains. It will safely no-op in storage next time.
      console.error("[Cleanup] Metadata cleanup failed for removed files.");
    }

    deletedCount = filesToDelete.length;
    console.log(`[Cleanup] Successfully purged ${deletedCount} files.`);

    return logAndRespond(errors.length > 0 ? "PARTIAL_SUCCESS" : "SUCCESS", deletedCount, errors);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Cleanup] FATAL:", msg);
    errors.push(msg);
    return logAndRespond("FAILED", deletedCount, errors, 500);
  }
});

/**
 * 6. CLEANUP LOGGING (Observability)
 */
async function logAndRespond(
  status: string,
  deleted: number,
  errors: string[],
  statusCode = 200
): Promise<Response> {
  const payload: CleanupResponse = {
    success: status === "SUCCESS" || status === "PARTIAL_SUCCESS",
    deleted,
  };

  if (errors.length > 0) {
    payload.errors = errors;
  }

  // Attempt to write to cleanup_logs asynchronously (fire and forget)
  if (supabase) {
    supabase
      .from("cleanup_logs")
      .insert({
        deleted_count: deleted,
        status,
        errors: errors.length > 0 ? errors.join(" | ") : null,
      })
      .then(({ error }) => {
        if (error) console.error("[Cleanup] Failed to write log:", error.message);
      });
  }

  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}
