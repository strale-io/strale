-- DEC-20260423-B Stage B.2: structural gate preventing direct INSERT INTO capabilities.
--
-- Before this trigger, any code path could insert into capabilities directly,
-- bypassing persistCapability and its post-commit hook (onCapabilityCreated).
-- The hook wires Gate 1/3 validation, test_suite generation, transparency_tag
-- detection, and readiness checks. Bypassing it shipped 34 capabilities with
-- NULL output_field_reliability and 30 with zero capability_limitations —
-- see C:\tmp\dec-20260320-b-audit.md.
--
-- Design:
--   - persistCapability sets a transaction-local GUC `strale.capability_insert_token`
--     to 'persistCapability' before running INSERT statements.
--   - This trigger fires BEFORE INSERT ON capabilities and raises an exception
--     if the GUC is unset or has the wrong value.
--   - The GUC is set with `is_local = true` so it auto-resets at COMMIT or
--     ROLLBACK — it cannot leak across transactions or across connections.
--
-- Emergency bypass (for operator debugging, intentional):
--   BEGIN;
--   SELECT set_config('strale.capability_insert_token', 'persistCapability', true);
--   INSERT INTO capabilities (...) VALUES (...);
--   COMMIT;
-- The bypass is visible (explicit SQL, logged), not accidental.
--
-- Rollback: DROP TRIGGER capability_insert_guard ON capabilities; DROP FUNCTION check_capability_insert_guard.

CREATE OR REPLACE FUNCTION check_capability_insert_guard() RETURNS trigger AS $$
BEGIN
  IF current_setting('strale.capability_insert_token', true) IS DISTINCT FROM 'persistCapability' THEN
    RAISE EXCEPTION 'Direct INSERT INTO capabilities is blocked. Use persistCapability() [DEC-20260423-B Stage B.2]. Emergency bypass: SELECT set_config(''strale.capability_insert_token'', ''persistCapability'', true) inside a transaction.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS capability_insert_guard ON capabilities;
CREATE TRIGGER capability_insert_guard
  BEFORE INSERT ON capabilities
  FOR EACH ROW
  EXECUTE FUNCTION check_capability_insert_guard();
