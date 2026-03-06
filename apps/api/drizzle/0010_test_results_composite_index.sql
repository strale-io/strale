-- Composite index for test runs queries that group by capability_slug + executed_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS test_results_slug_executed_idx
  ON test_results (capability_slug, executed_at DESC);
