-- Backfill shop_code and slug for all existing shops that were created
-- before the QR generation fix (2026-05-10).
-- Safe to run multiple times (idempotent via WHERE filters).

-- Step 1: Backfill shop_code with a random 6-char code for shops missing one.
-- Uses Postgres string functions to generate random codes without PL/pgSQL.
UPDATE shops
SET shop_code = upper(
  substring(
    translate(
      encode(gen_random_bytes(6), 'base64'),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789ABCDEFGHJKLMNPQRSTUVWXYZ2345678'
    ),
    1, 6
  )
)
WHERE shop_code IS NULL OR shop_code = '';

-- Step 2: Backfill slug for shops missing one, derived from name + shop_code.
UPDATE shops
SET slug = lower(
  regexp_replace(
    regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'),
    '^-+|-+$', '', 'g'
  ) || '-' || lower(shop_code)
)
WHERE (slug IS NULL OR slug = '') AND shop_code IS NOT NULL;

-- Verify the result
SELECT id, name, shop_code, slug FROM shops ORDER BY created_at DESC LIMIT 10;
