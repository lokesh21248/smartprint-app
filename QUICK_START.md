# SmartPrint Quick Start Guide

## 1. Install Dependencies

After the refactor, install new packages:

```bash
npm install
```

Key new dependencies added:
- `pdfjs-dist` — for PDF page count extraction in browser

## 2. Setup Supabase Database

### Option A: Auto-setup via API
1. Ensure env vars are set (SUPABASE_URL, SERVICE_ROLE_KEY)
2. Navigate to `http://localhost:3000/api/setup-db`
3. Check response for success

### Option B: Manual setup
1. Go to Supabase SQL Editor
2. Copy all SQL from `supabase/CLERK_SCHEMA.sql`
3. Run it
4. Verify tables exist and Realtime is enabled on `orders` table

## 3. Configure Clerk

1. Go to Clerk Dashboard → Webhooks
2. Create webhook for `http://yourdomain.com/api/webhooks/clerk`
3. Subscribe to events:
   - `user.created`
   - `user.updated`
4. Copy webhook secret to `CLERK_WEBHOOK_SECRET` env var

## 4. Setup Supabase Storage

1. Go to Supabase → Storage
2. Create bucket: `order-files`
3. Set to PRIVATE (no public access)
4. Create folder inside: `orders/`

## 5. Test the Guest Flow

```bash
npm run dev
```

Then:

1. **Create a shop:** Sign up as a shop owner in Clerk
   - Should auto-create shop with auto-generated slug
   - Check Supabase `shops` table for new entry
   - Copy the `slug` value

2. **Access QR page:** Go to `/s/{slug}`
   - Should show shop name, pricing, "Upload PDF" button
   - Try uploading a PDF
   - Should extract page count

3. **Complete order:** 
   - Enter print options
   - Enter your name + phone (test: `9999999999`)
   - Click "Send OTP" → OTP is logged to console
   - Enter OTP: `123456` (test bypass for 9999999999)
   - Click "Verify OTP"
   - Click "Place Order"
   - Should redirect to `/order/[shortToken]`

4. **Admin sees order:**
   - Login as shop owner → go to `/orders`
   - New order should appear with audio alarm
   - Real-time updates should work

## 6. Environment Variables Checklist

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          ⚠️  NEVER expose to client

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_WEBHOOK_SECRET=...

# OTP/SMS (optional for testing)
MSG91_AUTH_KEY=...
MSG91_TEMPLATE_ID=...

# Security (optional)
OTP_JWT_SECRET=...
```

## 7. Troubleshooting

### "Cannot find module 'pdfjs-dist'"
- Run `npm install` again
- Clear `.next` folder: `rm -rf .next`
- Restart dev server

### "Service Role Key leak detected"
- Run: `npm run check:admin-leak`
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is NOT in client code

### Orders not appearing real-time
- Check browser console for WebSocket errors
- Verify `ALTER PUBLICATION supabase_realtime ADD TABLE orders` ran
- Check Supabase Realtime is enabled in project settings

### SMS not sending
- Check MSG91 API key is correct
- Verify phone number format (10 digits, starts 6-9)
- Check MSG91 template ID exists

## 8. Next Features to Build (v1.1)

- [ ] OTP hashing (bcrypt)
- [ ] Rate limiting (Upstash Redis)
- [ ] ClamAV virus scanning
- [ ] Auto file cleanup after 24h
- [ ] Order timeout cron job
- [ ] Analytics dashboard charts
- [ ] Staff management UI
- [ ] Order status update buttons
- [ ] PDF preview in order card

## 9. Production Deployment Checklist

- [ ] All env vars set in Vercel
- [ ] Database backed up
- [ ] `check:admin-leak` passes
- [ ] End-to-end test on staging
- [ ] Monitor Sentry dashboard day 1
- [ ] Enable CORS if needed for cross-domain requests
- [ ] Setup Upstash Redis for rate limiting
- [ ] Configure ClamAV endpoint
- [ ] Test with real SMS (MSG91)

## Quick Commands

```bash
# Dev
npm run dev

# Type check
npm run lint

# Check for Service Role Key leaks
npm run check:admin-leak

# Build for production
npm run build

# Start production server
npm run start
```

## Database Quick Ref

```sql
-- Check shops
SELECT id, name, slug, owner_id, is_open FROM shops LIMIT 5;

-- Check orders
SELECT id, short_token, customer_name, order_status, created_at FROM orders ORDER BY created_at DESC LIMIT 10;

-- Check OTP
SELECT phone, code_hash, expires_at, verified FROM otp_verifications WHERE phone = '9999999999' ORDER BY created_at DESC;
```

---

**Status:** MVP Complete ✅  
**Last Updated:** 2026-04-28  
**Author:** SmartPrint Dev Team
