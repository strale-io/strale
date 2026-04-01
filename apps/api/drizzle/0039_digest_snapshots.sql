CREATE TABLE IF NOT EXISTS digest_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
