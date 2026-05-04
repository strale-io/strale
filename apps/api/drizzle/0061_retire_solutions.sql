-- Retire solutions per DEC-20260503-A 2026-05-04. Public surface gone;
-- composition tech (lib/solution-executor.ts, gate4b-solution-dryrun.ts,
-- validateSolution) retained for any future bundled-product module.
--
-- Strategy: archive both tables into _archived_2026_05_04 sibling tables
-- (preserves every column + adds archived_at), then truncate the live
-- tables. CASCADE on TRUNCATE solutions handles solution_steps via the
-- existing FK ON DELETE CASCADE, but archiving solution_steps separately
-- means the archive captures the full state independently of cascade
-- semantics.
--
-- Schemas of the live `solutions` and `solution_steps` tables are RETAINED
-- because internal admin/debug routes (/v1/internal/trust/solutions/*,
-- /v1/internal/tests/solutions/*, /v1/internal/quality/solutions/*,
-- /v1/admin/create-solution, etc.) still reference them. Drop the schemas
-- in a future migration once those routes are also retired.
--
-- Reversibility:
--   INSERT INTO solutions SELECT id, slug, name, description, long_description,
--     agent_description, category, price_cents, component_sum_cents, value_tier,
--     maintenance_level, geography, input_schema, example_input, example_output,
--     target_audience, marketing_name, transparency_tag, extends_with,
--     compliance_coverage, is_active, display_order, search_tags, x402_enabled,
--     created_at, updated_at FROM solutions_archived_2026_05_04;
--   INSERT INTO solution_steps SELECT id, solution_id, capability_slug, step_order,
--     can_parallel, parallel_group, input_map, created_at
--     FROM solution_steps_archived_2026_05_04;

-- 1. Archive solutions rows (115 rows expected; pre-flight 2026-05-04).
CREATE TABLE IF NOT EXISTS solutions_archived_2026_05_04 AS
  SELECT *, NOW() AS archived_at FROM solutions;

-- 2. Archive solution_steps rows (892 rows expected; pre-flight 2026-05-04).
CREATE TABLE IF NOT EXISTS solution_steps_archived_2026_05_04 AS
  SELECT *, NOW() AS archived_at FROM solution_steps;

-- 3. Truncate live tables. CASCADE drops solution_steps rows via the
-- existing solution_steps.solution_id ON DELETE CASCADE FK, but listing
-- both explicitly keeps intent obvious.
TRUNCATE TABLE solutions CASCADE;
TRUNCATE TABLE solution_steps;
