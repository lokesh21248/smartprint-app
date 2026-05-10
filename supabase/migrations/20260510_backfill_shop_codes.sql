-- =============================================================================
-- Migration: Backfill slug for existing shops that have NULL/empty slugs.
-- Run ONCE in your Supabase SQL Editor.
-- Idempotent: WHERE filter ensures only rows missing a slug are updated.
-- =============================================================================

-- Step 1: Backfill slug from shop name using the same rules as the app:
--   - lowercase
--   - spaces → hyphens
--   - remove special characters
--   - collapse duplicate hyphens
--   - max 60 characters
UPDATE shops
SET slug = lower(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        trim(name),
        '[^a-zA-Z0-9\s-]', '', 'g'   -- remove special chars
      ),
      '\s+', '-', 'g'                  -- spaces → hyphens
    ),
    '-+', '-', 'g'                     -- collapse duplicate hyphens
  )
)
WHERE slug IS NULL OR slug = '';

-- Step 2: If any two shops ended up with the same slug after the above,
-- append their short_id suffix to resolve collisions.
-- (This is rare — only happens if two shops have identical names.)
UPDATE shops s
SET slug = s.slug || '-' || substring(s.id::text, 1, 4)
WHERE s.id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at ASC) AS rn
    FROM shops
    WHERE slug IS NOT NULL AND slug != ''
  ) ranked
  WHERE rn > 1
);

-- Step 3: Ensure a unique index on slug to prevent future duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_slug_unique ON shops(slug)
WHERE slug IS NOT NULL AND slug != '';

-- Verification query — shows all shops with their slugs:
SELECT id, name, slug, shop_code, created_at
FROM shops
ORDER BY created_at DESC;
