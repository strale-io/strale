-- Pipeline Fix: Safe column defaults + degraded recovery counter
-- Fixes lifecycle_state and visible defaults so new capabilities bypass the pipeline.
-- Adds degraded_recovery_count to enforce 3 consecutive qualifying runs before recovery.

-- Fix DEFAULT for lifecycle_state: new capabilities start in draft (not active)
ALTER TABLE capabilities ALTER COLUMN lifecycle_state SET DEFAULT 'draft';

-- Fix DEFAULT for visible: new capabilities are hidden until promoted to active/degraded
ALTER TABLE capabilities ALTER COLUMN visible SET DEFAULT false;

-- Add degraded_recovery_count: tracks consecutive qualifying SQS runs while in degraded state.
-- Resets to 0 on any state transition or non-qualifying evaluation.
-- When it reaches 3 (DEGRADED_RECOVERY_RUNS), degraded → active is applied.
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS degraded_recovery_count INTEGER NOT NULL DEFAULT 0;
