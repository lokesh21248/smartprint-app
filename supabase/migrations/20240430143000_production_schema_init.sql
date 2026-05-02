-- 1. Fix shops table
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_id TEXT;
-- We use DO NOTHING if the constraint exists (Postgres 11+)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_owner_id') THEN
    ALTER TABLE shops ADD CONSTRAINT unique_owner_id UNIQUE (owner_id);
  END IF;
END $$;

-- 2. Create webhook_jobs for queue
CREATE TABLE IF NOT EXISTS webhook_jobs (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_error TEXT
);

-- 3. Create worker_locks
CREATE TABLE IF NOT EXISTS worker_locks (
  id TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create job_logs
CREATE TABLE IF NOT EXISTS job_logs (
  id SERIAL PRIMARY KEY,
  job_id TEXT,
  event TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create High-Speed Index
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_high_speed
ON webhook_jobs (status, next_retry_at, created_at)
WHERE status IN ('pending', 'failed');

-- 6. Create RPC for atomic pickup
CREATE OR REPLACE FUNCTION pickup_webhook_jobs(limit_count int)
RETURNS SETOF webhook_jobs AS $func$
BEGIN
  RETURN QUERY
  UPDATE webhook_jobs
  SET status = 'processing', updated_at = NOW()
  WHERE id IN (
    SELECT id
    FROM webhook_jobs
    WHERE (status = 'pending' OR status = 'failed' OR (status = 'processing' AND updated_at < NOW() - interval '2 minutes'))
      AND retry_count < 5
      AND next_retry_at < NOW()
    ORDER BY created_at ASC
    LIMIT limit_count
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$func$ LANGUAGE plpgsql;
