import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

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
  console.log("Querying database policies for storage...");
  const { data: policies, error } = await supabase
    .from("pg_policies")
    .select("*")
    .eq("schemaname", "storage");
  
  if (error) {
    console.error("❌ Error querying policies:", error.message);
  } else {
    console.log("Policies:", JSON.stringify(policies, null, 2));
  }

  console.log("\nChecking storage buckets...");
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.error("❌ Error listing buckets:", bucketError.message);
  } else {
    console.log("Buckets:", JSON.stringify(buckets, null, 2));
  }
}

run();
