import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0103: redacted content stays redacted (WP11, round 7) ───────────
//
// WP11 made account closure clear the customer content from the caller's
// transaction rows. That created a race nobody had before: an async execution
// completes in its OWN transaction, seconds to minutes after the request
// returned 202 — four production capabilities exceed the 10-second threshold —
// and account closure can land in that window. The background write then puts
// `output`, `provenance` and `audit_trail` back onto a row the customer has
// just been told, in writing, was cleared, where it sits until the 90-day
// purge while `/v1/verify` reports a completed Art. 17 erasure.
//
// The first fix added `AND redacted_at IS NULL` to the async SUCCESS path.
// Review then found the same window on the async FAILURE path in the same
// function, plus seven other content-writing UPDATEs and the reservation
// reconciler — and the test that "proved" the fix had re-typed the predicate
// inline rather than calling the code, so it could not have caught any of them.
//
// Enumerating write sites is how this package spent six rounds getting the
// closure receipt wrong. So this does not enumerate them. A BEFORE UPDATE
// trigger holds the invariant for every site that exists and every site anyone
// adds: **once a row is redacted, its customer content cannot come back.**
//
// It nulls the offending columns rather than raising. Raising would turn a
// benign late write into an unhandled exception on a path that has already
// returned to the customer, and the write is not an error — it is a result
// arriving for a request that was legitimately made. What is refused is the
// COPY we would otherwise retain after being asked not to; the customer's own
// result was returned from the executor, never read back from the row.
//
// Deliberately narrow: only the customer-content columns, and only while
// `redacted_at` is already set. Status, latency, hashes and reservation state
// still update freely, which is what lets the hash-retry worker and the
// reconciler finish their work on a closed account's rows.
export async function runMigration0103_redactedContentStaysRedacted(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "transactions_redacted_content_stays_cleared"()
    RETURNS trigger AS $fn$
    BEGIN
      IF OLD.redacted_at IS NOT NULL THEN
        NEW.input           := '{}'::jsonb;
        NEW.output          := NULL;
        NEW.error           := NULL;
        NEW.audit_trail     := NULL;
        NEW.provenance      := NULL;
        NEW.idempotency_key := NULL;
        NEW.client_meta     := NULL;
        NEW.redacted_at     := OLD.redacted_at;
        NEW.deletion_reason := OLD.deletion_reason;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql
  `);

  // Created only when absent, never dropped and recreated — the same reasoning
  // block 0101 records. A drop-then-create pair autocommits separately, so it
  // opens a window on every boot during which the protection is simply gone,
  // on a table the customer path writes to.
  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'transactions_redacted_content_stays_cleared_trg'
          AND tgrelid = 'public.transactions'::regclass
      ) THEN
        CREATE TRIGGER "transactions_redacted_content_stays_cleared_trg"
          BEFORE UPDATE ON "transactions"
          FOR EACH ROW EXECUTE FUNCTION "transactions_redacted_content_stays_cleared"();
      END IF;
    END $$;
  `);

  // Verify, do not assume. A block that reports success while the trigger is
  // absent leaves a guarantee the receipt depends on unenforced — and the
  // receipt is a written statement to a data subject.
  const check = (await tx.execute(sql`
    SELECT COUNT(*)::int AS n
      FROM pg_trigger
     WHERE tgname = 'transactions_redacted_content_stays_cleared_trg'
       AND tgrelid = 'public.transactions'::regclass
  `)) as unknown as Array<{ n: number }>;
  const present = Number((Array.isArray(check) ? check[0] : undefined)?.n ?? 0);
  if (present !== 1) {
    throw new Error(
      "transactions_redacted_content_stays_cleared_trg is absent after creation " +
        `(pg_trigger match count ${present}). Refusing to report success: without it, ` +
        "an async execution completing after account closure silently restores the " +
        "customer content the erasure receipt says was destroyed.",
    );
  }

  return {
    block: "0103_redacted_content_stays_redacted",
    outcome: "trigger present and verified — redacted content cannot be restored",
    duration_ms: Date.now() - startedAt,
  };
}
