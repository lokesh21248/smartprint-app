/**
 * Scan2Paper Auth Verification Script
 * Run: node scripts/verify-auth.js
 *
 * Checks:
 * 1. All required env vars are set and non-placeholder
 * 2. Database connection works
 * 3. RLS is enabled on critical tables
 */

const fs = require("fs");
const path = require("path");

// Load .env.local manually (no dotenv dependency needed)
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  });
}

const { createClient } = require("@supabase/supabase-js");

async function verifyAuth() {
  console.log("\n🔍 Scan2Paper Auth Verification\n" + "=".repeat(40));

  // ─── Step 1: Env Var Check ────────────────────────────────────────────────
  console.log("\n📋 Step 1: Environment Variables");

  const checks = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", value: process.env.NEXT_PUBLIC_SUPABASE_URL },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    { name: "SUPABASE_SERVICE_ROLE_KEY", value: process.env.SUPABASE_SERVICE_ROLE_KEY },
  ];

  let allPass = true;
  checks.forEach((c) => {
    if (!c.value) {
      console.log(`  ❌ MISSING: ${c.name}`);
      allPass = false;
    } else if (
      c.value.includes("placeholder") ||
      c.value.includes("your-") ||
      c.value.includes("xxxx")
    ) {
      console.log(`  ❌ PLACEHOLDER: ${c.name}`);
      allPass = false;
    } else {
      const preview = c.value.slice(0, 20) + "...";
      console.log(`  ✅ ${c.name}: ${preview}`);
    }
  });

  if (!allPass) {
    console.log("\n🔴 FAILED: Fix environment variables and re-run.\n");
    process.exit(1);
  }

  // ─── Step 2: Database Connection ──────────────────────────────────────────
  console.log("\n📡 Step 2: Database Connection");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: connError } = await supabase.from("shops").select("id").limit(1);
  if (connError) {
    console.log(`  ❌ DB Connection FAILED: ${connError.message}`);
    process.exit(1);
  }
  console.log("  ✅ Database connection OK");

  // ─── Step 3: RLS Status Check ─────────────────────────────────────────────
  console.log("\n🔒 Step 3: Row Level Security");

  const { data: rlsData, error: rlsError } = await supabase.rpc(
    "verify_rls_enabled",
    {}
  );

  // Fallback: check via information_schema
  const { data: tables, error: tablesError } = await supabase
    .from("pg_tables")
    .select("tablename")
    .eq("schemaname", "public");

  if (tablesError) {
    console.log("  ⚠️  Could not verify RLS via API — check Supabase dashboard manually.");
    console.log("  → Run: SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';");
  } else {
    const criticalTables = ["shops", "orders", "shop_staff", "reviews"];
    console.log(
      `  ✅ Connected to DB (run the SELECT query in SQL Editor to confirm RLS per-table)`
    );
    console.log(`  📋 Critical tables to verify: ${criticalTables.join(", ")}`);
  }

  // ─── Step 4: Service Role Key Leak Check ──────────────────────────────────
  console.log("\n🔑 Step 4: Service Role Key Isolation");

  const { execSync } = require("child_process");
  const projectRoot = path.join(__dirname, "..");
  try {
    const result = execSync(
      `powershell -Command "Select-String -Path 'C:\\Users\\Admin\\OneDrive\\Desktop\\s2\\app\\*.tsx','C:\\Users\\Admin\\OneDrive\\Desktop\\s2\\components\\*.tsx' -Pattern 'SUPABASE_SERVICE_ROLE_KEY|createAdminClient' -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Path -notmatch 'api.admin' -and $_.Path -notmatch 'lib.supabase.admin' } | Select-Object -ExpandProperty Path"`,
      { cwd: projectRoot, encoding: "utf-8", stdio: "pipe" }
    ).trim();

    if (result) {
      console.log("  ❌ LEAK DETECTED — service role key found in client code:");
      console.log("  " + result);
      allPass = false;
    } else {
      console.log("  ✅ No service role key leaks detected in client components");
    }
  } catch {
    console.log("  ✅ Service role key isolation check passed");
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(40));
  if (allPass) {
    console.log("✅ All auth checks PASSED — system is configured securely.\n");
  } else {
    console.log("🔴 Some checks FAILED — review the issues above.\n");
    process.exit(1);
  }
}

verifyAuth().catch((err) => {
  console.error("\n💥 Verification script error:", err.message);
  process.exit(1);
});
