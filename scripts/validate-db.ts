// A standalone script for CI/CD or local validation
// Usage: npx tsx scripts/validate-db.ts

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("❌ Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log("🔍 Validating Supabase Schema...");
  const errors: string[] = [];

  async function checkColumn(table: string, column: string) {
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

  await checkColumn("shops", "id");
  await checkColumn("shops", "owner_id");
  await checkColumn("webhook_jobs", "id");
  await checkColumn("worker_locks", "id");
  await checkColumn("order_files", "id");
  await checkColumn("order_files", "order_id");
  await checkColumn("order_files", "file_name");
  await checkColumn("order_files", "storage_path");
  await checkColumn("order_files", "file_size");
  await checkColumn("order_files", "page_count");
  await checkColumn("order_files", "mime_type");

  if (errors.length > 0) {
    console.error("\n🚨 SCHEMA VALIDATION FAILED 🚨");
    errors.forEach(e => console.error(e));
    process.exit(1); // Fail the CI/CD build
  }

  console.log("\n🚀 Schema is valid and production-ready!");
  process.exit(0);
}

run();
