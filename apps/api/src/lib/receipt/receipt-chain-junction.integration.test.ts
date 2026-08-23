/**
 * The junction between the receipt lifecycle and the integrity chain.
 *
 * Both halves were tested and their JUNCTION was not, and that gap hid the
 * worst defect of the review: adding `integrity_payload_version` to the
 * transition trigger's frozen-column list collided with the chain worker
 * writing exactly that column. The worker's UPDATE fell through to the terminal
 * check — which tested `OLD.receipt_status IN ('complete','failed')` rather than
 * whether the status was *changing* — and was refused.
 *
 * The whole tick runs in one transaction, so the RAISE aborted it, every later
 * statement failed, the per-row catch swallowed them, and the tick rolled back.
 * **One receipt-bearing row would have halted the tamper-evident chain for
 * every transaction in the system, permanently**, retrying every 30 seconds,
 * with `/v1/verify` answering "no integrity hash" and `/v1/audit` answering
 * "still being computed" forever.
 *
 * The full repo suite was green while all of that was true.
 *
 * This file drives the real worker over real rows. It is deliberately not
 * merged into either neighbouring suite: the point is that neither of them
 * could have caught this, and a test that lives in one of them would suggest
 * otherwise.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../../test-support/integration-db.js";
import { buildExecutionReceipt } from "./execution-receipt.js";
import {
  normalizeCapabilityDeclaration,
  recordManifestSnapshot,
} from "./manifest-snapshot.js";
import { markReceiptComplete, markReceiptFailed, markReceiptPending } from "./receipt-lifecycle.js";
import {
  computeIntegrityHashVersioned,
  chainVersionOf,
  GENESIS_HASH,
  CHAIN_PAYLOAD_V2,
} from "../integrity-hash.js";
import { runMigration0108_receiptStateInvariants } from "../startup-migrations.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("receipt lifecycle × integrity chain", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let runOnce: () => Promise<void>;
  const txns = new Set<string>();
  let userId = "";

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
    await runMigration0108_receiptStateInvariants(db as never);

    // Imported after the env is pointed at the test database, because the
    // worker resolves its connection through getDb() at call time.
    ({ runIntegrityHashRetryOnce: runOnce } = await import("../../jobs/integrity-hash-retry.js"));

    userId = randomUUID();
    await db.execute(sql`
      INSERT INTO users (id, email, api_key_hash, key_prefix)
      VALUES (${userId}::uuid, ${`jx-${userId}@test.local`}, ${randomUUID()}, 'sk_test_')
    `);
  });

  afterAll(async () => {
    for (const id of txns) await db.execute(sql`DELETE FROM transactions WHERE id = ${id}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}::uuid`);
    await client.end();
  });

  afterEach(async () => {
    for (const id of txns) await db.execute(sql`DELETE FROM transactions WHERE id = ${id}::uuid`);
    txns.clear();
  });

  /**
   * A digest that names a real stored snapshot.
   *
   * `transactions.receipt_manifest_digest` is a foreign key as of block 0109,
   * so the old `sha256:aaa...` fixture is refused.
   */
  async function realManifestDigest(): Promise<string> {
    return recordManifestSnapshot(
      db,
      normalizeCapabilityDeclaration({
        slug: "vat-validate",
        name: "VAT Validate",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        transparencyTag: "algorithmic",
        dataSource: "VIES",
        capabilityType: "stable_api",
        freshnessCategory: "live-fetch",
        outputFieldReliability: { valid: "guaranteed" },
        processesPersonalData: false,
        personalDataCategories: [],
        gdprArt22Classification: "data_lookup",
        dataUpdateCycleDays: null,
        datasetLastUpdated: null,
        dataClassification: "public",
        x402Method: "POST",
      }),
    );
  }

  /**
   * Past the CHAIN worker's grace window (10s) but inside the RECEIPT
   * sweeper's (60s).
   *
   * Phase 5 gave the same tick a sweeper that finishes pending receipts, and
   * that changes what these tests can assume: an aged row with a pending
   * receipt no longer STAYS pending across a tick - the sweeper terminalises
   * it, and then the chain quite correctly admits it. So a test about "a
   * pending receipt blocks chaining" has to use a row the sweeper will not
   * touch yet, or it is really testing the sweeper.
   */
  async function youngTransaction(): Promise<string> {
    const id = randomUUID();
    txns.add(id);
    await db.execute(sql`
      INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input, created_at, completed_at)
      VALUES (${id}::uuid, ${userId}::uuid, 'completed', 5, 'algorithmic', 'EU', '{}'::jsonb,
              now() - interval '30 seconds', now() - interval '30 seconds')
    `);
    return id;
  }

  /** Old enough to clear the worker's grace window. */
  async function agedTransaction(): Promise<string> {
    const id = randomUUID();
    txns.add(id);
    await db.execute(sql`
      INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input, created_at, completed_at)
      VALUES (${id}::uuid, ${userId}::uuid, 'completed', 5, 'algorithmic', 'EU', '{}'::jsonb,
              now() - interval '2 minutes', now() - interval '2 minutes')
    `);
    return id;
  }

  async function row(id: string) {
    const rows = await db.execute(sql`SELECT * FROM transactions WHERE id = ${id}::uuid`);
    return (rows as unknown as Array<Record<string, unknown>>)[0];
  }

  async function completeReceipt(id: string): Promise<string> {
    const built = buildExecutionReceipt(
      {
        transactionId: id, subjectKind: "capability", subjectSlug: "vat-validate",
        deployCommit: "c".repeat(40), manifestDigest: await realManifestDigest(),
        steps: null, rail: "v1_do", inputs: { vat: "SE1" }, status: "completed",
        result: { valid: true }, error: null, method: "algorithmic",
        sourceObservation: { kind: "computed" },
      },
      { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    );
    if (built.outcome !== "complete") throw new Error(`fixture: ${built.reason}`);
    await markReceiptPending(db, id);
    await markReceiptComplete(db, id, built);
    return built.digest;
  }

  it("THE JUNCTION: a receipt-complete row is chained as v2 and verifies under its own rule", async () => {
    const id = await agedTransaction();
    const digest = await completeReceipt(id);

    await runOnce();

    const r = await row(id);
    // The row was chained at all — this is what the collision prevented.
    expect(r.integrity_hash, "the worker did not chain the row").not.toBeNull();
    expect(Number(r.integrity_payload_version)).toBe(CHAIN_PAYLOAD_V2);
    expect(r.compliance_hash_state).toBe("complete");

    // And it verifies under the rule it declares.
    const recomputed = computeIntegrityHashVersioned(
      {
        id: r.id as string, userId: r.user_id as string, status: r.status as string,
        input: r.input, output: r.output, error: r.error as string | null,
        priceCents: r.price_cents as number, latencyMs: r.latency_ms as number | null,
        provenance: r.provenance, auditTrail: r.audit_trail,
        transparencyMarker: r.transparency_marker as string,
        dataJurisdiction: r.data_jurisdiction as string,
        createdAt: r.created_at as Date, completedAt: r.completed_at as Date,
        receiptDigest: r.receipt_digest as string | null,
      },
      (r.previous_hash as string) ?? GENESIS_HASH,
      chainVersionOf(r.integrity_payload_version as number | null),
    );
    expect(recomputed).toBe(r.integrity_hash);
    expect(r.receipt_digest).toBe(digest);
  });

  it("ONE receipt-bearing row does not stop the rest of the batch being chained", async () => {
    // The blast radius. The tick is one transaction, so a RAISE on any row
    // aborted every other row's write too — including plain v1 rows with no
    // receipt at all.
    const withReceipt = await agedTransaction();
    await completeReceipt(withReceipt);
    const neighbour = await agedTransaction();

    // A genuine v1 row has to be PRE-epoch now. Since block 0109 every new
    // transaction carries receipt state from birth, so "a row with no receipt"
    // is no longer something a present-day insert can produce - v1 is exactly
    // the 887k rows that predate the epoch, and this is the coexistence the
    // chain-versioning design exists to support.
    const legacy = randomUUID();
    txns.add(legacy);
    await db.execute(sql`
      INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input, created_at, completed_at,
                                receipt_status, receipt_failure_reason)
      VALUES (${legacy}::uuid, ${userId}::uuid, 'completed', 5, 'algorithmic', 'EU',
              '{}'::jsonb, now() - interval '400 days', now() - interval '400 days',
              NULL, NULL)
    `);

    await runOnce();

    const a = await row(withReceipt);
    const b = await row(neighbour);
    const c = await row(legacy);
    expect(a.integrity_hash, "receipt row not chained").not.toBeNull();
    expect(b.integrity_hash, "innocent neighbour not chained").not.toBeNull();
    expect(c.integrity_hash, "legacy row not chained").not.toBeNull();
    expect(c.integrity_payload_version, "a PRE-epoch row is v1").toBeNull();
    expect(
      Number(b.integrity_payload_version),
      "a post-epoch row is v2, because it cannot exist without receipt state",
    ).toBe(CHAIN_PAYLOAD_V2);
  });

  it("a receipt-FAILED row is chained as v2 with a null digest", async () => {
    const id = await agedTransaction();
    await markReceiptPending(db, id);
    await markReceiptFailed(db, id, "unmapped_rail");

    await runOnce();

    const r = await row(id);
    expect(r.integrity_hash).not.toBeNull();
    expect(Number(r.integrity_payload_version)).toBe(CHAIN_PAYLOAD_V2);
    // The chain commits to "at chain time this row had no recomputable
    // receipt" — permanently true, because failed never recovers.
    expect(r.receipt_digest).toBeNull();
  });

  it("a receipt-PENDING row is not chained, and does not block the batch", async () => {
    const pending = await youngTransaction();
    const neighbour = await agedTransaction();

    await runOnce();

    expect((await row(pending)).integrity_hash, "pending must not be chained").toBeNull();
    expect((await row(neighbour)).integrity_hash, "neighbour must still chain").not.toBeNull();
  });

  it("a pending row chains once its receipt settles, on a later tick", async () => {
    const id = await youngTransaction();
    await runOnce();
    expect((await row(id)).integrity_hash).toBeNull();

    const built = buildExecutionReceipt(
      {
        transactionId: id, subjectKind: "capability", subjectSlug: "vat-validate",
        deployCommit: "c".repeat(40), manifestDigest: await realManifestDigest(),
        steps: null, rail: "v1_do", inputs: {}, status: "completed",
        result: {}, error: null, method: "algorithmic",
        sourceObservation: { kind: "computed" },
      },
      { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    );
    if (built.outcome !== "complete") throw new Error("fixture");
    await markReceiptComplete(db, id, built);

    await runOnce();
    const r = await row(id);
    expect(r.integrity_hash).not.toBeNull();
    expect(Number(r.integrity_payload_version)).toBe(CHAIN_PAYLOAD_V2);
  });

  it("a receipt-blocked row is COUNTED, not silently excluded forever", async () => {
    // The failure mode this closes is silence. A pending-receipt row is never
    // SELECTED by the admission predicate, so the stale-row warning — which
    // counts only selected rows — cannot see it. With the retry sweeper
    // deferred to the rail PR, such a row would sit outside the chain forever
    // with nothing saying so.
    // status='executing', deliberately. Phase 5's sweeper resolves a pending
    // receipt on any SETTLED row within a minute or so, so the population this
    // counter still exists for is the row whose transaction never reached a
    // terminal status at all - wedged, and invisible to both the sweeper (no
    // final result to commit to) and the chain (nothing to hash).
    const id = randomUUID();
    txns.add(id);
    await db.execute(sql`
      INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input, created_at)
      VALUES (${id}::uuid, ${userId}::uuid, 'executing', 5, 'algorithmic', 'EU', '{}'::jsonb,
              now() - interval '20 minutes')
    `);

    const warnings: string[] = [];
    const { log } = await import("../log.js");
    const original = log.warn.bind(log);
    (log as unknown as { warn: typeof log.warn }).warn = ((obj: unknown, msg?: string) => {
      const label = (obj as { label?: string })?.label;
      if (label) warnings.push(label);
      return original(obj as never, msg as never);
    }) as typeof log.warn;

    try {
      await runOnce();
    } finally {
      (log as unknown as { warn: typeof log.warn }).warn = original;
    }

    expect(warnings).toContain("integrity-hash-receipt-blocked");
    // And it is still, correctly, not chained.
    expect((await row(id)).integrity_hash).toBeNull();
  });

  it("the sweeper leaves a transaction that has NOT settled completely alone", async () => {
    // Found by the mutation battery, not by review: removing the sweeper's
    // `status IN ('completed','failed')` filter left every test green.
    //
    // The filter matters because settle returns early for a non-terminal row -
    // there is no final result to commit to - so the sweeper would see "still
    // pending, attempts unchanged" and burn an attempt on it every tick. After
    // five ticks a transaction that is still EXECUTING would carry a terminally
    // failed receipt, claiming we could not commit to a result that had not
    // been produced yet.
    const id = randomUUID();
    txns.add(id);
    await db.execute(sql`
      INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input, created_at)
      VALUES (${id}::uuid, ${userId}::uuid, 'executing', 5, 'algorithmic', 'EU', '{}'::jsonb,
              now() - interval '20 minutes')
    `);

    // Several ticks, so an off-by-one budget would still show up.
    await runOnce();
    await runOnce();
    await runOnce();

    const r = await row(id);
    expect(r.receipt_status, "an unsettled transaction must stay pending").toBe("pending");
    expect(Number(r.receipt_attempts), "no attempt may be spent on it").toBe(0);
    expect(r.receipt_failure_reason).toBe("not_yet_built");
  });

  it("A ROW THE WORKER CANNOT UPDATE COSTS THAT ROW, NOT THE CHAIN", async () => {
    // Reviewer-found, and it is Phase 4's round-three defect in a new shape.
    //
    // `transactions_post_epoch_has_receipt` is NOT VALID, which in Postgres
    // skips the initial table scan but STILL ENFORCES ON UPDATE. So a
    // post-epoch row with a NULL receipt_status cannot be updated by anyone -
    // including this worker, which admits it (`receiptStatus IS NULL` is on
    // the admission allowlist, because that is what a legacy row looks like).
    //
    // The tick is one transaction. Before the per-row SAVEPOINT, the first
    // failing UPDATE poisoned it, every later statement raised 25P02, the
    // per-row catch swallowed the cascade, and the tick rolled back - so
    // NOTHING chained, permanently, retrying every 30 seconds.
    //
    // Such a row is hard to create by accident and trivial to create by
    // operation: `drizzle-kit push` drops the constraint, and re-adding it
    // NOT VALID does not scan for rows that already violate it. That is
    // exactly what this test does, restoring the original definition
    // afterwards so the epoch instant is not disturbed.
    const [{ def }] = (await db.execute(sql`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname = 'transactions_post_epoch_has_receipt'
    `)) as unknown as Array<{ def: string }>;
    expect(def, "the epoch constraint is missing; this test would prove nothing").toContain(
      "receipt_status IS NOT NULL",
    );

    const poison = randomUUID();
    const healthy = await agedTransaction();

    // The epoch is REPLACED for the duration, not borrowed.
    //
    // The first version inserted the poison row at `now() - 2 minutes` and
    // relied on the real epoch being older than that. True on a long-lived
    // database and false on a freshly-migrated one, where the epoch is seconds
    // old - so the row was PRE-epoch, perfectly updatable, and the test proved
    // nothing. It passed locally and failed in CI, which is the right way
    // round to find out but not a difference the test should have had.
    //
    // Substituting a deliberately old epoch makes the row post-epoch by
    // construction, independent of how old the database is. The original
    // definition is restored at the end, so the real epoch instant - which the
    // design calls the single immutable record of when enforcement began - is
    // unchanged.
    await db.execute(sql`
      ALTER TABLE transactions DROP CONSTRAINT transactions_post_epoch_has_receipt
    `);
    try {
      await db.execute(sql`
        INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                  data_jurisdiction, input, created_at, completed_at,
                                  receipt_status, receipt_failure_reason)
        VALUES (${poison}::uuid, ${userId}::uuid, 'completed', 5, 'algorithmic', 'EU',
                '{}'::jsonb, now() - interval '2 minutes', now() - interval '2 minutes',
                NULL, NULL)
      `);
      await db.execute(sql`
        ALTER TABLE transactions
          ADD CONSTRAINT transactions_post_epoch_has_receipt
          CHECK (created_at < now() - interval '10 minutes' OR receipt_status IS NOT NULL)
          NOT VALID
      `);

      // Sanity: the row really is un-updatable, or the test proves nothing.
      await expect(
        db.execute(sql`
          UPDATE transactions SET latency_ms = 1 WHERE id = ${poison}::uuid
        `),
      ).rejects.toThrow(/transactions_post_epoch_has_receipt/);

      await runOnce();

      // The property: the innocent neighbour still chained.
      const h = await row(healthy);
      expect(
        h.integrity_hash,
        "one un-updatable row stopped the whole chain - the savepoint is not working",
      ).not.toBeNull();

      // And the poison row did not chain, which is correct and expected.
      const p = await row(poison);
      expect(p.integrity_hash).toBeNull();
    } finally {
      // DELETE is permitted - the CHECK constrains INSERT and UPDATE - and the
      // real epoch definition goes back regardless of how the assertions went.
      await db.execute(sql`DELETE FROM transactions WHERE id = ${poison}::uuid`);
      await db.execute(sql`
        ALTER TABLE transactions DROP CONSTRAINT transactions_post_epoch_has_receipt
      `);
      await db.execute(
        sql.raw(
          `ALTER TABLE transactions ADD CONSTRAINT transactions_post_epoch_has_receipt ${def}`,
        ),
      );
    }
  });

  it("the worker chains a row exactly once", async () => {
    const id = await agedTransaction();
    await completeReceipt(id);
    await runOnce();
    const first = await row(id);
    await runOnce();
    const second = await row(id);
    expect(second.integrity_hash).toBe(first.integrity_hash);
    expect(second.chain_seq).toBe(first.chain_seq);
  });
});
