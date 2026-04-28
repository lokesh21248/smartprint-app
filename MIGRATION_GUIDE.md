# SmartPrint Schema Migration & Setup Guide

## CRITICAL BREAKING CHANGES

This document outlines the migration from **Supabase Auth UUID-based** schema to **Clerk string-based** authentication schema.

### Key Differences

| Aspect | Old Schema | New Schema |
|--------|-----------|-----------|
| `shops.owner_id` | UUID FK to `auth.users(id)` | TEXT (Clerk user ID) |
| `shop_staff.user_id` | UUID FK to `auth.users(id)` | TEXT (Clerk user ID) |
| `orders.customer_id` | UUID FK to `auth.users(id)` | Removed (use only phone) |
| `orders.status` | lowercase (`placed`, `accepted`, etc) | UPPERCASE (`PLACED`, `ACCEPTED`, etc) |
| RLS Policies | ENABLED on all tables | **DISABLED** - security via Next.js API routes |
| Order Fields | `order_number`, `files`, `print_config` | `short_token`, `file_s3_key`, simple fields |

---

## Migration Steps

### 1. Backup Current Data (If Any)
```sql
-- Optional: Export current data before migration
\COPY shops TO '/tmp/shops_backup.csv' WITH CSV HEADER;
\COPY orders TO '/tmp/orders_backup.csv' WITH CSV HEADER;
```

### 2. Drop Old Tables (Destructive)
```sql
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS shop_staff CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS shops CASCADE;
DROP TABLE IF EXISTS otp_verifications CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP MATERIALIZED VIEW IF EXISTS analytics_daily CASCADE;
```

### 3. Apply New Schema
Run the SQL in `supabase/CLERK_SCHEMA.sql`:
- Creates tables with **TEXT** for Clerk user IDs
- Disables RLS on all tables
- Enables Realtime on orders table
- Adds partitioning for orders table

