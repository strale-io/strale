import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Phase 4 review round 1 — the invariants the design called structural but
 * enforced only in application code.
 *
 * An adversarial review drove every one of these transitions through the
 * database and they were all accepted. A rule that holds only when one module
 * is used is not a rule, so each is now a trigger or a constraint:
 *
 *  - `complete` and `failed` are ABSORBING. Once a row is chained, its receipt
 *    digest is anchored in the integrity hash — changing the state afterwards
 *    would rewrite an already-chained historical fact.
 *  - A `complete` row's receipt fields are frozen. The reviewer swapped a
 *    digest on a complete row, and rewrote version/canonicalization/algorithm
 *    to `fake.v9`/`NOPE`/`md5`; the existing CHECK only tested NOT NULL, so
 *    garbage passed.
 *  - Reason codes are a closed set. `'banana'` was accepted.
 *  - A snapshot's `subject_kind`/`subject_slug` duplicate values inside
 *    `snapshot` and could disagree with them.
 *  - TRUNCATE does not fire row-level DELETE triggers, so the "permanent"
 *    snapshot table could be emptied without error.
 */
export async function runMigration0108_receiptStateInvariants(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // ── Closed reason-code set ────────────────────────────────────────────────
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_reason_closed
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_reason_closed
      CHECK (
        receipt_failure_reason IS NULL
        OR receipt_failure_reason IN (
          'not_yet_built', 'unmapped_rail', 'missing_deploy_identity',
          'unresolvable_manifest', 'missing_subject', 'snapshot_write_failed',
          'canonicalization_error', 'internal_error'
        )
      )
      NOT VALID
  `);

  // A digest without its metadata cannot be recomputed; metadata that is not
  // the metadata we produce is worse than none, because it looks recomputable.
  await tx.execute(sql`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_receipt_metadata_known
  `);
  await tx.execute(sql`
    ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_metadata_known
      CHECK (
        (receipt_version IS NULL OR receipt_version = 'strale.execution.v1')
        AND (receipt_canonicalization IS NULL OR receipt_canonicalization = 'RFC8785')
        AND (receipt_digest_alg IS NULL OR receipt_digest_alg = 'sha256')
      )
      NOT VALID
  `);

  // ── Legal transitions, enforced ───────────────────────────────────────────
  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "transactions_receipt_state_transitions"()
    RETURNS trigger AS $$
    BEGIN
      -- THREE SEPARATE QUESTIONS, ASKED SEPARATELY.
      --
      -- The first version collapsed them into one early-return plus one
      -- terminal check, and that combination BLOCKED THE ONE LEGITIMATE
      -- WRITER. Adding integrity_payload_version to the compared columns
      -- (so it could not be flipped) collided with the chain worker writing
      -- exactly that column: the worker's UPDATE stopped taking the early
      -- return, fell through to the terminal check, and was refused — because
      -- that check tested OLD.receipt_status IN (...) rather than whether the
      -- status was CHANGING. The worker is not moving a terminal row; it is
      -- leaving it terminal while writing a different column.
      --
      -- The blast radius made it the worst defect of the review: the whole tick
      -- runs in one transaction, so the RAISE aborted it, every later statement
      -- failed, the per-row catch swallowed them, and the tick rolled back —
      -- so ONE receipt-bearing row would have halted the tamper-evident chain
      -- for every transaction in the system, permanently, retrying every 30s.
      -- /v1/verify would answer "no integrity hash" and /v1/audit would answer
      -- "still being computed" forever. Reviewer-found, and the entire repo
      -- suite was green while it was true.

      -- 1. Is the STATUS moving out of a terminal state?
      IF OLD.receipt_status IS DISTINCT FROM NEW.receipt_status
         AND OLD.receipt_status IN ('complete', 'failed') THEN
        RAISE EXCEPTION
          'receipt state % is terminal: transaction % cannot move to %. Once a row '
          'is chained its receipt digest is anchored in the integrity hash, so '
          'changing it would rewrite an already-chained fact.',
          OLD.receipt_status, OLD.id, COALESCE(NEW.receipt_status, 'NULL');
      END IF;

      -- 2. Are a terminal row's receipt FIELDS being rewritten?
      --
      -- receipt_manifest_digest is in this list because it is how a verifier
      -- finds the snapshot to recompute the implementation identity, and it is
      -- NOT inside the chain payload — so a swap would be neither refused here
      -- nor detectable there.
      IF OLD.receipt_status IN ('complete', 'failed')
         AND (OLD.receipt_digest           IS DISTINCT FROM NEW.receipt_digest
           OR OLD.receipt_version          IS DISTINCT FROM NEW.receipt_version
           OR OLD.receipt_canonicalization IS DISTINCT FROM NEW.receipt_canonicalization
           OR OLD.receipt_digest_alg       IS DISTINCT FROM NEW.receipt_digest_alg
           OR OLD.receipt_manifest_digest  IS DISTINCT FROM NEW.receipt_manifest_digest
           OR OLD.receipt_failure_reason   IS DISTINCT FROM NEW.receipt_failure_reason)
      THEN
        RAISE EXCEPTION
          'transaction % has a terminal receipt; its receipt fields are frozen.', OLD.id;
      END IF;

      -- 3. Is the chain version being CHANGED after it was set?
      --
      -- Write-once, not frozen-on-terminal: the worker sets it exactly once, in
      -- the same UPDATE as the hash. Setting it from NULL is that write; any
      -- later change is a rewrite of which rule hashed the row.
      IF OLD.integrity_payload_version IS NOT NULL
         AND NEW.integrity_payload_version IS DISTINCT FROM OLD.integrity_payload_version
      THEN
        RAISE EXCEPTION
          'transaction % already records integrity_payload_version %; the rule that '
          'hashed a row cannot be rewritten.', OLD.id, OLD.integrity_payload_version;
      END IF;

      -- A CHAINED row cannot acquire receipt state afterwards.
      --
      -- The dual of the admission rule. Barring a row from the chain until its
      -- receipt settles is only half the property: a row chained under v1 —
      -- which is every row today — could receive a complete receipt afterwards
      -- and keep its v1 hash, so the digest was never anchored. The row
      -- verifies, under a rule that does not cover the receipt.
      IF OLD.integrity_hash IS NOT NULL
         AND OLD.receipt_status IS NULL
         AND NEW.receipt_status IS NOT NULL THEN
        RAISE EXCEPTION
          'transaction % is already chained under v1; introducing receipt state '
          'now would leave its digest permanently unanchored.', OLD.id;
      END IF;

      -- Post-epoch state cannot be cleared back to looking pre-epoch.
      IF OLD.receipt_status IS NOT NULL AND NEW.receipt_status IS NULL THEN
        RAISE EXCEPTION
          'transaction % cannot clear its receipt status: a post-epoch row must '
          'not become indistinguishable from a pre-epoch one.', OLD.id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await tx.execute(sql`
    DROP TRIGGER IF EXISTS transactions_receipt_state_transitions_trg ON transactions
  `);
  await tx.execute(sql`
    CREATE TRIGGER transactions_receipt_state_transitions_trg
      BEFORE UPDATE ON transactions
      FOR EACH ROW EXECUTE FUNCTION "transactions_receipt_state_transitions"()
  `);

  // ── Snapshot subject metadata must agree with the hashed content ──────────
  //
  // The digest-to-content relation itself cannot be a CHECK — Postgres has no
  // RFC 8785 — so `readManifestSnapshot` recomputes before returning. What CAN
  // be enforced here is that the denormalized columns match the bytes.
  await tx.execute(sql`
    ALTER TABLE execution_manifest_snapshots
      DROP CONSTRAINT IF EXISTS execution_manifest_snapshots_subject_matches_content
  `);
  await tx.execute(sql`
    ALTER TABLE execution_manifest_snapshots
      ADD CONSTRAINT execution_manifest_snapshots_subject_matches_content
      -- The key-presence tests are load-bearing. A comparison against a
      -- missing key yields NULL, and a CHECK passes on NULL, so without them a
      -- snapshot carrying no subject keys at all was accepted under any slug.
      -- jsonb_exists is the function spelling of the ? operator, used because a
      -- bare ? in a driver template is asking for trouble.
      CHECK (
        jsonb_exists(snapshot, 'subject_kind')
        AND jsonb_exists(snapshot, 'slug')
        AND subject_kind = snapshot->>'subject_kind'
        AND subject_slug = snapshot->>'slug'
      )
      NOT VALID
  `);

  // ── TRUNCATE does not fire row-level DELETE triggers ──────────────────────
  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "execution_manifest_snapshots_no_truncate"()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION
        'execution_manifest_snapshots cannot be truncated: it is the only record '
        'of what a capability declared when a receipt was issued, and emptying it '
        'makes every receipt permanently unverifiable.';
    END;
    $$ LANGUAGE plpgsql
  `);
  await tx.execute(sql`
    DROP TRIGGER IF EXISTS execution_manifest_snapshots_no_truncate_trg
      ON execution_manifest_snapshots
  `);
  await tx.execute(sql`
    CREATE TRIGGER execution_manifest_snapshots_no_truncate_trg
      BEFORE TRUNCATE ON execution_manifest_snapshots
      FOR EACH STATEMENT EXECUTE FUNCTION "execution_manifest_snapshots_no_truncate"()
  `);

  // Verify every trigger this block depends on is present AND enabled.
  const trg = await tx.execute(sql`
    SELECT c.relname AS tbl, t.tgname, t.tgenabled
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal
       AND t.tgname IN ('transactions_receipt_state_transitions_trg',
                        'execution_manifest_snapshots_no_truncate_trg')
  `);
  const rows = trg as unknown as Array<{ tgname: string; tgenabled: string }>;
  const enabled = rows.filter((r) => r.tgenabled === 'O').map((r) => r.tgname);
  const missing = [
    "transactions_receipt_state_transitions_trg",
    "execution_manifest_snapshots_no_truncate_trg",
  ].filter((n) => !enabled.includes(n));
  if (missing.length > 0) {
    throw new Error(
      `receipt-state invariant triggers missing or disabled: ${missing.join(", ")} ` +
        `(found ${JSON.stringify(rows)}). Refusing to report success: without them, ` +
        "a completed receipt can be rewritten and the snapshot table can be emptied.",
    );
  }

  return {
    block: "0108_receipt_state_invariants",
    outcome:
      "transition trigger + TRUNCATE refusal + closed reason set + known receipt " +
      "metadata + snapshot subject/content agreement, all present and verified",
    duration_ms: Date.now() - startedAt,
  };
}
