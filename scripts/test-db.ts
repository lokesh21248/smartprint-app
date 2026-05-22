import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Try loading env files
const envLocalPath = path.join(process.cwd(), ".env.local");
const envPath = path.join(process.cwd(), ".env");

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase URL present:", !!url, url);
console.log("Supabase Service Key present:", !!serviceKey);

if (!url || !serviceKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function checkSchema() {
  const { data: tables, error } = await supabase.from("orders").select("id").limit(1);
  console.log("Orders table check error (null means it exists):", error);
  console.log("Orders data sample:", tables);
  
  const { error: orderFilesErr } = await supabase.from("order_files").select("*").limit(0);
  console.log("Order_files table check error (null means it exists):", orderFilesErr);
}

checkSchema();
