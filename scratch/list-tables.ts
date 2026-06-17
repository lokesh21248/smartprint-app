import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function run() {
  const { data, error } = await supabase.rpc("get_tables"); // If RPC exists, otherwise run direct SQL via some other query or try querying common names.
  if (error) {
    console.log("RPC get_tables failed:", error.message);
    
    // Fallback: search common table names
    const commonTables = ["shops", "shop_profiles", "reviews", "ratings", "orders", "shop_reviews", "shop_ratings", "customer_reviews", "customer_ratings", "feedback"];
    for (const tbl of commonTables) {
      const { error: err } = await supabase.from(tbl).select("count").limit(0);
      if (err) {
        if (err.code !== "42P01") {
          console.log(`Table '${tbl}' exists but failed select count:`, err.message);
        }
      } else {
        console.log(`Table '${tbl}' exists!`);
      }
    }
  } else {
    console.log("Tables list:", data);
  }
}

run();
