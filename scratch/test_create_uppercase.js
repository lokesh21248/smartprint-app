const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  const orderId = "4e21279e-fdc0-4647-97b1-cc574516f11c";
  
  // Update it back from CANCELLED to ACCEPTED just for testing if the constraint allows it (Wait, CANCELLED -> ACCEPTED is not allowed).
  // Let's create a new order with UPPERCASE "PLACED" and update to "ACCEPTED"
  const shopId = "0137ba7f-a94e-4585-9966-6620e02fb65b";
  
  console.log("Creating order with status 'PLACED'...");
  const { data: newOrder, error: insertError } = await supabase
    .from("orders")
    .insert({
      shop_id: shopId,
      status: "PLACED",
      customer_name: "Test",
      customer_phone: "9999999999",
      short_token: "TST123",
      file_s3_key: "dummy",
      file_name: "dummy.pdf",
      file_size_bytes: 1024,
      page_count: 1,
      copies: 1,
      total_amount: 10,
    })
    .select()
    .single();

  if (insertError) {
    console.log("Insert Error:", insertError);
    return;
  }
  
  console.log("Updating to 'ACCEPTED'...");
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "ACCEPTED" })
    .eq("id", newOrder.id)
    .select();
    
  console.log("Update Error:", error);
  console.log("Update Data:", data);
}

testUpdate();
