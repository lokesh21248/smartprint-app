const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function getTrigger() {
  const query = `
    SELECT pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname = 'validate_order_status_transition'
       OR proname LIKE '%status%';
  `;
  try {
    const res = await pool.query(query);
    console.log("Functions found:", res.rows.length);
    res.rows.forEach(r => console.log(r.pg_get_functiondef));
  } catch (e) {
    console.error("DB Error:", e);
  } finally {
    pool.end();
  }
}

getTrigger();
