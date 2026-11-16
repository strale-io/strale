import { afterAll, describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { useTestDatabase } from "../test-support/integration-db.js";
const DATABASE_URL_TEST = useTestDatabase();
const suite = DATABASE_URL_TEST ? describe : describe.skip;
const { getDb, closeDbPool } = await import("../db/index.js");
const { OPS_READ_CHECKS, assertSafeOutput, INDEX_PLAN_SETTINGS, HEAP_PLAN_SETTINGS, ORPHANS_INDEX_PLAN, ORPHANS_HEAP_PLAN } = await import("./ops-read.js");
type ReadExecutor = import("./ops-read.js").ReadExecutor;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
class Rollback extends Error {}
const dialect = new PgDialect();

/**
 * burst-debit-refund on synthetic wallet rows. The refund rule matches by
 * wallet, amount and time only, so one refund row can sit near two bursts, or
 * near a burst and a no-reference debit outside the matched completed set.
 * These cases pin that the check counts both and flags the refund total as an
 * upper bound, and that each count fails once its logic is removed.
 */

const BASE = "2026-11-01T10:00:00Z";
type Seed = {
  debits: number[]; // seconds after BASE, 100 cents each
  calls: [seconds: number, slug: string, status: "completed" | "failed"][]; // 100 cents each
  refunds: number[]; // seconds after BASE, 100 cents each
};

async function seed(tx: Tx, s: Seed) {
  // Only this fixture's no-reference rows are visible to the check.
  await tx.execute(sql`DELETE FROM wallet_transactions WHERE reference_id IS NULL AND type IN ('purchase', 'refund')`);
  const [user] = await tx.execute(sql`INSERT INTO users(email, api_key_hash, key_prefix)
    VALUES ('burst-fixture@strale.internal', 'burst-hash', 'burst-prefix') RETURNING id`);
  const [wallet] = await tx.execute(sql`INSERT INTO wallets(user_id) VALUES (${user.id}) RETURNING id`);
  const at = (secs: number) => sql`${BASE}::timestamptz + make_interval(secs => ${secs})`;
  for (const secs of s.debits) {
    await tx.execute(sql`INSERT INTO wallet_transactions(wallet_id, amount_cents, type, created_at)
      VALUES (${wallet.id}, -100, 'purchase', ${at(secs)})`);
  }
  for (const secs of s.refunds) {
    await tx.execute(sql`INSERT INTO wallet_transactions(wallet_id, amount_cents, type, created_at)
      VALUES (${wallet.id}, 100, 'refund', ${at(secs)})`);
  }
  for (const [secs, slug, status] of s.calls) {
    await tx.execute(sql`INSERT INTO transactions(status, input, price_cents, user_id, solution_slug, payment_method, created_at)
      VALUES (${status}, '{}', 100, ${user.id}, ${slug}, 'wallet', ${at(secs)})`);
  }
}

/** Runs the check, rewriting its statement text first when mutations are given. */
async function runBursts(tx: Tx, mutations: [from: string, to: string][] = []) {
  const applied = new Set<string>();
  const executor: ReadExecutor = {
    execute: async (query: SQL) => {
      if (mutations.length === 0) return tx.execute(query);
      const rendered = dialect.sqlToQuery(query);
      expect(rendered.params).toEqual([]);
      let text = rendered.sql;
      for (const [from, to] of mutations) {
        if (text.includes(from)) {
          text = text.split(from).join(to);
          applied.add(from);
        }
      }
      return tx.execute(sql.raw(text));
    },
  };
  const def = OPS_READ_CHECKS["burst-debit-refund"];
  const result = await def.run(executor, def.prepare({}));
  // A mutation that matched nothing would make its test vacuous.
  for (const [from] of mutations) expect(applied.has(from), from).toBe(true);
  assertSafeOutput({ check: "burst-debit-refund", result });
  return (result as { burst_totals: Record<string, unknown> }).burst_totals;
}

async function inRollback(fn: (tx: Tx) => Promise<void>, config?: { accessMode: "read only" }) {
  await expect(getDb().transaction(async (tx) => {
    await fn(tx);
    throw new Rollback();
  }, config)).rejects.toBeInstanceOf(Rollback);
}

// The route runs every check read-only (routes/ops-read.ts); so do these.
const READ_ONLY = { accessMode: "read only" } as const;

// Two debits explained by one completed call: a burst with 100 cents of excess.
const burstAt = (secs: number, slug = "kyb-essentials-se"): Pick<Seed, "debits" | "calls"> => ({
  debits: [secs, secs + 1],
  calls: [[secs, slug, "completed"]],
});

// Two bursts of the same solution, 200 s apart (beyond the 60 s chain on each
// side), and one refund 300 s after the first: within ten minutes of all four
// debits, so each burst counts it.
const TWO_BURSTS: Seed = {
  debits: [...burstAt(0).debits, ...burstAt(200).debits],
  calls: [...burstAt(0).calls, ...burstAt(200).calls],
  refunds: [300],
};
// One burst, plus a debit 90 s later matched only to a failed call (outside
// the burst's 60 s pairing window), and one refund near both.
const NEAR_FAILED: Seed = {
  debits: [...burstAt(0).debits, 90],
  calls: [...burstAt(0).calls, [90, "kyb-essentials-se", "failed"]],
  refunds: [100],
};
// Control: one burst, one refund near it and nothing else.
const CONTROL: Seed = { ...burstAt(0), refunds: [30] };

const NO_SEVERAL = ["HAVING COUNT(*) > 1", ""] as [string, string];
const NO_OUTSIDE_MCD = ["WHERE NOT EXISTS (SELECT 1 FROM mcd WHERE mcd.id = nr.id)", ""] as [string, string];
const NO_NEAR_OTHER_FILTER = ["WHERE EXISTS (SELECT 1 FROM near_other o WHERE o.id = br.id)", ""] as [string, string];
const FLAG_SEVERAL_ONLY = ["several > 0 OR also_other > 0", "several > 0"] as [string, string];

// One pool for both suites; closed once, after the last.
afterAll(async () => { if (DATABASE_URL_TEST) await closeDbPool(); });

suite("burst-debit-refund on disposable Postgres", () => {

  it("one refund near two bursts counts in both, and is reported as attributed to several bursts", async () => {
    await inRollback(async (tx) => {
      await seed(tx, TWO_BURSTS);
      expect(await runBursts(tx)).toMatchObject({
        bursts: 2, multi_debit_bursts: 2, bursts_with_excess: 2,
        excess_cents_total: "200",
        // One 100-cent refund, counted once per burst.
        excess_refunded_cents: "200", excess_unrefunded_cents: "0",
        refunds_attributed_to_several_bursts: 1,
        refunds_also_near_other_debits: 0,
        excess_refunded_is_upper_bound: true,
      });
    });
  });

  it("a refund near a burst and a failed-call debit is reported as also near other debits", async () => {
    await inRollback(async (tx) => {
      await seed(tx, NEAR_FAILED);
      expect(await runBursts(tx)).toMatchObject({
        bursts: 1, excess_cents_total: "100", excess_refunded_cents: "100",
        refunds_attributed_to_several_bursts: 0,
        refunds_also_near_other_debits: 1,
        excess_refunded_is_upper_bound: true,
      });
    });
  });

  it("a refund near one burst and nothing else counts in neither, and the refund total is exact", async () => {
    await inRollback(async (tx) => {
      await seed(tx, CONTROL);
      expect(await runBursts(tx)).toMatchObject({
        bursts: 1, excess_cents_total: "100", excess_refunded_cents: "100",
        refunds_attributed_to_several_bursts: 0,
        refunds_also_near_other_debits: 0,
        excess_refunded_is_upper_bound: false,
      });
    });
  });

  describe("each count fails when its logic is removed", () => {
    it("without HAVING COUNT(*) > 1, a refund near one burst reads as near several", async () => {
      await inRollback(async (tx) => {
        await seed(tx, CONTROL);
        const out = await runBursts(tx, [NO_SEVERAL]);
        expect(out.refunds_attributed_to_several_bursts).not.toBe(0);
        expect(out.excess_refunded_is_upper_bound).toBe(true);
      });
    });

    it("without the outside-mcd filter, a burst's own debits count as other debits", async () => {
      await inRollback(async (tx) => {
        await seed(tx, CONTROL);
        const out = await runBursts(tx, [NO_OUTSIDE_MCD]);
        expect(out.refunds_also_near_other_debits).not.toBe(0);
      });
    });

    it("without the near-other filter, every burst refund counts as also near other debits", async () => {
      await inRollback(async (tx) => {
        await seed(tx, CONTROL);
        const out = await runBursts(tx, [NO_NEAR_OTHER_FILTER]);
        expect(out.refunds_also_near_other_debits).not.toBe(0);
      });
    });

    it("a flag that reads only the several-bursts count misses the failed-call case", async () => {
      await inRollback(async (tx) => {
        await seed(tx, NEAR_FAILED);
        const out = await runBursts(tx, [FLAG_SEVERAL_ONLY]);
        expect(out.excess_refunded_is_upper_bound).toBe(false);
      });
    });
  });
});

/**
 * transaction-quality-fk on a real database. In production (2026-11-16) the
 * orphan count outran the 5 s statement timeout and the whole check failed,
 * losing the catalog answer. A second connection holds an exclusive lock on
 * transaction_quality, so the count blocks until the timeout cancels it; the
 * catalog query reads only pg_constraint and pg_attribute and is not blocked.
 */
suite("transaction-quality-fk on disposable Postgres", () => {
  const def = OPS_READ_CHECKS["transaction-quality-fk"];

  it("reads the cascade key from the catalog and completes the count", async () => {
    await inRollback(async (tx) => {
      const result = await def.run(tx as unknown as ReadExecutor, def.prepare({}));
      assertSafeOutput({ check: "transaction-quality-fk", result });
      expect(result).toMatchObject({
        foreign_key_exists: true,
        foreign_keys: [{ confdeltype: "c", convalidated: true, condeferrable: false }],
        orphan_counts_complete: true,
        orphaned_rows: 0,
      });
    }, READ_ONLY);
  });

  it("a statement timeout on the count keeps the catalog answer and leaves the transaction usable", async () => {
    const locker = postgres(DATABASE_URL_TEST!, { max: 1 });
    const held = await locker.reserve();
    try {
      await held`BEGIN`;
      // Fail fast rather than hang if another test holds a lock on the table.
      await held`SET LOCAL lock_timeout = '5s'`;
      await held`LOCK TABLE transaction_quality IN ACCESS EXCLUSIVE MODE`;
      await inRollback(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '300ms'`);
        const result = await def.run(tx as unknown as ReadExecutor, def.prepare({}));
        assertSafeOutput({ check: "transaction-quality-fk", result });
        expect(result).toEqual({
          foreign_key_exists: true,
          foreign_keys: [{ confdeltype: "c", convalidated: true, condeferrable: false }],
          orphan_counts_complete: false,
          orphaned_rows: null, orphaned_with_debit: null, orphaned_without_debit: null, orphaned_soft_deleted: null,
        });
        // ROLLBACK TO SAVEPOINT left the transaction open, not aborted.
        const [row] = await tx.execute(sql`SELECT 1 AS ok`);
        expect(row.ok).toBe(1);
      }, READ_ONLY);
    } finally {
      await held`ROLLBACK`;
      held.release();
      await locker.end();
    }
  });
});

/**
 * transaction-quality-orphans on a real database: the two plans the check
 * forces are the plans Postgres actually uses, the settings do not outlive the
 * check, and the dating counts land each orphan in its incident window.
 * Orphans are made the way production must have got them, by inserting with
 * the foreign-key triggers bypassed (session_replication_role = replica).
 */
suite("transaction-quality-orphans on disposable Postgres", () => {
  const def = OPS_READ_CHECKS["transaction-quality-orphans"];

  async function call(tx: Tx, at: string) {
    const [t] = await tx.execute(sql`INSERT INTO transactions(status, input, price_cents, solution_slug, payment_method, created_at)
      VALUES ('completed', '{}', 0, 'orphan-fixture', 'wallet', ${at}::timestamptz) RETURNING id`);
    return t.id as string;
  }
  async function quality(tx: Tx, transactionId: string, at: string) {
    await tx.execute(sql`INSERT INTO transaction_quality(transaction_id, response_time_ms, schema_conformant, fields_returned, fields_expected, field_completeness_pct, created_at)
      VALUES (${transactionId}::uuid, 10, true, 1, 1, 100, ${at}::timestamptz)`);
  }

  it("runs read-only, completes both plans, and leaves the planner settings as it found them", async () => {
    await inRollback(async (tx) => {
      const result = await def.run(tx as unknown as ReadExecutor, def.prepare({}));
      assertSafeOutput({ check: "transaction-quality-orphans", result });
      expect(result).toMatchObject({ index_plan: { complete: true, orphaned_rows: 0 }, heap_plan: { complete: true, orphaned_rows: 0 } });
      for (const name of ["enable_hashjoin", "enable_mergejoin", "enable_indexscan", "enable_indexonlyscan", "enable_bitmapscan"]) {
        const [row] = await tx.execute(sql.raw(`SELECT current_setting('${name}') AS v`));
        expect(row.v, name).toBe("on");
      }
    }, READ_ONLY);
  });

  it("dates each orphan into its incident window, and both plans agree on an intact index", async () => {
    await inRollback(async (tx) => {
      await tx.execute(sql`DELETE FROM transaction_quality`);
      // Surviving calls with their quality rows; the oldest is 2026-04-20.
      for (const at of ["2026-04-20T08:00:00Z", "2026-06-01T08:00:00Z"]) await quality(tx, await call(tx, at), at);
      await tx.execute(sql`SET LOCAL session_replication_role = replica`);
      const orphanAt = [
        "2026-04-15T23:59:59Z",                         // before 04-16
        "2026-04-16T00:00:00Z", "2026-04-16T23:59:59Z", // on 04-16
        "2026-04-17T00:00:00Z",                         // 04-17 to 05-03
        "2026-05-04T00:00:00Z", "2026-07-01T23:59:59Z", // 05-04 to 07-01
        "2026-07-02T00:00:00Z",                         // from 07-02
      ];
      for (const at of orphanAt) await quality(tx, crypto.randomUUID(), at);
      await tx.execute(sql`SET LOCAL session_replication_role = origin`);
      const result = await def.run(tx as unknown as ReadExecutor, def.prepare({}));
      assertSafeOutput({ check: "transaction-quality-orphans", result });
      expect(result).toEqual({
        index_plan: { complete: true, orphaned_rows: 7 },
        heap_plan: {
          complete: true,
          orphaned_rows: 7,
          orphaned_created_before_2026_04_16: 1,
          orphaned_created_on_2026_04_16: 2,
          orphaned_created_2026_04_17_to_2026_05_03: 1,
          orphaned_created_2026_05_04_to_2026_07_01: 2,
          orphaned_created_from_2026_07_02: 1,
          orphaned_newer_than_oldest_call: 3, // 05-04, 07-01 and 07-02 are after 04-20
          oldest_call_before_2026_04_16: false,
        },
      });
    });
  });

  it("each plan takes the path it claims: an index probe of transactions, or no index at all", async () => {
    await inRollback(async (tx) => {
      const plan = async (settings: SQL[], query: SQL) => {
        await tx.execute(sql`SAVEPOINT plan_probe`);
        for (const s of settings) await tx.execute(s);
        const { sql: text } = dialect.sqlToQuery(query);
        const rows = await tx.execute(sql.raw(`EXPLAIN ${text}`));
        await tx.execute(sql`ROLLBACK TO SAVEPOINT plan_probe`);
        return rows.map((r) => String(r["QUERY PLAN"])).join("\n");
      };
      const index = await plan(INDEX_PLAN_SETTINGS, ORPHANS_INDEX_PLAN);
      expect(index).toMatch(/Nested Loop Anti Join/);
      expect(index).toMatch(/Index (Only )?Scan using transactions_pkey on transactions t/);
      const heap = await plan(HEAP_PLAN_SETTINGS, ORPHANS_HEAP_PLAN);
      expect(heap).not.toMatch(/Index|Bitmap/);
      expect(heap).toMatch(/Seq Scan on transactions t\b/);
    }, READ_ONLY);
  });
});
