import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Try loading env files
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
  // Let's test checking some potential tables
  const tables = ["shops", "shop_profiles", "reviews", "ratings", "orders"];
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select("*").limit(1);
      if (error) {
        console.log(`Table '${table}' check failed:`, error.message, error.code);
      } else {
        console.log(`Table '${table}' exists! Sample structure:`, data[0] ? Object.keys(data[0]) : "No rows");
      }
    } catch (e: any) {
      console.log(`Table '${table}' query threw error:`, e.message);
    }
  }
}

run();
