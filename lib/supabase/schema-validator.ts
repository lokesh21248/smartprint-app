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

  // 1. Verify Shops
  await checkColumn("shops", "id");
  await checkColumn("shops", "owner_id");
  await checkColumn("shops", "name");

  // 2. Verify Webhook Queue
  await checkColumn("webhook_jobs", "id");
  await checkColumn("webhook_jobs", "status");
  await checkColumn("worker_locks", "id");

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
