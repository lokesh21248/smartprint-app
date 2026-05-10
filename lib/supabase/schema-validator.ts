import { createAdminClient } from "./admin";

export async function validateSchema() {
  const supabase = createAdminClient();
  const errors: string[] = [];

  console.log("🔍 Running Runtime Schema Validation...");

  // Helper to check if a column exists
  async function checkColumn(table: string, column: string) {
    // We can probe the schema safely using a limit 0 query.
    // If the column doesn't exist, it throws a Postgres error (PGRST106)
    const { error } = await supabase.from(table).select(column).limit(0);
    if (error && error.code === "PGRST106") {
      errors.push(`❌ Missing column: '${column}' in table '${table}'`);
    } else if (error && error.code === "42P01") {
       errors.push(`❌ Missing table: '${table}'`);
    } else if (error) {
       errors.push(`⚠️ Error checking ${table}.${column}: ${error.message}`);
    } else {
      console.log(`✅ ${table}.${column} exists`);
    }
  }

  // 🟡 M7 FIX: Run all checks in parallel instead of sequentially.
  // Was 7 sequential DB round-trips (~350ms); now 1 parallel batch (~50ms).
  // Also fixed: "owner_id" doesn't exist — the live column is "clerk_owner_id".
  await Promise.all([
    // 1. Verify Shops
    checkColumn("shops", "id"),
    checkColumn("shops", "clerk_owner_id"), // ← was "owner_id" (false-positive bug)
    checkColumn("shops", "name"),
    // 2. Verify Webhook Queue
    checkColumn("webhook_jobs", "id"),
    checkColumn("webhook_jobs", "status"),
    checkColumn("worker_locks", "id"),
  ]);

  if (errors.length > 0) {
    console.error("\n🚨 SCHEMA VALIDATION FAILED 🚨");
    errors.forEach(e => console.error(e));
    console.error("\nPlease run the SQL migrations in Supabase to fix these issues.");
    console.error("See: supabase/migrations/20240430143000_production_schema_init.sql\n");
    return { valid: false, errors };
  }

  console.log("🚀 Schema Validation Passed!");
  return { valid: true, errors: [] };
}
