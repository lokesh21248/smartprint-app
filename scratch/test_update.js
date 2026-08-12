const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  const orderId = "4e21279e-fdc0-4647-97b1-cc574516f11c";
  
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, shop_id, status_history, customer_name, customer_phone, short_token")
    .eq("id", orderId)
    .single();

  if (fetchError) {
    console.error("Fetch Error:", fetchError);
    return;
  }
  
  const newHistoryEntry = {
    status: "accepted",
    at: new Date().toISOString(),
    actor: "shop",
  };

  const updatedHistory = [
    ...(Array.isArray(order.status_history) ? order.status_history : []),
    newHistoryEntry,
  ];

  const updatePayload = {
    status: "accepted",
    status_history: updatedHistory,
    updated_at: new Date().toISOString(),
  };

  console.log("Attempting to update:", updatePayload);
  
  const { data, error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .select();
    
  console.log("Update Data:", data);
  if (error) {
    console.error("Update Error:", error);
  }
}

testUpdate();
