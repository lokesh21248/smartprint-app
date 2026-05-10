-- ============================================================
-- SmartPrint: PRODUCTION OBSERVABILITY & MONITORING
-- ============================================================
-- Run these queries periodically to monitor database health.
-- All queries are READ-ONLY.
-- ============================================================


-- ─── SECTION 1: SLOW QUERY INSPECTION ────────────────────────────────────────
-- Identifies queries taking the most cumulative time.
-- Requires `pg_stat_statements` extension (enabled by default in Supabase).

SELECT
  substring(query, 1, 100) AS query_snippet,
  calls,
  total_exec_time / 1000   AS total_time_seconds,
  mean_exec_time           AS avg_time_ms,
  rows                     AS total_rows_returned
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 10;


-- ─── SECTION 2: DISK & BLOAT MONITORING ──────────────────────────────────────

-- 2a. Total database size
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

-- 2b. Table and Index size breakdown
SELECT
  relname                                     AS table_name,
  pg_size_pretty(pg_total_relation_size(oid)) AS total_size,
  pg_size_pretty(pg_relation_size(oid))       AS table_size,
  pg_size_pretty(pg_total_relation_size(oid) - pg_relation_size(oid)) AS index_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY pg_total_relation_size(oid) DESC;


-- ─── SECTION 3: TRANSACTION LOG (WAL) MONITORING ────────────────────────────
-- High write volume can bloat the WAL. Monitor current write activity.

SELECT
  pg_size_pretty(pg_current_wal_lsn() - '0/0'::pg_lsn) AS total_wal_ever,
  CASE WHEN pg_is_in_recovery() THEN 'REPLICA' ELSE 'PRIMARY' END AS node_role;


-- ─── SECTION 4: PARTITION HEALTH ─────────────────────────────────────────────
-- Ensure the orders table partitions are balanced and future ones exist.

SELECT
  child.relname                                AS partition_name,
  pg_size_pretty(pg_relation_size(child.oid)) AS size,
  reltuples::bigint                            AS row_estimate
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
WHERE parent.relname = 'orders'
ORDER BY child.relname;


-- ─── SECTION 5: REAL-TIME CONCURRENCY ───────────────────────────────────────
-- See currently active connections and their state.

SELECT
  count(*) AS total_connections,
  count(*) FILTER (WHERE state = 'active')   AS active,
  count(*) FILTER (WHERE state = 'idle')     AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction
FROM pg_stat_activity
WHERE backend_type = 'client backend';
