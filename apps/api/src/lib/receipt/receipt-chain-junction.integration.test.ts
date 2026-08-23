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
        deployCommit: "c".repeat(40), manifestDigest: `sha256:${"a".repeat(64)}`,
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
    const plainV1 = await agedTransaction();

    await runOnce();

    const a = await row(withReceipt);
    const b = await row(plainV1);
    expect(a.integrity_hash, "receipt row not chained").not.toBeNull();
    expect(b.integrity_hash, "innocent neighbour not chained").not.toBeNull();
    expect(b.integrity_payload_version, "a row with no receipt is v1").toBeNull();
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
    const pending = await agedTransaction();
    await markReceiptPending(db, pending);
    const neighbour = await agedTransaction();

    await runOnce();

    expect((await row(pending)).integrity_hash, "pending must not be chained").toBeNull();
    expect((await row(neighbour)).integrity_hash, "neighbour must still chain").not.toBeNull();
  });

  it("a pending row chains once its receipt settles, on a later tick", async () => {
    const id = await agedTransaction();
    await markReceiptPending(db, id);
    await runOnce();
    expect((await row(id)).integrity_hash).toBeNull();

    const built = buildExecutionReceipt(
      {
        transactionId: id, subjectKind: "capability", subjectSlug: "vat-validate",
        deployCommit: "c".repeat(40), manifestDigest: `sha256:${"a".repeat(64)}`,
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
    const id = randomUUID();
    txns.add(id);
    await db.execute(sql`
      INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input, created_at, completed_at)
      VALUES (${id}::uuid, ${userId}::uuid, 'completed', 5, 'algorithmic', 'EU', '{}'::jsonb,
              now() - interval '20 minutes', now() - interval '20 minutes')
    `);
    await markReceiptPending(db, id);

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
