import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0101 — invocation facts (WP9).
 *
 * The quality floor decides whether to withdraw a capability from sale by
 * joining `transactions ON capability_id`. A solution execution writes one
 * transaction with `capability_id = NULL` and its step outcomes inside an
 * `output.steps` JSONB blob, so a capability invoked only inside bundles has
 * no row carrying its id and the floor's join cannot see it — it cannot be
 * quarantined, because as far as the query is concerned it has no traffic.
 * Verified against production: 694 solution rows, all with a null capability_id,
 * and 126 sub-calls in the trailing 30 days recorded nowhere else.
 *
 * This table records the invocation itself. `transactions` continues to record
 * the billing event; the two stop being asked to be the same thing.
 *
 * ── Immutability, and why it is not absolute ────────────────────────────────
 *
 * A fact that can be edited after the floor reads it is not evidence. The
 * trigger below refuses every UPDATE outright.
 *
 * DELETE is refused only for rows inside the floor's own 35-day reading window
 * (30d window plus margin). Blanket-blocking DELETE would make the table
 * unprunable and guarantee a future incident where the only way to reclaim
 * space is to drop the trigger — at which point the protection is gone
 * precisely when someone is under pressure. Bounding the block to the window
 * that matters targets the actual threat (erasing evidence the floor is about
 * to read) and leaves ordinary retention working.
 *
 * ── No customer content ─────────────────────────────────────────────────────
 *
 * No inputs, no outputs, no error strings — only the canonical verdict. So the
 * 90-day content redaction has nothing here to remove, and this table can be
 * retained on a schedule set by what the floor needs rather than by what
 * privacy requires.
 *
 * Defer-not-throw: a throw here aborts boot, and a failed Railway deploy does
 * not cut over (DEC-20260504-C). Until the table exists the floor falls back to
 * its transactions query, which is exactly today's behaviour.
 */
/**
 * Does the append-only trigger exist? Qualified by relation, because
 * `pg_trigger` is unique on (tgrelid, tgname) and a same-named trigger on
 * another table would otherwise satisfy the check. `to_regclass` returns NULL
 * rather than raising when the table is absent.
 */
/**
 * Most rows the boot path will discard as unprotected. Beyond this it refuses
 * and defers instead: an unbounded DELETE at boot is a bulk operation, and
 * DEC-20260504-B says those get a plan and an operator.
 */
const UNPROTECTED_PURGE_CEILING = 10_000;

async function hasImmutableTrigger(tx: MigrationExecutor): Promise<boolean> {
  const res = await tx.execute(sql`
    SELECT COUNT(*)::int AS n FROM pg_trigger
    WHERE tgname = 'capability_invocations_immutable_trg'
      AND tgrelid = to_regclass('public.capability_invocations')
  `);
  const rows = Array.isArray(res) ? res : (res as { rows?: unknown[] })?.rows ?? [];
  return Number((rows[0] as { n?: number } | undefined)?.n ?? 0) === 1;
}

