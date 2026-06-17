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
  // Find a shop first
  const { data: shops, error: shopErr } = await supabase.from("shops").select("id, name").limit(1);
  if (shopErr) {
    console.error("Failed to fetch shop:", shopErr.message);
    return;
  }
  if (!shops || shops.length === 0) {
    console.log("No shops found in database.");
    return;
  }
  
  const shopId = shops[0].id;
  console.log(`Testing queries for Shop: ${shops[0].name} (${shopId})`);
  
  // 1. Query shop details
  const { data: shopData, error: shopDetailsErr } = await supabase
    .from("shops")
    .select("name, address_line1, city, state")
    .eq("id", shopId)
    .maybeSingle();
    
  if (shopDetailsErr) {
    console.error("Shops query error:", shopDetailsErr.message);
  } else {
    console.log("Shop location info:", {
      name: shopData?.name,
      address_line1: shopData?.address_line1,
      city: shopData?.city,
      state: shopData?.state
    });
  }
  
  // 2. Query total completed orders
  const { count: orderCount, error: orderErr } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .in("status", ["COMPLETED", "SUCCESS"]);
    
  if (orderErr) {
    console.error("Orders count query error:", orderErr.message);
  } else {
    console.log("Total completed orders:", orderCount);
  }
  
  // 3. Query reviews
  const { data: reviews, error: reviewsErr } = await supabase
    .from("reviews")
    .select("rating")
    .eq("shop_id", shopId);
    
  if (reviewsErr) {
    console.error("Reviews query error:", reviewsErr.message);
  } else {
    console.log("Reviews list:", reviews);
    const avgRating = reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0.0;
    console.log("Average rating:", avgRating.toFixed(1));
  }
}

run();
