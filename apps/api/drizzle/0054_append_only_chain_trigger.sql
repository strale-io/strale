-- World-class gap #2 (CTO audit): append-only DB enforcement on the chain.
--
-- Pre-fix: integrity_hash and previous_hash were ordinary columns. Any
-- code path with UPDATE rights on transactions could rewrite chain links
-- after the fact. This was code-discipline only; the schema didn't
-- prevent insider-threat or accidental mutation. F-AUDIT-X: the worker
-- writes hashes once (compliance_hash_state pending → complete) and
-- nothing should ever rewrite them.
--
-- Fix: a BEFORE UPDATE trigger that REJECTS any update which changes
-- integrity_hash or previous_hash once compliance_hash_state has reached
-- 'complete'. The 'pending' / 'deferred' / 'unhashed_legacy' states all
-- still allow legitimate writes (worker filling in the hash; legacy
-- migration; etc.). Only the post-finalisation rewrite is blocked.
--
-- This is the single most defensive-leverage line of code in the
-- platform's tamper-evidence story. Insider rewrites of finalised
-- chain rows now fail loudly at the database boundary, not in
-- application code that could be bypassed.
--
-- Soft-delete (GDPR Art. 17) and retention purge are explicitly
-- compatible: both ZERO content columns but PRESERVE integrity_hash
-- and previous_hash. The trigger fires only when the hash itself
-- would change.

CREATE OR REPLACE FUNCTION strale_chain_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Pre-finalisation states allow free writes — the worker is still
  -- chaining the row, or the row is a pre-chain legacy artefact.
  IF OLD.compliance_hash_state IN ('pending', 'deferred', 'unhashed_legacy', 'failed') THEN
    RETURN NEW;
  END IF;

  -- Once 'complete', the chain link is sealed. Reject any mutation of
  -- the hash columns. NULL → non-NULL transitions are also blocked
  -- because by definition state='complete' means the hash is set.
  IF OLD.compliance_hash_state = 'complete' THEN
    IF NEW.integrity_hash IS DISTINCT FROM OLD.integrity_hash THEN
      RAISE EXCEPTION
        'integrity_hash is append-only after compliance_hash_state=''complete'' (transaction %); attempted change from % to %',
        OLD.id, OLD.integrity_hash, NEW.integrity_hash
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.previous_hash IS DISTINCT FROM OLD.previous_hash THEN
      RAISE EXCEPTION
        'previous_hash is append-only after compliance_hash_state=''complete'' (transaction %); attempted change from % to %',
        OLD.id, OLD.previous_hash, NEW.previous_hash
        USING ERRCODE = 'check_violation';
    END IF;
    -- Demoting away from 'complete' would let a subsequent UPDATE rewrite
    -- the hash by going through the pre-finalisation branch above. Block.
    IF NEW.compliance_hash_state IS DISTINCT FROM OLD.compliance_hash_state THEN
      RAISE EXCEPTION
        'compliance_hash_state cannot transition out of ''complete'' (transaction %); attempted change to %',
        OLD.id, NEW.compliance_hash_state
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS strale_chain_append_only_trigger ON transactions;

CREATE TRIGGER strale_chain_append_only_trigger
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION strale_chain_append_only();
