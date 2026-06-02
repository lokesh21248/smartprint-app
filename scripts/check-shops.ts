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

async function checkShops() {
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, name, slug, shop_code, owner_phone, address_line1, is_open, price_bw_per_page, price_color_per_page, business_hours, updated_at");

  if (error) {
    console.error("Error querying shops:", error);
    return;
  }

  console.log("ALL SHOPS IN DATABASE:");
  console.log(JSON.stringify(shops, null, 2));
}

checkShops();
