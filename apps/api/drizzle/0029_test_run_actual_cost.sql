-- Add actual cost tracking to test_run_log
ALTER TABLE "test_run_log" ADD COLUMN IF NOT EXISTS "actual_cost_cents" integer DEFAULT 0 NOT NULL;