export async function runMigration0101_capabilityInvocations(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  let outcome: string;

  // Distinct ledger identity from every other block, checked by test. Block
  // 0100 (url-to-markdown re-listing) landed on main while this was open and
  // uses "0100_relistUrlToMarkdown"; a rename that left both writing the same
  // ledger id would make the ledger lie about which migration had run, and the
  // ledger is what tells a one-shot block it has already fired.
  const BLOCK = "0101_capability_invocations";

  // No `SET LOCAL lock_timeout` here, deliberately. Blocks receive the drizzle
  // DB HANDLE, not a transaction (see runStartupMigrations), so every statement
  // autocommits in its own implicit transaction and `SET LOCAL` is discarded
  // before the next one runs — Postgres even says so: "SET LOCAL can only be
  // used in transaction blocks". Two other blocks use the same idiom and it has
  // never done anything there either. Writing a bound that does not bind is
  // worse than having none, because the next reader believes the DDL is
  // protected. The effective bound is the connection-level statement_timeout
  // (30s) from db/index.ts.
  //
  // What keeps this safe is that nothing below takes a LONG lock: the table and
  // the trigger are created only when absent, so there is no per-boot DDL churn
  // on a table the customer path writes to. Not "no lock" — an earlier version
  // of this note claimed that and review corrected it. `CREATE INDEX IF NOT
  // EXISTS` opens the relation under SHARE before its existence check, and
  // SHARE conflicts with the ROW EXCLUSIVE that INSERT takes. The hold is a
  // catalog lookup, so microseconds, but it is not nothing.
  try {
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS startup_migration_ledger (
        block text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now(),
        rows_affected integer NOT NULL DEFAULT 0
      )`);
    const priorRun = (await tx.execute(sql`
      SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
    `)) as unknown as Array<{ block: string }>;
    const firstInstall = (Array.isArray(priorRun) ? priorRun : []).length === 0;

    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS "capability_invocations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "capability_slug" text NOT NULL,
        "rail" text NOT NULL,
        "context_kind" text NOT NULL,
        "solution_id" uuid,
        "transaction_id" uuid,
        "user_id" uuid,
        "is_free_tier" boolean NOT NULL DEFAULT false,
        "success" boolean NOT NULL,
        "failure_class" text,
        "fault" text,
        "billable" boolean NOT NULL,
        "counts_against_capability" boolean NOT NULL,
        "latency_ms" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS "capability_invocations_slug_created_idx"
        ON "capability_invocations" ("capability_slug", "created_at")
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS "capability_invocations_transaction_idx"
        ON "capability_invocations" ("transaction_id")
    `);
    // Serves the floor's epoch probe (MIN(created_at)) and retention pruning.
    // Without it the epoch query degrades to a sequential scan that grows with
    // the table — the sort of thing that is free on the day it ships and is a
    // daily-job timeout six months later.
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS "capability_invocations_created_idx"
        ON "capability_invocations" ("created_at")
    `);

    // A closed enum on `rail` and `context_kind` would drift from the
    // TypeScript unions the moment either gained a member, and a boot-blocking
    // CHECK that rejects a value the code already emits is the asymmetric
    // failure this codebase has shipped before. The values are asserted in
    // TypeScript at the single write site instead.
    await tx.execute(sql`
      CREATE OR REPLACE FUNCTION "capability_invocations_immutable"()
      RETURNS trigger AS $fn$
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          RAISE EXCEPTION
            'capability_invocations is append-only: row % may not be updated', OLD.id;
        END IF;
        IF TG_OP = 'DELETE' AND OLD.created_at > now() - INTERVAL '35 days' THEN
          RAISE EXCEPTION
            'capability_invocations row % is inside the quality-floor reading window and may not be deleted', OLD.id;
        END IF;
        RETURN OLD;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    // Created only when absent, never dropped and recreated.
    //
    // The first version ran DROP TRIGGER IF EXISTS followed by CREATE TRIGGER on
    // every boot. Because these autocommit separately (see the lock_timeout note
    // above), that opened a real if brief window on every boot — roughly four a
    // day in production — during which the append-only protection was absent
    // from a table whose entire purpose is immutability. It also took ACCESS
    // EXCLUSIVE on a table the customer path inserts into, on every boot, with
    // a 30s statement_timeout as the only bound; a lock wait that timed out
    // would defer the whole block, and until this was fixed a deferred block
    // took the quality floor down with it.
    //
    // The FUNCTION is still CREATE OR REPLACE, so the trigger's behaviour can
    // still be corrected by a deploy — replacing a function takes no lock on
    // the table.
    // Rows written while the table had no trigger are not evidence, so they are
    // discarded before protection is installed rather than retroactively
    // blessed by it.
    //
    // CREATE TABLE autocommits, so a block that fails between the table and the
    // trigger leaves the writer filling an unprotected table — and because the
    // floor keys its epoch on MIN(created_at), a later boot that finally creates
    // the trigger would make the whole unprotected era readable as authoritative
    // evidence for delisting decisions. On the normal path the table was created
    // moments ago and is empty, so this deletes nothing; it only ever fires on
    // the recovery path, where the rows it removes are exactly the ones nothing
    // was guarding. Runs BEFORE the trigger exists, which is the only moment a
    // DELETE inside the floor window is permitted.
    let discarded = 0;
    if (firstInstall && !(await hasImmutableTrigger(tx))) {
      // Bounded probe, not COUNT(*) over the whole table: this runs at boot
      // under a 30s statement_timeout, and the table it is counting is the one
      // the customer path writes ~6k rows a day into.
      const probe = await tx.execute(sql`
        SELECT COUNT(*)::int AS n
          FROM (SELECT 1 FROM "capability_invocations" LIMIT ${UNPROTECTED_PURGE_CEILING + 1}) t
      `);
      const probeRows = Array.isArray(probe) ? probe : (probe as { rows?: unknown[] })?.rows ?? [];
      const pending = Number((probeRows[0] as { n?: number } | undefined)?.n ?? 0);

      if (pending > UNPROTECTED_PURGE_CEILING) {
        // Deliberately NOT deleted. An unbounded DELETE at boot on a table this
        // size is a bulk operation, and DEC-20260504-B says a bulk operation
        // gets a plan and an operator, not a boot path. Refusing defers the
        // block, which leaves the floor reading billing rows — its pre-WP9
        // behaviour — and destroys nothing.
        throw new Error(
          `UNPROTECTED-BACKLOG: capability_invocations holds more than ` +
            `${UNPROTECTED_PURGE_CEILING} rows written while it had no append-only ` +
            "trigger. Those rows are not evidence and must not become readable, " +
            "but discarding them is a bulk delete and belongs to an operator, " +
            "not to boot. The floor stays on billing rows until this is resolved.",
        );
      }
      if (pending > 0) {
        const purge = await tx.execute(sql`DELETE FROM "capability_invocations"`);
        const purgeRows = Array.isArray(purge) ? purge : (purge as { rows?: unknown[] })?.rows ?? [];
        discarded = (purge as { count?: number })?.count ?? purgeRows.length ?? 0;
      }
    }

    await tx.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'capability_invocations_immutable_trg'
            AND tgrelid = 'public.capability_invocations'::regclass
        ) THEN
          CREATE TRIGGER "capability_invocations_immutable_trg"
            BEFORE UPDATE OR DELETE ON "capability_invocations"
            FOR EACH ROW EXECUTE FUNCTION "capability_invocations_immutable"();
        END IF;
      END $$;
    `);

    // VERIFY, do not assume. Review round 2 pointed out that nothing anywhere
    // confirmed the trigger exists: a guard asserting the SQL text was
    // satisfied by inverting IF NOT EXISTS to IF EXISTS, and there is a real
    // path to a table-without-trigger even with correct code — CREATE TABLE
    // autocommits, so if any later statement here throws, the block reports
    // "deferred" while the table already exists and the writer starts filling
    // it unprotected. An unprotected facts table is worse than no facts table,
    // because `to_regclass` still says non-null and the floor treats it as
    // authoritative evidence.
    const triggerCount = (await hasImmutableTrigger(tx)) ? 1 : 0;
    if (triggerCount !== 1) {
      throw new Error(
        "UNPROTECTED: capability_invocations exists but its append-only trigger does not " +
          `(pg_trigger match count ${triggerCount}). Refusing to report success: ` +
          "a mutable facts table still reads as present to the quality floor.",
      );
    }
    // Written LAST, and only on success. A block that failed halfway must not
    // record itself as applied, or the next boot skips the purge gate above and
    // the unprotected era becomes permanent.
    await tx.execute(sql`
      INSERT INTO startup_migration_ledger (block, rows_affected)
      VALUES (${BLOCK}, ${discarded})
      ON CONFLICT (block) DO NOTHING
    `);

    outcome =
      "table, indexes and append-only trigger present and verified" +
      (discarded > 0
        ? ` (discarded ${discarded} fact(s) written while the table was unprotected)`
        : "");
  } catch (err) {
    outcome =
      "deferred to next boot: " +
      (err instanceof Error ? err.message.slice(0, 140) : String(err).slice(0, 140));
  }

  return {
    block: "0101_capability_invocations",
    outcome: `capability_invocations — ${outcome}`,
    duration_ms: Date.now() - startedAt,
  };
}
