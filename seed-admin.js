const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  });
}
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase keys in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log("Seeding admin account...");
  
  const email = "admin@smartprint.com";
  const password = "password123";

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Admin Owner" }
  });

  let userId = authData?.user?.id;

  if (authError) {
    if (authError.message.includes("already been registered")) {
       console.log("User already exists, fetching user id...");
       
       // Try logging in to get the ID since we know the password, or just list users
       const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
       const existingUser = users?.find(u => u.email === email);
       if (existingUser) {
          userId = existingUser.id;
       } else {
          console.error("Could not fetch existing user");
          process.exit(1);
       }
    } else {
       console.error("Auth Error:", authError);
       process.exit(1);
    }
  }

  if (userId) {
    const { data: existingShops } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", userId);

    if (existingShops && existingShops.length > 0) {
      console.log("Shop already exists for this owner.");
    } else {
      const { error: shopError } = await supabase
        .from("shops")
        .insert({
          owner_id: userId,
          shop_name: "SmartPrint Demo Shop",
          address: "123 Main St",
          city: "Mumbai",
          state: "MH",
          pincode: "400001",
          phone: "+919876543210",
          is_approved: true,
          is_active: true
        });

      if (shopError) {
        console.error("Shop Error:", shopError);
      } else {
        console.log("Shop created successfully!");
      }
    }
  }

  console.log("\nSuccess! You can log in with:");
  console.log("Email:", email);
  console.log("Password:", password);
}

seed();
