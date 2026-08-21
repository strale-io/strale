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
import { eq, inArray } from "drizzle-orm";
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

  it("PINS BUG: head selection and batch threading use different orderings", async () => {
    // The worker threads a batch by (created_at, id) ASC; getPreviousHash()
    // picks the head by (completed_at, id) DESC. This row is created before a
    // sibling but completed after it, so the tip the batch produces is not the
    // head the next tick resumes from.
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

    // Now the head the NEXT tick would start from.
    const { getPreviousHash } = await import("../lib/integrity-hash.js");
    const head = await getPreviousHash();

    const tip = rows.find((r) => r.id === lateCreatedEarlyCompleted)!;
    const laterCompleted = rows.find((r) => r.id === earlyCreatedLateCompleted)!;

    // Threading order made `lateCreatedEarlyCompleted` the batch tip, but head
    // selection returns the row with the greatest completed_at instead. The
    // next admission therefore links to a row that is not the chain tip, which
    // is how two children of one parent arise. WP7 makes the two orderings
    // agree; this expectation then inverts.
    expect(head).toBe(laterCompleted.integrityHash);
    expect(head).not.toBe(tip.integrityHash);
  }, 120_000);
});
