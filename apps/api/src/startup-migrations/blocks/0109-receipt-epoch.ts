import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0109 - the receipt epoch, made structural.
 *
 * Phase 4 shipped every receipt artifact and then said, in its own
 * reconciliation, that the epoch was NOT structurally real: a transaction
 * inserted afterwards was byte-identical to one from April, because
 * `chain_v2_has_receipt_state` only constrains rows that DECLARE v2 and no row
 * declared anything. This block closes that, and it is the reason Phase 5 can
 * wire every rail at once instead of one at a time.
 *
 * Two statements do the work:
 *
 *  1. `receipt_status` gets a DEFAULT of `pending`. Every insert into
 *     `transactions` - from the four executors in `routes/do.ts`, from
 *     `solution-execute.ts`, from `x402-gateway-v2.ts`, from the internal
 *     harness, from the settlement reconciler, and from any site written after
 *     this one - now starts with receipt state whether or not its author
 *     thought about receipts. This is the property no amount of call-site
 *     wiring can give you: a rail nobody wired produces a VISIBLE `pending`
 *     row that the sweeper picks up and the backlog counter reports, instead
 *     of a silent NULL that looks exactly like a pre-epoch row.
 *
 *  2. A CHECK that a post-epoch row cannot have a NULL status. `NOT VALID`, so
 *     the 921k existing rows are not scanned at boot; they are all pre-epoch
 *     and exempt by the `created_at` test regardless.
 *
 * ## Where the epoch instant comes from
 *
 * `now()` at the moment this block first runs, baked into the constraint text
 * as a literal. The constraint is therefore the single, immutable record of
 * when enforcement began - there is no second copy in a table to drift from
 * it, and re-running this block is a no-op because the constraint already
 * exists.
 *
 * The race that looks like a problem is not one. `ALTER TABLE` takes ACCESS
 * EXCLUSIVE, so a concurrent insert either committed before the lock was
 * granted - giving it a `created_at` earlier than `now()`, hence exempt - or
 * blocks until this transaction commits and then picks up the DEFAULT. There
 * is no interleaving that produces a post-epoch row with a NULL status.
 *
 * ## The foreign key
 *
 * `transactions.receipt_manifest_digest` now references
 * `execution_manifest_snapshots(digest)`. Phase 4 listed its absence as
 * residual risk 6 and left the decision open; the decision is to add it, on
 * these grounds:
 *
 *  - The referent is guaranteed to exist by construction: `settle.ts` records
 *    the snapshot BEFORE `markReceiptComplete` writes the digest.
 *  - It can never break later, because DELETE and TRUNCATE on the snapshot
 *    table are refused by triggers from blocks 0106 and 0108. A FK is normally
 *    a liability when the parent can be deleted; here it structurally cannot.
 *  - Without it, "the digest points at a snapshot that exists" is a
 *    convention. `readManifestSnapshot` recomputes before trusting, so a
 *    MIS-ADDRESSED row is caught - but a digest pointing at NOTHING is a
 *    different failure, and nothing caught that.
 *  - NULL is permitted, which is what a `failed` receipt writes, so the
 *    failure path is unaffected.
 *
 * Its cost is one unique-index probe per receipt completion, off the money
 * path. `NOT VALID` for the same reason as the CHECK.
 *
 * ## Backlog (DEC-20260504-B)
 *
 * Not a bulk-operation resumption. Both ALTERs are catalog-only in PG11+, the
 * CHECK and FK are `NOT VALID` so neither scans, and there is no accumulated
 * workload to drain: production carries zero rows with receipt state, so the
 * sweeper starts from an empty backlog and only ever sees rows created after
 * this block ran.
 */
