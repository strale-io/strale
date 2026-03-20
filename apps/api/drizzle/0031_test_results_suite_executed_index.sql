-- Composite index for getTestResultsForSlug N+1 queries.
-- Each query does: WHERE test_suite_id = $1 ORDER BY executed_at DESC LIMIT 1
-- Without this index, PostgreSQL sorts the full result set per query.
CREATE INDEX IF NOT EXISTS "test_results_suite_executed_idx"
  ON "test_results" ("test_suite_id", "executed_at" DESC);
