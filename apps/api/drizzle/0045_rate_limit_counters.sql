-- F-0-002: DB-backed rate-limit counters for abuse-class endpoints
-- (signup, register, recover). In-memory counters (lib/rate-limit.ts) reset
-- on every Railway restart, which defeats day-scale limits like
-- "1 signup per IP per day". This table persists across restarts.
--
-- Shape: (bucket_key, window_start) composite PK. One row per
-- (endpoint:identifier, window) tuple. Atomic increment via INSERT ... ON
-- CONFLICT DO UPDATE.

CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
  "bucket_key" text NOT NULL,
  "window_start" timestamptz NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("bucket_key", "window_start")
);

-- Prune old rows quickly: db-retention job will DELETE WHERE window_start <
-- NOW() - INTERVAL 'N days'. An index on window_start makes that cheap.
CREATE INDEX IF NOT EXISTS "rate_limit_counters_window_idx"
  ON "rate_limit_counters" ("window_start");
