/**
 * Audit hash-chain admission against a real Postgres (WP1, CR-04).
 *
 * The re-audit reframed this risk. The original audit claimed concurrent
 * finalisation branches the chain and that a genesis race exists. Neither is
 * true: admission is serialised by `pg_try_advisory_xact_lock`, and the retry
 * worker is the only writer of `integrity_hash` in the codebase. Asserting the
 * audit's stated threat would have produced a passing test for a hazard that
 * does not exist.
 *
 * What is real is an ordering inconsistency. The worker threads a batch in
 * `(created_at, id) ASC` order, while `getPreviousHash()` selects the head in
 * `(completed_at, id) DESC` order. When those two orders disagree — a row
 * created earlier but completed later — the head the next tick starts from is
 * not the tip the previous tick produced, so two rows can end up sharing a
 * parent. There is no unique constraint on `previous_hash` to stop it, and no
 * job anywhere looks for branches.
 *
 * These tests establish the good path as a regression baseline and then
 * demonstrate the branch with a concrete row ordering. WP7 must make the
 * branch test fail.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { transactions, users, capabilities } from "../db/schema.js";


// Environment is set only when the lane is actually going to run. These
// module-level assignments execute even when the suite skips, so applying them
// unconditionally leaked configuration into every other suite in a full-suite
// run and made an unrelated admin-auth test fail intermittently.
if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "wp1-chain-secret-at-least-32-chars-long-0000";
  process.env.ADMIN_SECRET ??= "wp1-chain-admin-secret-at-least-32-chars-0000";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/** The worker ignores rows younger than GRACE_MS (10s). */
const OLDER_THAN_GRACE = 60_000;

