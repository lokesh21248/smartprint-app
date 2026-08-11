import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // We need to find a valid shop_id
  const { data: shops, error: shopError } = await supabase.from("shops").select("id").limit(1);
  if (shopError || !shops || shops.length === 0) {
    console.error("Failed to find a shop to insert an order for.");
    process.exit(1);
  }
  
  const shopId = shops[0].id;
  console.log(`Using shopId: ${shopId}`);

  // Insert a fake order
  const { data, error } = await supabase.from("orders").insert([
    {
      shop_id: shopId,
      customer_name: "Test Audio Order",
      status: "placed",
      total_amount: 10,
      page_count: 1,
      copies: 1,
      is_color: false,
      is_double_sided: false,
      file_url: "dummy.pdf"
    }
  ]).select();

  if (error) {
    console.error("Error inserting order:", error.message);
  } else {
    console.log("Order inserted successfully!", data);
    
    // Cleanup the test order
    setTimeout(async () => {
      await supabase.from("orders").delete().eq("id", data[0].id);
      console.log("Cleaned up test order.");
      process.exit(0);
    }, 5000);
  }
}

main();