### 4. Update Environment Variables
Ensure your `.env.local` has:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...                    # MUST NOT expose to client
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_WEBHOOK_SECRET=...
OTP_JWT_SECRET=...
MSG91_AUTH_KEY=...
MSG91_TEMPLATE_ID=...
```

### 5. Deploy Setup Endpoint
Navigate to `GET /api/setup-db` to initialize schema automatically (if using the updated route).

---

## Code Changes Required

### 1. Type Definitions (`types/index.ts`)
- ✅ `OrderStatus` changed to uppercase (`DRAFT | PLACED | ACCEPTED | ...`)
- ✅ `Order.order_status` replaces `Order.status`
- ✅ `Order.page_count` replaces `Order.total_pages`
- ✅ `Order.file_s3_key` replaces `Order.files` array
- ✅ Removed `Order.customer_id` (phone-only approach)
- ✅ `Shop.owner_id` is now TEXT (Clerk)

### 2. API Routes
- ✅ `POST /api/orders` — creates guest orders
- ✅ `GET /api/orders?shortToken=XXX` — fetch order by tracking token
- ✅ `/api/auth/otp/send` — send OTP via MSG91
- ✅ `/api/auth/otp/verify` — verify OTP
- ✅ `/api/storage/upload` — upload PDF to Supabase Storage
- ✅ `/api/webhooks/clerk` — Clerk webhook (updated for TEXT IDs)

### 3. Pages
- ✅ `/s/[slug]` — guest QR landing page (NEW)
- ✅ `/order-upload` — order form with PDF upload + OTP + submission
- ✅ `/order/[shortToken]` — guest order tracking
- ✅ `/(dashboard)/orders` — admin order list with real-time alerts
- ✅ `/(dashboard)/analytics` — revenue + metrics dashboard
- ✅ `/(dashboard)/staff` — staff management
- ✅ `/(dashboard)/shop-profile` — shop settings
- ✅ `/admin/*` — super-admin infrastructure (NEW)

### 4. Components
- ✅ Real-time order alerts + audio alarm (`lib/hooks/useRealtimeOrders`)
- ✅ Order card display
- ✅ Order status update buttons
- ✅ PDF preview
- ✅ Admin Overview + Shop Management

### 5. Utilities
- ✅ `lib/utils/pricing.ts` — total calculation
- ✅ `lib/utils/index.ts` — status labels, colors (updated for uppercase)
- ✅ `lib/otp.ts` — OTP send/verify (basic, not yet bcrypt)
- ✅ Super Admin route protection
- ⏳ Rate limiting (Upstash Redis)
- ⏳ ClamAV integration

---

## Testing Checklist

### Guest Flow
- [ ] Navigate to `/s/shop-slug` → shop landing page loads
- [ ] Click "Upload PDF" → file selector appears
- [ ] Upload a PDF → page count extracted correctly
- [ ] Adjust options (copies, color, double-sided) → price recalculates
- [ ] Enter name + phone → "Send OTP" available
- [ ] OTP arrives via SMS → enter it → "Verify" → enables "Place Order"
- [ ] Click "Place Order" → order created, redirects to `/order/[shortToken]`

### Guest Tracking
- [ ] Bookmark `/order/[shortToken]` → status badge shows "DRAFT" then "PLACED"
- [ ] Realtime updates work → status changes appear instantly (no refresh needed)

### Admin Flow
- [ ] Login as shop owner → `/orders` page loads
- [ ] New order placed by guest → audio alarm plays within 5 seconds
- [ ] Page flashes + tab title updates
- [ ] Toast notification appears
- [ ] New order card prepended to list
- [ ] Click "Accept" → order status changes to "ACCEPTED"
- [ ] Status is reflected in guest tracking page in real-time

### Analytics
- [ ] `/analytics` loads charts (daily orders, revenue, B&W vs Color split)
- [ ] Charts update as orders complete

---

## Known Limitations (v1)

- OTP is not bcrypt-hashed (stored plaintext in DB)
- No rate limiting via Upstash yet
- No ClamAV virus scanning yet
- No automatic file cleanup after 24h
- No cron job for order timeouts
- No Sentry error tracking yet
- Analytics view not yet updated

---

## Database Schema Summary

### shops
- `id` (UUID) — primary key
- `owner_id` (TEXT) — Clerk User ID
- `slug` (TEXT UNIQUE) — used in `/s/{slug}`
- `price_bw_per_page`, `price_color_per_page` (DECIMAL)
- `is_open`, `is_approved` (BOOLEAN)

### orders
- `id` (UUID) — primary key
- `short_token` (TEXT UNIQUE) — used in `/order/{token}`
- `shop_id` (UUID FK)
- `customer_name`, `customer_phone` (TEXT)
- `page_count`, `copies` (INTEGER)
- `color`, `double_sided` (BOOLEAN)
- `total_amount` (DECIMAL)
- `order_status` (TEXT) — `DRAFT|PLACED|ACCEPTED|PRINTING|READY|COMPLETED|CANCELLED`

### otp_verifications
- `phone` (TEXT)
- `code_hash` (TEXT) — OTP (plaintext for now, should be bcrypt)
- `expires_at` (TIMESTAMPTZ) — 5 minutes
- `verified` (BOOLEAN)

### shop_staff
- `user_id` (TEXT) — Clerk User ID
- `shop_id` (UUID FK)
- `role` (TEXT) — `owner|manager|staff`

---

## Deployment Checklist

- [ ] Database schema migrated to `CLERK_SCHEMA.sql`
- [ ] `check:admin-leak` script passes (Service Role Key not in client bundle)
- [ ] All env vars set in Vercel
- [ ] Clerk webhook configured to `POST /api/webhooks/clerk`
- [ ] Supabase Realtime enabled for `orders` table
- [ ] Test end-to-end order flow (guest → admin)
- [ ] Monitor Sentry for errors in first 24h

---

## Files Modified

- `supabase/CLERK_SCHEMA.sql` — NEW schema
- `app/api/setup-db/route.ts` — schema initialization
- `app/api/webhooks/clerk/route.ts` — fixed for TEXT IDs
- `app/api/orders/route.ts` — guest order creation
- `app/s/[slug]/page.tsx` — NEW guest QR landing
- `app/order-upload/page.tsx` — NEW order form
- `app/order/[shortToken]/page.tsx` — fixed for new schema
- `types/index.ts` — updated Order, Shop types
- `lib/utils/index.ts` — status helpers updated
- `lib/hooks/useRealtimeOrders.ts` — fixed field references

---

## Support & Debugging

If migrations fail:
1. Check service role key validity
2. Ensure tables don't already exist
3. Check Supabase logs for SQL errors
4. Drop tables and retry

If real-time doesn't work:
1. Verify `ALTER PUBLICATION supabase_realtime ADD TABLE orders`
2. Check browser console for WebSocket errors
3. Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
