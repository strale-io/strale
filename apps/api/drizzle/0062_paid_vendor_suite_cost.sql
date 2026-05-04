-- Set external_cost_cents on confirmed paid-vendor test suites per the
-- 2026-05-04 paid-vendor audit. The scheduler skips suites where
-- external_cost_cents > 0 (PR #46, DEC-20260503-B) — this stops the
-- bleed on Dilisense, eSortcode, and Anthropic Sonnet calls that were
-- being run hourly with external_cost_cents = 0.
--
-- Number gap: this migration claims 0062 to leave 0060 + 0061 free for
-- the open feat/marketplace-eligible-flag (PR #42) and
-- feat/retire-solutions-and-web3-assurance (PR #45) branches. The
-- migration-prefix lint catches collisions; using a higher number now
-- avoids forcing those PRs to renumber when they merge.
--
-- Scope (intentionally tight per the audit-followup decision):
--   - 4 paid vendors, per-call billing, confirmed via executor source:
--     pep-check / sanctions-check / adverse-media-check (Dilisense),
--     uk-cop-check (eSortcode) → external_cost_cents = 1.
--     Any non-zero value excludes the suite from the hourly scheduler;
--     1 cent is the minimum signal that "this costs money."
--   - risk-narrative-generate (Anthropic Sonnet 4.6, max_tokens 1500)
--     → external_cost_cents = 3. Conservative upper bound: 4K input
--     × $3/MTok + 1500 output × $15/MTok ≈ $0.034 ≈ €0.031.
--
-- Filter (so the migration is idempotent + doesn't clobber):
--   - active = true (don't touch parked suites)
--   - test_mode = 'live' (skip 'fixture' = saved data; skip 'canary'
--     = existing non-zero values preserved)
--   - test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
--     — these run the executor against the upstream
--   - external_cost_cents = 0 — only correct rows that haven't been
--     manually adjusted; idempotent on re-run
--
-- Excludes by design (zero-cost-by-design test types stay at 0):
--   - schema_check (dry-run mode, no API call)
--   - dependency_health (zero-cost auth-less probe per
--     CLAUDE.md Principle A — skipAuth: true on probe means a 401
--     proves connectivity without consuming quota)
--   - piggyback (not scheduled; populated by customer traffic)
--
-- Expected updated rows: 22 (16 Dilisense/eSortcode + 6 Sonnet).
-- Verification at end of file.

UPDATE test_suites
SET external_cost_cents = 1, updated_at = NOW()
WHERE capability_slug IN ('pep-check', 'sanctions-check', 'adverse-media-check', 'uk-cop-check')
  AND active = true
  AND test_mode = 'live'
  AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
  AND external_cost_cents = 0;

UPDATE test_suites
SET external_cost_cents = 3, updated_at = NOW()
WHERE capability_slug = 'risk-narrative-generate'
  AND active = true
  AND test_mode = 'live'
  AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
  AND external_cost_cents = 0;

-- Post-condition assertion: every targeted slug should have
-- external_cost_cents > 0 on every active live non-probe suite.
-- Failing this check after the migration completed indicates a
-- new suite landed at cost=0 between the audit and the apply,
-- or a column rename, or an unintended UPDATE elsewhere. The
-- assertion fails the migration with a clear message rather
-- than letting the suite quietly bleed.
DO $$
DECLARE
  remaining_zero INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_zero
  FROM test_suites
  WHERE capability_slug IN (
          'pep-check', 'sanctions-check', 'adverse-media-check',
          'uk-cop-check', 'risk-narrative-generate'
        )
    AND active = true
    AND test_mode = 'live'
    AND test_type IN ('known_answer', 'edge_case', 'negative', 'known_bad')
    AND external_cost_cents = 0;

  IF remaining_zero > 0 THEN
    RAISE EXCEPTION 'Post-migration check failed: % paid-vendor suites still have external_cost_cents = 0', remaining_zero;
  END IF;
END $$;
