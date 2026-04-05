-- Phase 1.4: Allow transactions table to record solution executions
-- Part of DEC-20260405-A fix plan

-- Drop NOT NULL on capability_id so solution rows can have it null
ALTER TABLE transactions ALTER COLUMN capability_id DROP NOT NULL;

-- Add solution_slug column for solution-level transaction records
ALTER TABLE transactions ADD COLUMN solution_slug text;

-- XOR constraint: exactly one of capability_id or solution_slug must be set
ALTER TABLE transactions ADD CONSTRAINT transactions_exactly_one_target
  CHECK ((capability_id IS NOT NULL) != (solution_slug IS NOT NULL));

-- Index for digest/admin queries on solution executions
CREATE INDEX transactions_solution_slug_idx ON transactions (solution_slug) WHERE solution_slug IS NOT NULL;
