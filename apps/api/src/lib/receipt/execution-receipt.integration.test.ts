/**
 * Phase 4 against a real Postgres — the properties from §H.
 *
 * Real rows because every load-bearing property here is a property of the
 * database: a trigger that refuses UPDATE, a CHECK that refuses a 'complete'
 * row with no digest, an `ON CONFLICT` that deduplicates by digest. A mocked
 * db module would assert the shape of a query and prove none of it.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

import { useTestDatabase } from "../../test-support/integration-db.js";
import {
  normalizeCapabilityDeclaration,
  normalizeSolutionDeclaration,
  recordManifestSnapshot,
  readManifestSnapshot,
  declarationDigest,
  declarationCanonicalBytes,
  type CapabilityDeclarationSource,
} from "./manifest-snapshot.js";
import {
  buildExecutionReceipt,
  LOCAL_BUILD_SENTINEL,
  type ReceiptInput,
} from "./execution-receipt.js";
import {
  markReceiptComplete,
  markReceiptFailed,
  markReceiptPending,
  selectPendingReceipts,
  receiptHealthCounts,
  describeReceiptState,
} from "./receipt-lifecycle.js";
import {
  computeIntegrityHashVersioned,
  CHAIN_PAYLOAD_V1,
  CHAIN_PAYLOAD_V2,
  chainVersionOf,
  type IntegrityHashRecord,
} from "../integrity-hash.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const BASE_DECL: CapabilityDeclarationSource = {
  slug: "vat-validate",
  inputSchema: { type: "object", properties: { vat_number: { type: "string" } } },
  outputSchema: { type: "object", properties: { valid: { type: "boolean" } } },
  transparencyTag: "algorithmic",
  dataSource: "VIES",
  capabilityType: "stable_api",
  freshnessCategory: "live-fetch",
  outputFieldReliability: { valid: "guaranteed" },
  processesPersonalData: false,
  personalDataCategories: [],
  gdprArt22Classification: "data_lookup",
};

function baseReceipt(overrides: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    transactionId: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
    subjectKind: "capability",
    subjectSlug: "vat-validate",
    deployCommit: "ce5e63f091863f56764829b498525211cd2ab234",
    manifestDigest: `sha256:${"a".repeat(64)}`,
    steps: null,
    rail: "v1_do",
    inputs: { vat_number: "SE556677889901" },
    status: "completed",
    result: { valid: true },
    error: null,
    method: "algorithmic",
    sourceObservation: { kind: "live_fetch", observed_at: "2026-08-23T09:14:50.311Z" },
    ...overrides,
  };
}

function digestOf(input: ReceiptInput): string {
  const r = buildExecutionReceipt(input, { NODE_ENV: "test" } as NodeJS.ProcessEnv);
  if (r.outcome !== "complete") throw new Error(`expected complete, got ${r.reason}`);
  return r.digest;
}

describeMaybe("execution receipts against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  const snapshots = new Set<string>();
  const txns = new Set<string>();
  let userId = "";

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);
    userId = randomUUID();
    await db.execute(sql`
      INSERT INTO users (id, email, api_key_hash, key_prefix)
      VALUES (${userId}::uuid, ${`receipt-${userId}@test.local`}, ${randomUUID()}, 'sk_test_')
    `);
  });

  afterAll(async () => {
    for (const id of txns) await db.execute(sql`DELETE FROM transactions WHERE id = ${id}::uuid`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}::uuid`);
    // Snapshots cannot be deleted — that is the point. They are left behind,
    // which is correct: a real deployment never removes them either.
    await client.end();
  });

  afterEach(async () => {
    for (const id of txns) await db.execute(sql`DELETE FROM transactions WHERE id = ${id}::uuid`);
    txns.clear();
  });

  async function newTransaction(): Promise<string> {
    const id = randomUUID();
    txns.add(id);
    await db.execute(sql`
      INSERT INTO transactions (id, user_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input)
      VALUES (${id}::uuid, ${userId}::uuid, 'completed', 5, 'algorithmic', 'EU', '{}'::jsonb)
    `);
    return id;
  }

  async function store(decl: Record<string, unknown>): Promise<string> {
    const d = await recordManifestSnapshot(db, decl);
    snapshots.add(d);
    return d;
  }

  // ── A. Manifest snapshot authority ───────────────────────────────────────

  it("identical declarations deduplicate to exactly one snapshot", async () => {
    const decl = normalizeCapabilityDeclaration(BASE_DECL);
    const first = await store(decl);
    const second = await store({ ...decl }); // different object, same content
    expect(second).toBe(first);

    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM execution_manifest_snapshots WHERE digest = ${first}`,
    );
    expect(Number((rows as unknown as Array<{ n: number }>)[0].n)).toBe(1);
  });

  it("changing any EXECUTION-RELEVANT declaration field changes the digest", async () => {
    const base = declarationDigest(normalizeCapabilityDeclaration(BASE_DECL));
    const mutations: Array<[string, Partial<CapabilityDeclarationSource>]> = [
      ["slug", { slug: "iban-validate" }],
      ["input_schema", { inputSchema: { type: "object", properties: { other: {} } } }],
      ["output_schema", { outputSchema: { type: "object", properties: { other: {} } } }],
      ["transparency_tag", { transparencyTag: "ai_generated" }],
      ["data_source", { dataSource: "Some Other Registry" }],
      ["capability_type", { capabilityType: "scraping" }],
      ["freshness_category", { freshnessCategory: "reference-data" }],
      ["output_field_reliability", { outputFieldReliability: { valid: "common" } }],
      ["processes_personal_data", { processesPersonalData: true }],
      ["personal_data_categories", { personalDataCategories: ["name"] }],
      ["gdpr_art_22_classification", { gdprArt22Classification: "screening_signal" }],
    ];
    for (const [label, patch] of mutations) {
      const moved = declarationDigest(normalizeCapabilityDeclaration({ ...BASE_DECL, ...patch }));
      expect(moved, `${label} did not move the digest`).not.toBe(base);
    }
  });

  it("changing sale/listing metadata the spec EXCLUDES does not change the digest", async () => {
    // The rule: if it changes what a correct execution produces, it is in. If
    // it changes only how the capability is sold, listed or measured, it is
    // out. These are all "out", and the normalizer never reads them — proven
    // by handing them to it and getting the same digest.
    const base = declarationDigest(normalizeCapabilityDeclaration(BASE_DECL));
    const withNoise = {
      ...BASE_DECL,
      // Fields that exist on the capabilities row but are deliberately not
      // part of the declaration.
      isActive: false,
      x402Enabled: true,
      visible: false,
      lifecycleState: "deactivated",
      priceCents: 999,
      avgLatencyMs: 12345,
      description: "a completely rewritten description",
      name: "Renamed Capability",
    } as unknown as CapabilityDeclarationSource;
    expect(declarationDigest(normalizeCapabilityDeclaration(withNoise))).toBe(base);
  });

  it("a stored snapshot cannot be UPDATED", async () => {
    const digest = await store(normalizeCapabilityDeclaration(BASE_DECL));
    await expect(
      db.execute(sql`
        UPDATE execution_manifest_snapshots SET snapshot = '{"tampered":true}'::jsonb
         WHERE digest = ${digest}
      `),
    ).rejects.toThrow(/insert-only/i);

    // And the content is genuinely unchanged, not merely the statement refused.
    const back = await readManifestSnapshot(db, digest);
    expect((back as Record<string, unknown>).slug).toBe("vat-validate");
  });

  it("a stored snapshot cannot be DELETED, so retention cannot silently remove it", async () => {
    const digest = await store(normalizeCapabilityDeclaration(BASE_DECL));
    await expect(
      db.execute(sql`DELETE FROM execution_manifest_snapshots WHERE digest = ${digest}`),
    ).rejects.toThrow(/insert-only/i);
    expect(await readManifestSnapshot(db, digest)).not.toBeNull();
  });

  it("a blanket DELETE — what generic retention would issue — is refused too", async () => {
    await store(normalizeCapabilityDeclaration(BASE_DECL));
    await expect(
      db.execute(sql`DELETE FROM execution_manifest_snapshots WHERE first_seen_at < now()`),
    ).rejects.toThrow(/insert-only/i);
  });

  it("db-retention.ts does not, and must never, list this table", async () => {
    // The trigger is the real defence; this is the second one, because the
    // failure it prevents is silent and permanent. If someone adds the table
    // to the retention rules, they meet this test before production meets the
    // trigger.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(import.meta.dirname, "..", "..", "jobs", "db-retention.ts"),
      "utf8",
    );
    expect(src).not.toContain("execution_manifest_snapshots");
  });

  it("the snapshot round-trips, so a receipt stays recomputable years later", async () => {
    const decl = normalizeCapabilityDeclaration(BASE_DECL);
    const digest = await store(decl);
    const back = await readManifestSnapshot(db, digest);
    expect(back).toEqual(decl);
    // And the digest is reproducible from what was stored.
    expect(declarationDigest(back as Record<string, unknown>)).toBe(digest);
    expect(declarationCanonicalBytes(back as Record<string, unknown>)).toBe(
      declarationCanonicalBytes(decl),
    );
  });

  it("a mutation to the CURRENT capability row cannot rewrite an old receipt's meaning", async () => {
    // The whole reason snapshots exist. Execution happens under declaration A;
    // the capabilities row later changes to B; the receipt must still resolve
    // to A's bytes.
    const declA = normalizeCapabilityDeclaration(BASE_DECL);
    const digestA = await store(declA);

    const declB = normalizeCapabilityDeclaration({ ...BASE_DECL, transparencyTag: "ai_generated" });
    const digestB = await store(declB);
    expect(digestB).not.toBe(digestA);

    // The old digest still resolves to the old bytes.
    const back = await readManifestSnapshot(db, digestA);
    expect((back as Record<string, unknown>).transparency_tag).toBe("algorithmic");
  });

  // ── Solutions ────────────────────────────────────────────────────────────

  it("solution identity binds ordered step identities, so swapping a step moves the digest", async () => {
    const stepA = { step_order: 1, slug: "vat-validate", disposition: "ran" as const, manifest_digest: `sha256:${"1".repeat(64)}` };
    const stepB = { step_order: 2, slug: "sanctions-check", disposition: "ran" as const, manifest_digest: `sha256:${"2".repeat(64)}` };

    const base = declarationDigest(
      normalizeSolutionDeclaration({ slug: "kyb-essentials-se", steps: [stepA, stepB] }),
    );

    // Same slugs, different step ORDER.
    const reordered = declarationDigest(
      normalizeSolutionDeclaration({
        slug: "kyb-essentials-se",
        steps: [
          { ...stepA, step_order: 2 },
          { ...stepB, step_order: 1 },
        ],
      }),
    );
    expect(reordered).not.toBe(base);

    // Same slugs and order, one step's IMPLEMENTATION changed.
    const reimplemented = declarationDigest(
      normalizeSolutionDeclaration({
        slug: "kyb-essentials-se",
        steps: [stepA, { ...stepB, manifest_digest: `sha256:${"3".repeat(64)}` }],
      }),
    );
    expect(reimplemented).not.toBe(base);
  });

  it("a skipped step is represented explicitly, not omitted", async () => {
    const withSkip = normalizeSolutionDeclaration({
      slug: "kyb-essentials-se",
      steps: [
        { step_order: 1, slug: "vat-validate", disposition: "ran" as const, manifest_digest: `sha256:${"1".repeat(64)}` },
        { step_order: 2, slug: "sanctions-check", disposition: "skipped" as const, manifest_digest: null },
      ],
    });
    const omitted = normalizeSolutionDeclaration({
      slug: "kyb-essentials-se",
      steps: [{ step_order: 1, slug: "vat-validate", disposition: "ran" as const, manifest_digest: `sha256:${"1".repeat(64)}` }],
    });
    // Omitting the step would let two different executions share a shape.
    expect(declarationDigest(withSkip)).not.toBe(declarationDigest(omitted));
    expect((withSkip.steps as unknown[]).length).toBe(2);
  });

  // ── B. The receipt builder ───────────────────────────────────────────────

  it("changing the input changes the receipt digest", () => {
    expect(digestOf(baseReceipt({ inputs: { vat_number: "SE999999999999" } }))).not.toBe(
      digestOf(baseReceipt()),
    );
  });

  it("changing the caller-visible result changes the receipt digest", () => {
    expect(digestOf(baseReceipt({ result: { valid: false } }))).not.toBe(digestOf(baseReceipt()));
  });

  it("changing the caller-visible error changes the receipt digest", () => {
    const failed = baseReceipt({
      status: "failed",
      result: null,
      error: { code: "invalid_input", message: "vat_number is malformed" },
    });
    const other = baseReceipt({
      status: "failed",
      result: null,
      error: { code: "invalid_input", message: "vat_number is empty" },
    });
    expect(digestOf(other)).not.toBe(digestOf(failed));
    // And a failure is genuinely a different receipt from a success.
    expect(digestOf(failed)).not.toBe(digestOf(baseReceipt()));
  });

  it("changing the deploy commit changes the receipt digest", () => {
    expect(
      digestOf(baseReceipt({ deployCommit: "0".repeat(40) })),
    ).not.toBe(digestOf(baseReceipt()));
  });

  it("changing the manifest digest changes the receipt digest", () => {
    expect(digestOf(baseReceipt({ manifestDigest: `sha256:${"b".repeat(64)}` }))).not.toBe(
      digestOf(baseReceipt()),
    );
  });

  it("changing the rail, method or source observation changes the receipt digest", () => {
    const base = digestOf(baseReceipt());
    expect(digestOf(baseReceipt({ rail: "x402" }))).not.toBe(base);
    expect(digestOf(baseReceipt({ method: "ai_generated" }))).not.toBe(base);
    expect(digestOf(baseReceipt({ sourceObservation: { kind: "computed" } }))).not.toBe(base);
    // none_declared must be distinguishable from computed.
    expect(digestOf(baseReceipt({ sourceObservation: { kind: "none_declared" } }))).not.toBe(
      digestOf(baseReceipt({ sourceObservation: { kind: "computed" } })),
    );
  });

  it("changing solution step order or identity changes the receipt digest", () => {
    const s1 = { step_order: 1, slug: "a", disposition: "ran" as const, manifest_digest: `sha256:${"1".repeat(64)}` };
    const s2 = { step_order: 2, slug: "b", disposition: "ran" as const, manifest_digest: `sha256:${"2".repeat(64)}` };
    const sol = baseReceipt({ subjectKind: "solution", subjectSlug: "kyb-essentials-se", steps: [s1, s2] });
    const base = digestOf(sol);

    expect(
      digestOf(baseReceipt({
        subjectKind: "solution", subjectSlug: "kyb-essentials-se",
        steps: [{ ...s1, step_order: 2 }, { ...s2, step_order: 1 }],
      })),
    ).not.toBe(base);

    expect(
      digestOf(baseReceipt({
        subjectKind: "solution", subjectSlug: "kyb-essentials-se",
        steps: [s1, { ...s2, manifest_digest: `sha256:${"9".repeat(64)}` }],
      })),
    ).not.toBe(base);
  });

  it("the same steps in a different ARRAY order produce the SAME digest", () => {
    // This is what isolates the sort. The reordering test above changes
    // step_order values, so the digest moves whether or not the builder sorts
    // — it passed for the wrong reason and the mutation battery caught it.
    //
    // Here step_order is IDENTICAL and only the array order differs. Sorted,
    // the two are the same computation and must agree. Unsorted, they do not.
    const s1 = { step_order: 1, slug: "a", disposition: "ran" as const, manifest_digest: `sha256:${"1".repeat(64)}` };
    const s2 = { step_order: 2, slug: "b", disposition: "ran" as const, manifest_digest: `sha256:${"2".repeat(64)}` };

    const inOrder = digestOf(
      baseReceipt({ subjectKind: "solution", subjectSlug: "kyb", steps: [s1, s2] }),
    );
    const shuffled = digestOf(
      baseReceipt({ subjectKind: "solution", subjectSlug: "kyb", steps: [s2, s1] }),
    );
    expect(shuffled).toBe(inOrder);
  });

  it("call-site key insertion order cannot change the receipt digest", () => {
    const forward = baseReceipt({ inputs: { a: 1, b: 2 } });
    const backward = baseReceipt({ inputs: JSON.parse('{"b":2,"a":1}') });
    expect(digestOf(backward)).toBe(digestOf(forward));
  });

  it("an incomplete fixed point REFUSES rather than omitting a member", () => {
    const cases: Array<[string, Partial<ReceiptInput>, string]> = [
      ["unknown rail", { rail: "graphql" }, "unmapped_rail"],
      ["missing subject", { subjectSlug: "" }, "missing_subject"],
      ["missing manifest digest", { manifestDigest: null }, "unresolvable_manifest"],
      ["missing deploy identity", { deployCommit: null }, "missing_deploy_identity"],
      ["solution without steps", { subjectKind: "solution", steps: null }, "unresolvable_manifest"],
      ["capability WITH steps", { steps: [] }, "internal_error"],
      ["failed without an error", { status: "failed", result: null, error: null }, "internal_error"],
    ];
    for (const [label, patch, reason] of cases) {
      const r = buildExecutionReceipt(baseReceipt(patch), { NODE_ENV: "test" } as NodeJS.ProcessEnv);
      expect(r.outcome, `${label} should refuse`).toBe("failed");
      if (r.outcome === "failed") expect(r.reason, label).toBe(reason);
    }
  });

  it("production refuses a receipt without a full 40-hex deploy commit", () => {
    const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    for (const bad of [null, LOCAL_BUILD_SENTINEL, "ce5e63f09186", "ce5e63f091863f56764829b498525211cd2ab23Z"]) {
      const r = buildExecutionReceipt(baseReceipt({ deployCommit: bad }), prod);
      expect(r.outcome).toBe("failed");
      if (r.outcome === "failed") expect(r.reason).toBe("missing_deploy_identity");
    }
    expect(buildExecutionReceipt(baseReceipt(), prod).outcome).toBe("complete");
  });

  it("the digest is the full 256 bits, over the exact canonical bytes", () => {
    const r = buildExecutionReceipt(baseReceipt(), { NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(r.outcome).toBe("complete");
    if (r.outcome !== "complete") return;

    expect(r.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Recomputed the way an independent verifier would, from the published rule.
    const independent = createHash("sha256")
      .update(
        Buffer.concat([
          Buffer.from("strale.execution.v1", "utf8"),
          Buffer.from([0x00]),
          r.canonicalBytes,
        ]),
      )
      .digest("hex");
    expect(r.digest).toBe(`sha256:${independent}`);
  });

  // ── C. Lifecycle ─────────────────────────────────────────────────────────

  it("a successful execution whose receipt FAILED is not recorded as complete", async () => {
    const id = await newTransaction();
    await markReceiptPending(db, id);
    const { status } = await markReceiptFailed(db, id, "unmapped_rail");
    expect(status).toBe("failed");

    const rows = await db.execute(sql`
      SELECT status, receipt_status, receipt_failure_reason, receipt_digest
        FROM transactions WHERE id = ${id}::uuid
    `);
    const row = (rows as unknown as Array<Record<string, unknown>>)[0];
    // The business execution still succeeded and is still billable.
    expect(row.status).toBe("completed");
    // The receipt state says otherwise, visibly.
    expect(row.receipt_status).toBe("failed");
    expect(row.receipt_failure_reason).toBe("unmapped_rail");
    expect(row.receipt_digest).toBeNull();
  });

  it("a COMPLETE receipt cannot be withdrawn — complete is absorbing", async () => {
    // The previous test asserts receipt_digest is null after a failure — but
    // that row never had a digest, so it was null either way. The mutation
    // battery caught it. This one sets a real complete receipt FIRST, so the
    // clearing has something to clear.
    const id = await newTransaction();
    const built = buildExecutionReceipt(baseReceipt({ transactionId: id }), {
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);
    if (built.outcome !== "complete") throw new Error("fixture must build");
    await markReceiptPending(db, id);
    await markReceiptComplete(db, id, built);

    const before = await db.execute(
      sql`SELECT receipt_digest FROM transactions WHERE id = ${id}::uuid`,
    );
    expect((before as unknown as Array<Record<string, unknown>>)[0].receipt_digest).toBe(
      built.digest,
    );

    // complete is absorbing now, so a late failure is REFUSED rather than
    // clearing the digest. That is the stronger guarantee: an anchored receipt
    // cannot be withdrawn.
    await expect(markReceiptFailed(db, id, "unresolvable_manifest")).rejects.toThrow();

    const after = await db.execute(sql`
      SELECT receipt_status, receipt_digest, receipt_version, receipt_canonicalization,
             receipt_digest_alg
        FROM transactions WHERE id = ${id}::uuid
    `);
    const row = (after as unknown as Array<Record<string, unknown>>)[0];
    expect(row.receipt_status).toBe("complete");
    expect(row.receipt_digest).toBe(built.digest);
  });

  it("the database refuses a 'complete' receipt with no digest", async () => {
    const id = await newTransaction();
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_status = 'complete' WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/transactions_receipt_complete_is_complete/);
  });

  it("the database refuses a pending/failed row with no reason", async () => {
    const id = await newTransaction();
    await expect(
      db.execute(sql`
        UPDATE transactions SET receipt_status = 'failed' WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/transactions_receipt_reason_required/);
  });

  it("the database refuses a truncated receipt digest", async () => {
    const id = await newTransaction();
    await expect(
      db.execute(sql`
        UPDATE transactions
           SET receipt_status = 'complete', receipt_digest = 'sha256:abc',
               receipt_version = 'strale.execution.v1', receipt_canonicalization = 'RFC8785',
               receipt_digest_alg = 'sha256'
         WHERE id = ${id}::uuid
      `),
    ).rejects.toThrow(/transactions_receipt_digest_shape/);
  });

  it("a retryable reason stays pending and is picked up; a terminal one does not", async () => {
    const retryable = await newTransaction();
    await markReceiptPending(db, retryable);
    const r1 = await markReceiptFailed(db, retryable, "snapshot_write_failed");
    expect(r1.status).toBe("pending");
    expect(r1.attempts).toBe(1);

    const terminal = await newTransaction();
    await markReceiptPending(db, terminal);
    const t1 = await markReceiptFailed(db, terminal, "unresolvable_manifest");
    expect(t1.status).toBe("failed");

    const pending = await selectPendingReceipts(db, 100);
    const ids = pending.map((p) => p.id);
    expect(ids).toContain(retryable);
    expect(ids).not.toContain(terminal);
  });

  it("a retryable reason becomes failed once the attempt budget is spent", async () => {
    const id = await newTransaction();
    await markReceiptPending(db, id);
    let last = { status: "pending" as string, attempts: 0 };
    for (let i = 0; i < 5; i++) last = await markReceiptFailed(db, id, "snapshot_write_failed");
    expect(last.status).toBe("failed");
    expect(last.attempts).toBe(5);
    // Exhaustion is visible, not a stall.
    expect((await selectPendingReceipts(db, 100)).map((p) => p.id)).not.toContain(id);
  });

  it("monitoring can see pending and failed receipts by reason", async () => {
    const a = await newTransaction();
    const b = await newTransaction();
    await markReceiptPending(db, a);
    await markReceiptFailed(db, a, "snapshot_write_failed");
    await markReceiptPending(db, b);
    await markReceiptFailed(db, b, "unmapped_rail");

    const counts = await receiptHealthCounts(db);
    expect(counts.some((c) => c.status === "pending" && c.reason === "snapshot_write_failed")).toBe(true);
    expect(counts.some((c) => c.status === "failed" && c.reason === "unmapped_rail")).toBe(true);
  });

  it("a complete receipt records everything needed to recompute it", async () => {
    const id = await newTransaction();
    const built = buildExecutionReceipt(baseReceipt({ transactionId: id }), {
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv);
    expect(built.outcome).toBe("complete");
    if (built.outcome !== "complete") return;
    await markReceiptPending(db, id);
    await markReceiptComplete(db, id, built);

    const rows = await db.execute(sql`
      SELECT receipt_status, receipt_version, receipt_canonicalization, receipt_digest_alg,
             receipt_digest, receipt_manifest_digest, integrity_payload_version
        FROM transactions WHERE id = ${id}::uuid
    `);
    const row = (rows as unknown as Array<Record<string, unknown>>)[0];
    expect(row.receipt_status).toBe("complete");
    expect(row.receipt_version).toBe("strale.execution.v1");
    expect(row.receipt_canonicalization).toBe("RFC8785");
    expect(row.receipt_digest_alg).toBe("sha256");
    expect(row.receipt_digest).toBe(built.digest);

    // The lifecycle must NOT set the chain version. That column records which
    // rule produced the integrity hash, so only the site that computes the hash
    // may write it — writing it here produced rows hashed under v1 while
    // declaring v2, which is the defect this round fixes.
    expect(row.integrity_payload_version).toBeNull();
  });

  // ── F. Epoch ─────────────────────────────────────────────────────────────

  it("a pre-epoch row reads as legacy_unavailable, and post-epoch cannot masquerade as it", async () => {
    const legacy = await newTransaction(); // no receipt columns written
    const rows = await db.execute(sql`
      SELECT receipt_status, receipt_failure_reason, receipt_digest, integrity_payload_version
        FROM transactions WHERE id = ${legacy}::uuid
    `);
    const row = (rows as unknown as Array<Record<string, unknown>>)[0];
    expect(row.receipt_status).toBeNull();
    expect(row.integrity_payload_version).toBeNull();

    const described = describeReceiptState({
      receiptStatus: row.receipt_status as string | null,
      receiptFailureReason: row.receipt_failure_reason as string | null,
      receiptDigest: row.receipt_digest as string | null,
    });
    expect(described.status).toBe("legacy_unavailable");

    // A v2 row cannot leave receipt_status null and read as legacy.
    await expect(
      db.execute(sql`
        UPDATE transactions SET integrity_payload_version = 2 WHERE id = ${legacy}::uuid
      `),
    ).rejects.toThrow(/transactions_chain_v2_has_receipt_state/);
  });

  it("no historical row was given a receipt", async () => {
    // The epoch rule, checked against the table rather than asserted: this
    // suite's own rows are the only ones carrying receipt state.
    const rows = await db.execute(sql`
      SELECT count(*)::int AS n FROM transactions
       WHERE receipt_status IS NOT NULL AND user_id <> ${userId}::uuid
    `);
    expect(Number((rows as unknown as Array<{ n: number }>)[0].n)).toBe(0);
  });

  // ── E. Chain v2 ──────────────────────────────────────────────────────────

  const chainRecord: IntegrityHashRecord = {
    id: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
    userId: "u1",
    status: "completed",
    input: { a: 1 },
    output: { b: 2 },
    error: null,
    priceCents: 5,
    latencyMs: 120,
    provenance: { source: "VIES" },
    auditTrail: { capability: "vat-validate" },
    transparencyMarker: "algorithmic",
    dataJurisdiction: "EU",
    createdAt: "2026-08-23T09:00:00.000Z",
    completedAt: "2026-08-23T09:00:01.000Z",
  };

  it("a v1 row hashes exactly as it did before v2 existed", () => {
    // The frozen expectation: v1 must not move, or 883,296 production rows
    // become apparently corrupt.
    const v1 = computeIntegrityHashVersioned(chainRecord, "prev", CHAIN_PAYLOAD_V1);
    const expected = createHash("sha256")
      .update(
        JSON.stringify({
          id: chainRecord.id,
          userId: chainRecord.userId,
          status: chainRecord.status,
          input: chainRecord.input,
          output: chainRecord.output,
          error: chainRecord.error,
          priceCents: chainRecord.priceCents,
          latencyMs: chainRecord.latencyMs,
          provenance: chainRecord.provenance,
          auditTrail: chainRecord.auditTrail,
          transparencyMarker: chainRecord.transparencyMarker,
          dataJurisdiction: chainRecord.dataJurisdiction,
          createdAt: "2026-08-23T09:00:00.000Z",
          completedAt: "2026-08-23T09:00:01.000Z",
          previousHash: "prev",
        }),
      )
      .digest("hex");
    expect(v1).toBe(expected);
  });

  it("a receipt digest present on a v1 row does NOT change its hash", () => {
    // v1 must be blind to the new member, or historical rows would shift.
    expect(
      computeIntegrityHashVersioned(
        { ...chainRecord, receiptDigest: `sha256:${"f".repeat(64)}` },
        "prev",
        CHAIN_PAYLOAD_V1,
      ),
    ).toBe(computeIntegrityHashVersioned(chainRecord, "prev", CHAIN_PAYLOAD_V1));
  });

  it("v2 anchors the receipt digest — swapping it invalidates the chain hash", () => {
    const withA = computeIntegrityHashVersioned(
      { ...chainRecord, receiptDigest: `sha256:${"a".repeat(64)}` },
      "prev",
      CHAIN_PAYLOAD_V2,
    );
    const withB = computeIntegrityHashVersioned(
      { ...chainRecord, receiptDigest: `sha256:${"b".repeat(64)}` },
      "prev",
      CHAIN_PAYLOAD_V2,
    );
    expect(withB).not.toBe(withA);
    // And v2 differs from v1 for the same record — the versions are distinct rules.
    expect(withA).not.toBe(computeIntegrityHashVersioned(chainRecord, "prev", CHAIN_PAYLOAD_V1));
  });

  it("a v2 row with no receipt still hashes deterministically, with the key present", () => {
    const a = computeIntegrityHashVersioned({ ...chainRecord, receiptDigest: null }, "p", CHAIN_PAYLOAD_V2);
    const b = computeIntegrityHashVersioned(chainRecord, "p", CHAIN_PAYLOAD_V2);
    // Omitting the field and passing null must be the same — the key is always written.
    expect(a).toBe(b);
  });

  it("the verifier selects the rule from the stored version", () => {
    expect(chainVersionOf(null)).toBe(CHAIN_PAYLOAD_V1);
    expect(chainVersionOf(undefined)).toBe(CHAIN_PAYLOAD_V1);
    expect(chainVersionOf(2)).toBe(CHAIN_PAYLOAD_V2);
  });

  it("linkage crosses the epoch unchanged, so the chain stays continuous", () => {
    // A v2 row's previous_hash points at a v1 hash exactly like any other link.
    const v1Hash = computeIntegrityHashVersioned(chainRecord, "genesis", CHAIN_PAYLOAD_V1);
    const v2Hash = computeIntegrityHashVersioned(
      { ...chainRecord, id: "next", receiptDigest: `sha256:${"c".repeat(64)}` },
      v1Hash,
      CHAIN_PAYLOAD_V2,
    );
    expect(v2Hash).toMatch(/^[0-9a-f]{64}$/);
    // Recomputing the v1 link under v1 still reproduces it.
    expect(computeIntegrityHashVersioned(chainRecord, "genesis", CHAIN_PAYLOAD_V1)).toBe(v1Hash);
  });
});
