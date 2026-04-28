import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
    }

    const STATEMENTS = [
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
      
      `CREATE TABLE IF NOT EXISTS shops (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        owner_id TEXT NOT NULL,
        owner_email TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        lat DECIMAL(10, 8),
        lng DECIMAL(11, 8),
        price_bw_per_page DECIMAL(6, 2) NOT NULL DEFAULT 1.00,
        price_color_per_page DECIMAL(6, 2) NOT NULL DEFAULT 5.00,
        opening_time TIME,
        closing_time TIME,
        working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'],
        services TEXT[],
        is_approved BOOLEAN DEFAULT false,
        is_open BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )`,
      
      `CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        short_token TEXT UNIQUE NOT NULL,
        shop_id UUID REFERENCES shops(id) NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_phone_verified BOOLEAN DEFAULT false,
        file_s3_key TEXT NOT NULL,
        file_name TEXT,
        page_count INTEGER NOT NULL,
        copies INTEGER NOT NULL DEFAULT 1,
        color BOOLEAN NOT NULL DEFAULT false,
        double_sided BOOLEAN NOT NULL DEFAULT false,
        notes TEXT,
        total_amount DECIMAL(8, 2) NOT NULL,
        order_status TEXT NOT NULL DEFAULT 'DRAFT',
        status_history JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )`,
      
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS short_token TEXT`,
      
      `CREATE TABLE IF NOT EXISTS otp_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INT DEFAULT 0,
        verified BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      `CREATE TABLE IF NOT EXISTS shop_staff (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id UUID REFERENCES shops(id) NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
        invited_at TIMESTAMPTZ DEFAULT now(),
        accepted_at TIMESTAMPTZ,
        UNIQUE(shop_id, user_id)
      )`,

      `CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        shop_id UUID REFERENCES shops(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )`,

      `CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        customer_id UUID REFERENCES auth.users(id),
        shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
        rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      `ALTER TABLE shops DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE orders DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE shop_staff DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE notifications DISABLE ROW LEVEL SECURITY`,
      `ALTER TABLE otp_verifications DISABLE ROW LEVEL SECURITY`,
      
      `ALTER PUBLICATION supabase_realtime ADD TABLE orders`
    ];

    let success = 0;
    let failed = 0;
    const errors: any[] = [];

    for (const sql of STATEMENTS) {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Prefer": "params=single-object",
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!resp.ok && resp.status !== 404 && resp.status !== 405) {
        const text = await resp.text();
        if (!text.includes("already exists") && !text.includes("does not exist")) {
          failed++;
          errors.push({ sql, error: text });
          continue;
        }
      }
      
      // Fallback for 404/405
      if (resp.status === 404 || resp.status === 405) {
        const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
        const mgmtUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
        const mgmt = await fetch(mgmtUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ query: sql }),
        });
        
        if (!mgmt.ok) {
           const text = await mgmt.text();
           if (!text.includes("already exists") && !text.includes("does not exist")) {
              failed++;
              errors.push({ sql, error: text });
              continue;
           }
        }
      }
      success++;
    }

    return NextResponse.json({
      success: true,
      message: `Schema setup complete: ${success} OK, ${failed} Failed`,
      errors
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
