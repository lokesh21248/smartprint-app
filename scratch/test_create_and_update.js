const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  const shopId = "0137ba7f-a94e-4585-9966-6620e02fb65b"; // arbitrary shop
  
  console.log("Creating order with status 'new'...");
  const { data: newOrder, error: insertError } = await supabase
    .from("orders")
    .insert({
      shop_id: shopId,
      status: "new",
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
  
  console.log("Inserted order:", newOrder.id);
  
  console.log("Updating to 'accepted'...");
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "accepted" })
    .eq("id", newOrder.id)
    .select();
    
  console.log("Update Error:", error);
  console.log("Update Data:", data);
}

testUpdate();