describeMaybe("integrity hash chain admission", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let runOnce: () => Promise<void>;

  let userId: string;
  let capabilityId: string;
  const createdTxnIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);
    ({ runIntegrityHashRetryOnce: runOnce } = await import(
      "./integrity-hash-retry.js"
    ));

    userId = randomUUID();
    capabilityId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `wp1-chain-${userId}@example.test`,
      apiKeyHash: `hash-${userId}`,
      keyPrefix: "sk_live_wp1chain",
    });
    await db.insert(capabilities).values({
      id: capabilityId,
      slug: `wp1-chain-${randomUUID().slice(0, 8)}`,
      name: "WP1 chain probe",
      description: "Seeded by the WP1 chain test.",
      category: "developer-tools",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      priceCents: 10,
    });
  }, 120_000);

  afterAll(async () => {
    await db.delete(transactions).where(eq(transactions.userId, userId));
    await db.delete(capabilities).where(eq(capabilities.id, capabilityId));
    await db.delete(users).where(eq(users.id, userId));
    await client.end();
  });

  afterEach(async () => {
    if (createdTxnIds.length) {
      await db.delete(transactions).where(inArray(transactions.id, createdTxnIds));
      createdTxnIds.length = 0;
    }
  });

  /**
   * Insert a terminal transaction the worker will pick up. `createdAt` and
   * `completedAt` are set independently so the two orderings can be made to
   * disagree.
   */
  async function insertCompleted(opts: {
    createdAgoMs: number;
    completedAgoMs: number;
  }): Promise<string> {
    const id = randomUUID();
    createdTxnIds.push(id);
    await db.insert(transactions).values({
      id,
      userId,
      capabilityId,
      status: "completed",
      input: { probe: "wp1-chain" },
      output: { ok: true },
      priceCents: 10,
      transparencyMarker: "algorithmic",
      dataJurisdiction: "EU",
      createdAt: new Date(Date.now() - opts.createdAgoMs),
      completedAt: new Date(Date.now() - opts.completedAgoMs),
      complianceHashState: "pending",
    });
    return id;
  }

  async function chainRows(ids: string[]) {
    return db
      .select({
        id: transactions.id,
        integrityHash: transactions.integrityHash,
        previousHash: transactions.previousHash,
        state: transactions.complianceHashState,
      })
      .from(transactions)
      .where(inArray(transactions.id, ids));
  }

  it("hashes pending terminal rows and links each to a predecessor", async () => {
    const ids = [
      await insertCompleted({ createdAgoMs: OLDER_THAN_GRACE + 3_000, completedAgoMs: OLDER_THAN_GRACE + 3_000 }),
      await insertCompleted({ createdAgoMs: OLDER_THAN_GRACE + 2_000, completedAgoMs: OLDER_THAN_GRACE + 2_000 }),
      await insertCompleted({ createdAgoMs: OLDER_THAN_GRACE + 1_000, completedAgoMs: OLDER_THAN_GRACE + 1_000 }),
    ];

    await runOnce();

    const rows = await chainRows(ids);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.integrityHash).toBeTruthy();
      expect(row.previousHash).toBeTruthy();
      expect(row.state).toBe("complete");
    }

    // Threaded, not merely stamped: no row may point at itself, and within the
    // batch each hash is distinct.
    const hashes = new Set(rows.map((r) => r.integrityHash));
    expect(hashes.size).toBe(3);
    for (const row of rows) {
      expect(row.previousHash).not.toBe(row.integrityHash);
    }
  }, 120_000);

  it("leaves rows younger than the grace window alone", async () => {
    // The grace window is what stops the worker hashing a row whose inserting
    // transaction has not committed its final state yet (CRIT-5).
    const id = await insertCompleted({ createdAgoMs: 1_000, completedAgoMs: 1_000 });

    await runOnce();

    const [row] = await chainRows([id]);
    expect(row!.integrityHash).toBeNull();
    expect(row!.state).toBe("pending");
  }, 120_000);

  it("PINS BUG: nothing prevents two rows sharing a parent", async () => {
    // The structural gap, independent of how it is reached: `previous_hash`
    // has no unique constraint, so a branch is representable and no job looks
    // for one. Asserted against the live schema rather than by reasoning about
    // it — if WP7 adds the constraint, this fails and must be updated.
    const indexes = await db.execute(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'transactions'`,
    );
    const defs = (Array.isArray(indexes) ? indexes : (indexes as any).rows ?? []) as {
      indexdef: string;
    }[];

    const guardsPreviousHash = defs.some(
      (d) => /unique/i.test(d.indexdef) && /previous_hash/i.test(d.indexdef),
    );
    expect(guardsPreviousHash).toBe(false);
  }, 120_000);

  it("head selection and batch threading agree (WP7 inverts the WP1 pin)", async () => {
    // This test was named "PINS BUG" and asserted the defect: the worker
    // threaded by (created_at, id) while getPreviousHash picked the head by
    // (completed_at, id), so the tip a batch produced was not the head the next
    // tick resumed from, and one parent acquired two children. Both now order
    // by completed_at. The expectation inverts, exactly as WP1's comment said
    // it would.
    const earlyCreatedLateCompleted = await insertCompleted({
      createdAgoMs: OLDER_THAN_GRACE + 5_000,
      completedAgoMs: OLDER_THAN_GRACE + 500,
    });
    const lateCreatedEarlyCompleted = await insertCompleted({
      createdAgoMs: OLDER_THAN_GRACE + 4_000,
      completedAgoMs: OLDER_THAN_GRACE + 4_000,
    });

    await runOnce();

    const rows = await chainRows([
      earlyCreatedLateCompleted,
      lateCreatedEarlyCompleted,
    ]);
    for (const row of rows) expect(row.integrityHash).toBeTruthy();

    const { getPreviousHash } = await import("../lib/integrity-hash.js");
    const head = await getPreviousHash();

    // The TIP is whichever row the batch chained last — i.e. the one that is
    // nobody's parent. Deriving it from the data rather than naming a row is
    // what makes this discriminating: naming `earlyCreatedLateCompleted`
    // asserted that head selection agrees with itself, which is true under the
    // bug too. Verified by mutation — reverting the batch to (created_at, id)
    // turns this red.
    const parents = new Set(rows.map((r) => r.previousHash).filter(Boolean));
    const tips = rows.filter((r) => !parents.has(r.integrityHash));
    expect(tips, "a batch must produce exactly one tip").toHaveLength(1);
    expect(head).toBe(tips[0]!.integrityHash);
  }, 120_000);

  it("a null completed_at row cannot capture the head", async () => {
    // THE production defect, and the reason the chain stopped being a chain.
    // Postgres sorts NULLs FIRST under DESC, so one hashed row with a null
    // completed_at held the head from 2026-05-04 onward and every later batch
    // linked to it — 150,719 children on one parent.
    const settled = await insertCompleted({
      createdAgoMs: OLDER_THAN_GRACE + 3_000,
      completedAgoMs: OLDER_THAN_GRACE + 3_000,
    });
    await runOnce();

    const { getPreviousHash } = await import("../lib/integrity-hash.js");
    const headBefore = await getPreviousHash();

    // Plant exactly the shape that broke production: hashed, no completed_at.
    const [planted] = await db
      .insert(transactions)
      .values({
        status: "health_probe",
        input: {},
        priceCents: 0,
        integrityHash: "f".repeat(64),
        previousHash: headBefore,
        complianceHashState: "complete",
        completedAt: null,
      })
      .returning({ id: transactions.id });

    try {
      // The head must be unmoved by a row with no completion time.
      expect(await getPreviousHash()).toBe(headBefore);
      expect(headBefore).toBeTruthy();
    } finally {
      await db.delete(transactions).where(eq(transactions.id, planted.id));
    }
  }, 120_000);

  it("does not admit a non-terminal row to the chain", async () => {
    // status and completed_at are hashed fields, so hashing a row that is still
    // running bakes in values that will change — and the recorded hash then
    // stops describing the row, which is indistinguishable from tampering.
    const [running] = await db
      .insert(transactions)
      .values({
        status: "executing",
        input: {},
        priceCents: 10,
        complianceHashState: "pending",
        createdAt: new Date(Date.now() - OLDER_THAN_GRACE - 10_000),
        // Deliberately HAS a completed_at. A null one is already excluded by
        // the head-capture guard, so leaving it null meant this test passed
        // with the status filter removed — it was proving the other fix.
        // Verified by mutation: dropping the status filter now turns it red.
        completedAt: new Date(Date.now() - OLDER_THAN_GRACE - 5_000),
      })
      .returning({ id: transactions.id });

    try {
      await runOnce();

      const [after] = await db
        .select({
          integrityHash: transactions.integrityHash,
          state: transactions.complianceHashState,
        })
        .from(transactions)
        .where(eq(transactions.id, running.id));

      expect(after!.integrityHash).toBeNull();
      // Still pending, not 'excluded': it may yet complete and become eligible.
      expect(after!.state).toBe("pending");
    } finally {
      await db.delete(transactions).where(eq(transactions.id, running.id));
    }
  }, 120_000);

  it("detects a fork among SEQUENCED rows, and ignores the historical break", async () => {
    // Points at the scheduled check, not at a helper. The first version tested
    // an exported `detectChainForks` that nothing called — a fork detector no
    // scheduler invokes detects nothing, which was the review's second blocking
    // finding.
    const { checkChainForks } = await import("../lib/chain-health-monitoring.js");

    const parent = `parent-${Math.random().toString(36).slice(2, 10)}`;
    const planted: string[] = [];
    try {
      // Two children of one parent, but WITHOUT chain_seq — i.e. the shape of
      // the pre-WP7 history. Must NOT be reported, or the known break drowns
      // the signal that a new fork appeared.
      for (let i = 0; i < 2; i++) {
        const [row] = await db
          .insert(transactions)
          .values({
            status: "completed",
            input: {},
            priceCents: 0,
            integrityHash: `hist-${i}-${Math.random().toString(36).slice(2)}`,
            previousHash: parent,
            complianceHashState: "complete",
            completedAt: new Date(),
          })
          .returning({ id: transactions.id });
        planted.push(row.id);
      }

      const historical = await checkChainForks();
      expect(historical.passed, "unsequenced history must not be reported").toBe(true);

      // Now give them chain positions: the same rows become a REAL fork.
      for (const id of planted) {
        await db
          .update(transactions)
          .set({ chainSeq: sql`nextval('transactions_chain_seq')` })
          .where(eq(transactions.id, id));
      }

      const detected = await checkChainForks();
      expect(detected.passed, "two sequenced children of one parent is a fork").toBe(false);
      expect(detected.severity).toBe("critical");
    } finally {
      for (const id of planted) {
        await db.delete(transactions).where(eq(transactions.id, id));
      }
    }
  }, 120_000);

  it("does not fork ACROSS batches when a row completes out of order", async () => {
    // The review's blocking finding, and the case no test reached: both prior
    // ordering tests put their rows in ONE batch, where the loop threads them
    // correctly under either rule. The defect lives at the batch boundary.
    //
    // `completed_at` is stamped from a clock read before the row's own
    // created_at default (median delta in production: MINUS 1.5 ms), so a row
    // admitted in a later tick can carry an EARLIER completion time. Under the
    // old max(completed_at) head rule it chained onto the head without becoming
    // it, and the next row chained onto the same parent.
    const first = await insertCompleted({
      createdAgoMs: OLDER_THAN_GRACE + 9_000,
      completedAgoMs: OLDER_THAN_GRACE + 1_000,
    });
    await runOnce();

    // Second tick: a row whose completed_at is EARLIER than what tick 1 left as
    // the head.
    const backdated = await insertCompleted({
      createdAgoMs: OLDER_THAN_GRACE + 8_000,
      completedAgoMs: OLDER_THAN_GRACE + 7_000,
    });
    await runOnce();

    const rows = await chainRows([first, backdated]);
    for (const row of rows) expect(row.integrityHash).toBeTruthy();

    // The property: distinct parents. Same parent for both = the fork.
    const parents = rows.map((r) => r.previousHash);
    expect(new Set(parents).size, "each row must chain onto a distinct parent").toBe(
      parents.length,
    );

    // And the head is the LAST-HASHED row, not the latest-completed one.
    const { getPreviousHash } = await import("../lib/integrity-hash.js");
    const backdatedRow = rows.find((r) => r.id === backdated)!;
    expect(await getPreviousHash()).toBe(backdatedRow.integrityHash);
  }, 120_000);
});