export async function runMigration0109_receiptEpoch(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // ONE statement, so the whole thing is atomic.
  //
  // These used to be four separate `tx.execute` calls, and blocks are
  // autocommitted per statement - `runStartupMigrations` hands each block the
  // pooled `db`, not a transaction. So when the probe at the end refused, the
  // two SET DEFAULTs and the epoch CHECK had ALREADY COMMITTED. Boot then
  // aborted, Railway kept the previous deployment serving, and that previous
  // deployment had the new defaults and no sweeper: every new row would sit
  // `pending`, nothing would chain, and /v1/audit/:id would answer 202 forever
  // until someone rolled forward. The refusal was supposed to be the safe
  // outcome and it was the dangerous one. Reviewer-found.
  //
  // A plpgsql DO block is a single statement, so a RAISE anywhere inside it
  // unwinds every DDL it performed. Refusing now genuinely changes nothing.
  //
  // The three things it does, in order that matters:
  //
  //  1. Both DEFAULTS, unconditionally. `receipt_status` alone is not enough:
  //     block 0107's transactions_receipt_reason_required means a row that is
  //     `pending` must SAY why, so defaulting the status without the reason
  //     makes EVERY INSERT into transactions fail - every /v1/do call, every
  //     x402 call, every harness tick. The migration would still apply
  //     cleanly, because that CHECK is NOT VALID and existing rows are never
  //     scanned; the platform would simply stop being able to write.
  //     Unconditional, so a hand-dropped default is repaired rather than
  //     skipped forever by a guard on something else.
  //
  //  2. The epoch CHECK, guarded, because the epoch instant must be chosen
  //     exactly once in the lifetime of the database and re-running must not
  //     move it.
  //
  //  3. A behavioural self-check, because reading the catalog is not proof.
  //     The defect above was invisible to every catalog query: the default was
  //     present and correct, the CHECK was present and correct, and together
  //     they made every INSERT fail. The only thing that can tell the
  //     difference is doing what production does - so this inserts an ordinary
  //     row (the same shape /health/deep has used 507 times in production) and
  //     unwinds it via a deliberate RAISE inside a nested subtransaction.
  await tx.execute(sql`
    DO $$
    BEGIN
      ALTER TABLE transactions ALTER COLUMN receipt_status SET DEFAULT 'pending';
      ALTER TABLE transactions ALTER COLUMN receipt_failure_reason SET DEFAULT 'not_yet_built';

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_post_epoch_has_receipt'
      ) THEN
        EXECUTE format(
          'ALTER TABLE transactions ADD CONSTRAINT transactions_post_epoch_has_receipt '
          'CHECK (created_at < %L OR receipt_status IS NOT NULL) NOT VALID',
          now()
        );
      END IF;

      BEGIN
        INSERT INTO transactions
          (solution_slug, status, input, price_cents, transparency_marker,
           data_jurisdiction, is_free_tier)
        VALUES ('_receipt_epoch_probe', 'health_probe', '{}', 0, 'algorithmic', 'EU', true);
        RAISE EXCEPTION 'receipt_epoch_probe_rollback';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLERRM <> 'receipt_epoch_probe_rollback' THEN
            RAISE EXCEPTION
              '0109: with the receipt defaults in place an ordinary INSERT into '
              'transactions is refused, so production would be unable to write: %',
              SQLERRM;
          END IF;
      END;
    END $$
  `);

  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transactions_receipt_manifest_digest_fk'
      ) THEN
        ALTER TABLE transactions
          ADD CONSTRAINT transactions_receipt_manifest_digest_fk
          FOREIGN KEY (receipt_manifest_digest)
          REFERENCES execution_manifest_snapshots (digest)
          NOT VALID;
      END IF;
    END $$
  `);

  // Self-verify by object, not by "no error was raised". A block that reports
  // success without checking is the hollow-gate pattern this repo has been
  // bitten by more than once.
  const verify = (await tx.execute(sql`
    SELECT
      (SELECT column_default FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'receipt_status') AS default_expr,
      (SELECT column_default FROM information_schema.columns
        WHERE table_name = 'transactions' AND column_name = 'receipt_failure_reason') AS reason_default,
      (SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname = 'transactions_post_epoch_has_receipt') AS epoch_check,
      (SELECT 1 FROM pg_constraint
        WHERE conname = 'transactions_receipt_manifest_digest_fk') AS fk_present
  `)) as unknown as Array<{
    default_expr: string | null;
    reason_default: string | null;
    epoch_check: string | null;
    fk_present: number | null;
  }>;

  // Behavioural self-check, because reading the catalog is not proof.
  //
  // The defect this exists for was invisible to every catalog query: the
  // status default was present and correct, the CHECK was present and correct,
  // and together they made every INSERT fail. The only thing that could tell
  // the difference is doing what production does.
  //
  // Same row shape as the /health/deep write-path probe. Rolled back to the
  // savepoint, so nothing is left behind; a violation raises and aborts boot,
  // which is the right outcome -- Railway does not cut over a failed deploy,
  // so the previous commit keeps serving instead of the new one refusing every
  // write.
  const row = verify[0];
  if (!row?.default_expr || !row.default_expr.includes("pending")) {
    throw new Error(
      "0109: receipt_status has no 'pending' default, so a transaction could " +
        "still be inserted with no receipt state. Got: " +
        String(row?.default_expr),
    );
  }
  if (!row?.reason_default || !row.reason_default.includes("not_yet_built")) {
    throw new Error(
      "0109: receipt_failure_reason has no 'not_yet_built' default, so an insert " +
        "carrying the pending status default would violate " +
        "transactions_receipt_reason_required. Got: " + String(row?.reason_default),
    );
  }
  if (!row?.epoch_check) {
    throw new Error("0109: the post-epoch CHECK constraint is absent after the block ran");
  }
  if (!row?.fk_present) {
    throw new Error("0109: the receipt_manifest_digest foreign key is absent after the block ran");
  }

  return {
    block: "0109_receipt_epoch",
    outcome:
      "receipt_status DEFAULT 'pending' + post-epoch CHECK + manifest-digest FK, " +
      "all present and verified; epoch: " +
      (parseEpochFromCheck(row.epoch_check) ?? "unparsed"),
    duration_ms: Date.now() - startedAt,
  };
}

/**
 * The epoch instant, read back out of the constraint that enforces it.
 *
 * Deliberately no second copy in a table: two records of one fact is how they
 * drift. Returns null rather than guessing if the shape is unfamiliar, because
 * a wrong epoch reported confidently is worse than an absent one.
 */
export function parseEpochFromCheck(constraintDef: string | null): string | null {
  if (!constraintDef) return null;
  const m = constraintDef.match(/'([^']+)'::timestamp with time zone/);
  return m ? m[1] : null;
}
