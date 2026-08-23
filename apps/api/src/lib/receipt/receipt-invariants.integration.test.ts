/**
 * The invariants Phase 4's first cut called structural and enforced nowhere.
 *
 * An adversarial review drove 25 attacks at that tree and **every one
 * succeeded**. Each test here is one of those attacks, now refused. They are
 * separated from the main suite deliberately: that suite proves the design
 * works, this one proves the design cannot be bypassed, and the two fail for
 * different reasons.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../../test-support/integration-db.js";
import {
  normalizeCapabilityDeclaration,
  normalizeSolutionDeclaration,
  recordManifestSnapshot,
  readManifestSnapshot,
  declarationDigest,
  ManifestSnapshotError,
  type CapabilityDeclarationSource,
  type SolutionStepIdentity,
} from "./manifest-snapshot.js";
import { buildExecutionReceipt } from "./execution-receipt.js";
import {
  markReceiptComplete,
  markReceiptFailed,
  markReceiptPending,
  ReceiptLifecycleError,
} from "./receipt-lifecycle.js";
import {
  computeIntegrityHashVersioned,
  chainVersionOf,
  CHAIN_PAYLOAD_V1,
  CHAIN_PAYLOAD_V2,
} from "../integrity-hash.js";
import { runMigration0108_receiptStateInvariants } from "../startup-migrations.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const DECL: CapabilityDeclarationSource = {
  slug: "vat-validate",
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
  name: "VAT Validate",
  dataClassification: "public",
  x402Method: "POST",
  dataUpdateCycleDays: null,
  datasetLastUpdated: null,
};

const ran = (order: number, slug: string, fill: string): SolutionStepIdentity => ({
  step_order: order,
  slug,
  disposition: "ran",
  manifest_digest: `sha256:${fill.repeat(64)}`,
});

describeMaybe("Phase 4 invariants cannot be bypassed", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const txns = new Set<string>();
  let userId = "";

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);

    // RE-APPLY THE BLOCK THIS SUITE IS ABOUT.
    //
    // Without this, the triggers and constraints under test come from whatever
    // ran against the database earlier, and the migration SOURCE is not
    // load-bearing for the suite. Two mutation probes proved it: deleting the
    // already-chained guard and removing a column from the trigger's comparison
    // list both left the suite green, because the old trigger was still
    // installed. The block is idempotent (CREATE OR REPLACE, DROP/ADD
    // CONSTRAINT), so re-applying it here makes its text the thing being
    // tested.
    await runMigration0108_receiptStateInvariants(db as never);

    userId = randomUUID();
    await db.execute(sql`
      INSERT INTO users (id, email, api_key_hash, key_prefix)
      VALUES (${userId}::uuid, ${`inv-${userId}@test.local`}, ${randomUUID()}, 'sk_test_')
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

  async function txn(): Promise<string> {
    const id = randomUUID();
    txns.add(id);
    await db.execute(sql`
      INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input, completed_at)
      VALUES (${id}::uuid, ${userId}::uuid, 'completed', 5, 'algorithmic', 'EU',
              '{}'::jsonb, now())
    `);
    return id;
  }

  async function completed(id: string): Promise<string> {
    const built = buildExecutionReceipt(
      {
        transactionId: id, subjectKind: "capability", subjectSlug: "vat-validate",
        deployCommit: "c".repeat(40), manifestDigest: `sha256:${"a".repeat(64)}`,
        steps: null, rail: "v1_do", inputs: {}, status: "completed",
        result: { ok: true }, error: null, method: "algorithmic",
        sourceObservation: { kind: "computed" },
      },
      { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    );
    if (built.outcome !== "complete") throw new Error("fixture must build");
    await markReceiptPending(db, id);
    await markReceiptComplete(db, id, built);
    return built.digest;
  }

  // ── B1: chain-version authorship ─────────────────────────────────────────

  it("the lifecycle never writes integrity_payload_version", async () => {
    // The defect: all three lifecycle writers stamped v2, while the chain
    // worker hashed under v1. The row declared one rule and was hashed under
    // another — it verified only because nothing had implemented the
    // documented rule yet.
    const id = await txn();
    await markReceiptPending(db, id);
    let r = await db.execute(
      sql`SELECT integrity_payload_version AS v FROM transactions WHERE id = ${id}::uuid`,
    );
    expect((r as unknown as Array<{ v: number | null }>)[0].v).toBeNull();

    await completed(id);
    r = await db.execute(
      sql`SELECT integrity_payload_version AS v FROM transactions WHERE id = ${id}::uuid`,
    );
    expect((r as unknown as Array<{ v: number | null }>)[0].v).toBeNull();
  });

  it("a row hashed under v1 and declaring v2 is exactly what we now prevent", () => {
    // The reproduction, kept as a test so the failure mode stays legible.
    const rec = {
      id: "x", userId: "u", status: "completed", input: {}, output: {}, error: null,
      priceCents: 1, latencyMs: 1, provenance: null, auditTrail: null,
      transparencyMarker: "algorithmic", dataJurisdiction: "EU",
      createdAt: "2026-08-23T09:00:00.000Z", completedAt: "2026-08-23T09:00:01.000Z",
      receiptDigest: `sha256:${"a".repeat(64)}`,
    };
    const hashedUnderV1 = computeIntegrityHashVersioned(rec, "prev", CHAIN_PAYLOAD_V1);
    const verifiedAsV2 = computeIntegrityHashVersioned(rec, "prev", CHAIN_PAYLOAD_V2);
    expect(verifiedAsV2).not.toBe(hashedUnderV1);
  });

  it("chainVersionOf fails closed on a version it does not know", () => {
    expect(() => chainVersionOf(3)).toThrow(/unknown integrity_payload_version/);
    expect(() => chainVersionOf(0)).toThrow();
    expect(chainVersionOf(null)).toBe(CHAIN_PAYLOAD_V1);
    expect(chainVersionOf(2)).toBe(CHAIN_PAYLOAD_V2);
  });

  // ── B3: legal transitions ────────────────────────────────────────────────

  it("complete is absorbing — it cannot go back to pending or on to failed", async () => {
    const id = await txn();
    await completed(id);

    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_status = 'pending', receipt_failure_reason = 'internal_error'
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/terminal/i);

    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_status = 'failed', receipt_failure_reason = 'internal_error'
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/terminal/i);
  });

  it("failed is absorbing — a late success cannot resurrect it", async () => {
    const id = await txn();
    await markReceiptPending(db, id);
    await markReceiptFailed(db, id, "unmapped_rail");

    // Through the module: refused, because the guard requires 'pending'.
    await expect(completed(id)).rejects.toThrow(ReceiptLifecycleError);

    // And bypassing the module: refused by the database.
    await expect(
      db.execute(sql`
        UPDATE transactions
           SET receipt_status = 'complete', receipt_digest = ${`sha256:${"9".repeat(64)}`},
               receipt_version = 'strale.execution.v1', receipt_canonicalization = 'RFC8785',
               receipt_digest_alg = 'sha256'
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/terminal/i);
  });

  it("a complete row's digest cannot be swapped", async () => {
    const id = await txn();
    await completed(id);
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_digest = ${`sha256:${"e".repeat(64)}`}
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/terminal/i);
  });

  it("receipt metadata cannot be rewritten to something we never produce", async () => {
    const id = await txn();
    await markReceiptPending(db, id);
    // Even on a pending row, garbage metadata is refused by CHECK.
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_version = 'fake.v9' WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/transactions_receipt_metadata_known/);
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_digest_alg = 'md5' WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/transactions_receipt_metadata_known/);
  });

  it("reason codes are a closed set", async () => {
    const id = await txn();
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_status = 'failed', receipt_failure_reason = 'banana'
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/transactions_receipt_reason_closed/);
  });

  it("post-epoch state cannot be cleared back to looking pre-epoch", async () => {
    const id = await txn();
    await markReceiptPending(db, id);
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_status = NULL, receipt_failure_reason = NULL
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/pre-epoch/i);
  });

  it("a lifecycle write against a missing row is an error, not a silent no-op", async () => {
    await expect(markReceiptPending(db, randomUUID())).rejects.toThrow(ReceiptLifecycleError);
  });

  it("pending is not a failure, so monitoring is not poisoned at birth", async () => {
    const id = await txn();
    await markReceiptPending(db, id);
    const r = await db.execute(
      sql`SELECT receipt_failure_reason AS reason FROM transactions WHERE id = ${id}::uuid`,
    );
    expect((r as unknown as Array<{ reason: string }>)[0].reason).toBe("not_yet_built");
  });

  // ── R2-B1: the dual of the admission rule ────────────────────────────────

  it("a row already chained cannot acquire receipt state afterwards", async () => {
    // Barring a row from the chain until its receipt settles is only half the
    // property. A row chained under v1 — which is EVERY row today — could
    // receive a complete receipt afterwards and keep its v1 hash, so the digest
    // was never anchored. It verifies, under a rule that does not cover the
    // receipt, and "a receipt digest cannot be swapped without invalidating the
    // chain" is silently false for it.
    const id = await txn();
    await db.execute(sql`
      UPDATE transactions
         SET integrity_hash = ${"9".repeat(64)}, previous_hash = ${"8".repeat(64)},
             compliance_hash_state = 'complete'
       WHERE id = ${id}::uuid
    `);

    await expect(markReceiptPending(db, id)).rejects.toThrow(ReceiptLifecycleError);
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_status = 'pending', receipt_failure_reason = 'not_yet_built'
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/already chained/);
  });

  it("an unchained row still accepts receipt state normally", async () => {
    const id = await txn();
    await markReceiptPending(db, id);
    const r = await db.execute(
      sql`SELECT receipt_status AS s FROM transactions WHERE id = ${id}::uuid`,
    );
    expect((r as unknown as Array<{ s: string }>)[0].s).toBe("pending");
  });

  // ── R2-B1 continued: every receipt-shaped column is compared ─────────────

  it("receipt_manifest_digest cannot be swapped on a complete row", async () => {
    // It is how a verifier finds the snapshot to recompute the implementation
    // identity, and it is NOT inside the chain payload — so a swap was neither
    // refused here nor detectable there.
    const id = await txn();
    await completed(id);
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_manifest_digest = ${`sha256:${"c".repeat(64)}`}
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/terminal/i);
  });

  it("a failure reason cannot be stamped onto a complete row", async () => {
    const id = await txn();
    await completed(id);
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_failure_reason = 'unmapped_rail' WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/terminal/i);
  });

  it("the chain version is WRITE-ONCE, not frozen-on-terminal", async () => {
    // Semantics that matter: the worker sets this exactly once, in the same
    // UPDATE as the hash — and it does so on a row whose receipt is ALREADY
    // terminal, because the admission rule requires that. So "frozen on a
    // terminal row" would block the only legitimate writer, which is precisely
    // the defect this round fixed. Write-once is the correct rule.
    const id = await txn();
    await completed(id);

    // First write, from NULL: allowed, even though the receipt is terminal.
    await db.execute(
      sql`UPDATE transactions SET integrity_payload_version = 2 WHERE id = ${id}::uuid`,
    );

    // Any later change: refused, in both directions.
    await expect(
      db.execute(
        sql`UPDATE transactions SET integrity_payload_version = NULL WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/cannot be rewritten/);
  });

  // ── R2-B3: the BUILDER enforces step rules, not only the snapshot ────────

  it("the receipt builder refuses malformed steps, not just the normalizer", () => {
    const bad: Array<[string, SolutionStepIdentity[]]> = [
      ["duplicate order", [ran(1, "a", "1"), { ...ran(1, "b", "2") }]],
      ["zero order", [{ ...ran(0, "a", "1") }]],
      ["negative order", [{ ...ran(-3, "a", "1") }]],
      ["fractional order", [{ ...ran(2.5, "a", "1") }]],
      ["empty", []],
    ];
    for (const [label, steps] of bad) {
      const r = buildExecutionReceipt(
        {
          transactionId: "t", subjectKind: "solution", subjectSlug: "kyb",
          deployCommit: "c".repeat(40), manifestDigest: `sha256:${"a".repeat(64)}`,
          steps, rail: "v1_do", inputs: {}, status: "completed",
          result: {}, error: null, method: "algorithmic",
          sourceObservation: { kind: "computed" },
        },
        { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      );
      expect(r.outcome, `${label} should refuse`).toBe("failed");
      if (r.outcome === "failed") expect(r.reason).toBe("unresolvable_manifest");
    }
  });

  it("skipped and unresolved produce DIFFERENT receipt digests", () => {
    // The snapshot distinguished them; the receipt did not, and the receipt is
    // the artifact the customer holds and the chain anchors.
    function digestFor(disposition: "skipped" | "unresolved"): string {
      const r = buildExecutionReceipt(
        {
          transactionId: "t", subjectKind: "solution", subjectSlug: "kyb",
          deployCommit: "c".repeat(40), manifestDigest: `sha256:${"a".repeat(64)}`,
          steps: [ran(1, "a", "1"), { step_order: 2, slug: "b", disposition, manifest_digest: null }],
          rail: "v1_do", inputs: {}, status: "completed", result: {}, error: null,
          method: "algorithmic", sourceObservation: { kind: "computed" },
        },
        { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      );
      if (r.outcome !== "complete") throw new Error(`expected complete, got ${r.reason}`);
      return r.digest;
    }
    expect(digestFor("unresolved")).not.toBe(digestFor("skipped"));
  });

  // ── B5: content addressing ───────────────────────────────────────────────

  it("a mis-addressed snapshot is refused on read, not returned", async () => {
    // The attack: bypass the module and pair a wrong digest with real content.
    const decl = normalizeCapabilityDeclaration(DECL);
    const wrong = `sha256:${"1".repeat(64)}`;
    expect(declarationDigest(decl)).not.toBe(wrong);

    await db.execute(sql`
      INSERT INTO execution_manifest_snapshots (digest, subject_kind, subject_slug, snapshot)
      VALUES (${wrong}, 'capability', ${decl.slug as string}, ${JSON.stringify(decl)}::jsonb)
      ON CONFLICT (digest) DO NOTHING
    `);

    await expect(readManifestSnapshot(db, wrong)).rejects.toThrow(/mis-addressed/);
  });

  it("subject columns cannot disagree with the hashed content", async () => {
    const decl = normalizeCapabilityDeclaration(DECL);
    await expect(
      db.execute(sql`
        INSERT INTO execution_manifest_snapshots (digest, subject_kind, subject_slug, snapshot)
        VALUES (${`sha256:${"2".repeat(64)}`}, 'solution', 'a-different-slug',
                ${JSON.stringify(decl)}::jsonb)
      `),
    ).rejects.toThrow(/subject_matches_content/);
  });

  it("a snapshot with no subject keys at all is refused", async () => {
    // `col = snapshot->>'k'` is NULL when the key is absent, and a CHECK passes
    // on NULL — so this was accepted under any slug until the key-presence
    // tests were added.
    await expect(
      db.execute(sql`
        INSERT INTO execution_manifest_snapshots (digest, subject_kind, subject_slug, snapshot)
        VALUES (${`sha256:${"7".repeat(64)}`}, 'capability', 'anything-i-like',
                '{"no_subject_keys":1}'::jsonb)
      `),
    ).rejects.toThrow(/subject_matches_content/);
  });

  it("each subject key is checked independently", async () => {
    // The first version of this test used a snapshot missing BOTH keys, so
    // either half of the CHECK caught it and neither half was load-bearing —
    // a mutation removing one stayed green. One key present, one absent.
    for (const [label, body] of [
      ["slug present, kind absent", '{"slug":"vat-validate"}'],
      ["kind present, slug absent", '{"subject_kind":"capability"}'],
    ] as const) {
      await expect(
        db.execute(sql`
          INSERT INTO execution_manifest_snapshots (digest, subject_kind, subject_slug, snapshot)
          VALUES (${`sha256:${Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)}`},
                  'capability', 'vat-validate', ${body}::jsonb)
        `),
        label,
      ).rejects.toThrow(/subject_matches_content/);
    }
  });

  it("a correctly addressed snapshot still round-trips", async () => {
    const decl = normalizeCapabilityDeclaration(DECL);
    const digest = await recordManifestSnapshot(db, decl);
    expect(await readManifestSnapshot(db, digest)).toEqual(decl);
  });

  // ── B6: one reading per solution receipt ─────────────────────────────────

  it("duplicate step_order is refused, so array position is never load-bearing", () => {
    expect(() =>
      normalizeSolutionDeclaration({
        slug: "kyb",
        steps: [ran(1, "x", "1"), { ...ran(1, "y", "2") }],
      }),
    ).toThrow(ManifestSnapshotError);
  });

  it("non-positive and non-integer step_order are refused", () => {
    for (const bad of [-3, 0, 2.5]) {
      expect(() =>
        normalizeSolutionDeclaration({ slug: "kyb", steps: [{ ...ran(bad, "x", "1") }] }),
      ).toThrow(/positive integer/);
    }
  });

  it("a solution with no steps is refused", () => {
    expect(() => normalizeSolutionDeclaration({ slug: "kyb", steps: [] })).toThrow(
      /a solution is its steps/,
    );
  });

  it("skipped and unresolved are DIFFERENT receipts", () => {
    // The ambiguity: a null digest used to mean both, so the two produced an
    // identical digest and a receipt had two readings.
    const skipped = normalizeSolutionDeclaration({
      slug: "kyb",
      steps: [ran(1, "a", "1"), { step_order: 2, slug: "b", disposition: "skipped", manifest_digest: null }],
    });
    const unresolved = normalizeSolutionDeclaration({
      slug: "kyb",
      steps: [ran(1, "a", "1"), { step_order: 2, slug: "b", disposition: "unresolved", manifest_digest: null }],
    });
    expect(declarationDigest(unresolved)).not.toBe(declarationDigest(skipped));
  });

  it("a disposition and its digest must agree", () => {
    expect(() =>
      normalizeSolutionDeclaration({
        slug: "kyb",
        steps: [{ step_order: 1, slug: "a", disposition: "ran", manifest_digest: null }],
      }),
    ).toThrow(/ran but carries no manifest digest/);

    expect(() =>
      normalizeSolutionDeclaration({
        slug: "kyb",
        steps: [{ step_order: 1, slug: "a", disposition: "skipped", manifest_digest: `sha256:${"1".repeat(64)}` }],
      }),
    ).toThrow(/only a step that ran has one/);
  });

  it("the same steps in a different array order still agree, now that order is unique", () => {
    const a = declarationDigest(
      normalizeSolutionDeclaration({ slug: "kyb", steps: [ran(1, "a", "1"), ran(2, "b", "2")] }),
    );
    const b = declarationDigest(
      normalizeSolutionDeclaration({ slug: "kyb", steps: [ran(2, "b", "2"), ran(1, "a", "1")] }),
    );
    expect(b).toBe(a);
  });

  // ── N3: permanence ───────────────────────────────────────────────────────

  it("TRUNCATE cannot empty the snapshot table", async () => {
    await recordManifestSnapshot(db, normalizeCapabilityDeclaration(DECL));
    // Row-level DELETE triggers do not fire for TRUNCATE; a statement-level
    // BEFORE TRUNCATE trigger is what closes it.
    await expect(
      db.execute(sql`TRUNCATE execution_manifest_snapshots`),
    ).rejects.toThrow(/cannot be truncated/);

    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM execution_manifest_snapshots`,
    );
    expect(Number((rows as unknown as Array<{ n: number }>)[0].n)).toBeGreaterThan(0);
  });
});
