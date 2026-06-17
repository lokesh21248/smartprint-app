import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createAdminClient } from "../lib/supabase/admin";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env.local
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

const anonSupabase = createAnonClient(url, anonKey);
const adminSupabase = createAdminClient();

// Use a random shop ID or a placeholder
const testShopId = "7d914133-a97a-4695-bb21-07320fe8c71d";

async function run() {
  console.log("--- 1. Testing SELECT on shop_settings using Anon Client ---");
  const { data: anonData, error: anonError } = await anonSupabase
    .from("shop_settings")
    .select("*")
    .eq("shop_id", testShopId);

  if (anonError) {
    console.error("❌ Anon SELECT failed:", anonError.message);
  } else {
    console.log("✅ Anon SELECT succeeded. Data:", anonData);
  }

  console.log("\n--- 2. Testing UPSERT on shop_settings using Anon Client ---");
  const { data: anonUpsertData, error: anonUpsertError } = await anonSupabase
    .from("shop_settings")
    .upsert({
      shop_id: testShopId,
      sound_alerts: true,
      notification_sound: "whatsapp",
    }, { onConflict: "shop_id" })
    .select();

  if (anonUpsertError) {
    console.error("❌ Anon UPSERT failed:", anonUpsertError.message);
  } else {
    console.log("✅ Anon UPSERT succeeded. Data:", anonUpsertData);
  }

  console.log("\n--- 3. Testing SELECT on shop_settings using Admin Client ---");
  const { data: adminData, error: adminError } = await adminSupabase
    .from("shop_settings")
    .select("*")
    .eq("shop_id", testShopId);

  if (adminError) {
    console.error("❌ Admin SELECT failed:", adminError.message);
  } else {
    console.log("✅ Admin SELECT succeeded. Data:", adminData);
  }
}

run();
