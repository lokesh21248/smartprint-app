const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  const { data: orders, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, shop_id, status_history")
    .eq("status", "new")
    .limit(1);

  if (!orders || orders.length === 0) {
    console.log("No new orders found. Checking for 'PLACED'");
    const { data: placedOrders } = await supabase
      .from("orders")
      .select("id, status, shop_id, status_history")
      .eq("status", "PLACED")
      .limit(1);
    
    if (!placedOrders || placedOrders.length === 0) {
        console.log("No PLACED orders either.");
        return;
    }
    console.log("Found placed order:", placedOrders[0]);
    await tryUpdate(placedOrders[0].id);
    return;
  }
  
  console.log("Found new order:", orders[0]);
  await tryUpdate(orders[0].id);
}

async function tryUpdate(orderId) {
  const updatePayload = {
    status: "accepted",
  };

  const { data, error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .select();
    
  console.log("Update Error:", error);
  console.log("Update Data:", data);
}

testUpdate();
