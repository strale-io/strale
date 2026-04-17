-- Baseline invalidation trigger — enforces the "input change invalidates
-- baseline" invariant at the database level, as a defense-in-depth for any
-- code path that updates test_suites.input without explicitly clearing
-- baseline_output.
--
-- Background: fixture-mode tests replay baseline_output verbatim. If the
-- input is edited but the baseline isn't refreshed, the test keeps passing
-- by matching its own stale output — even when the new input would produce
-- different real results. This caused the invoice-validate "valid=false"
-- bug we hit on 2026-04-17.
--
-- The application-level fix lives in scripts/onboard.ts. This trigger is
-- insurance: any future code that forgets to clear baseline when updating
-- input will still be safe, because the DB will null the baseline for them
-- and force test_mode back to 'live' so the next run recaptures fresh data.

CREATE OR REPLACE FUNCTION invalidate_baseline_on_input_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when the input JSONB actually changes. Skip no-op updates.
  IF NEW.input IS DISTINCT FROM OLD.input THEN
    NEW.baseline_output := NULL;
    NEW.baseline_captured_at := NULL;
    -- Force live mode so the next test run re-executes against the new input.
    -- Without this, fixture-mode tests would keep "passing" with null
    -- baseline (runFixtureTest falls through to live only when baseline is
    -- null, so this is belt-and-suspenders).
    NEW.test_mode := 'live';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_invalidate_baseline_on_input_change ON test_suites;

CREATE TRIGGER tg_invalidate_baseline_on_input_change
BEFORE UPDATE ON test_suites
FOR EACH ROW
EXECUTE FUNCTION invalidate_baseline_on_input_change();
