/**
 * What the receipt commits to is what the caller actually received.
 *
 * Every other receipt test builds a `ReceiptInput` by hand and checks the
 * digest is stable. That proves the hashing is deterministic; it proves
 * nothing about whether the thing being hashed is the thing we served. The gap
 * between those two is where a provenance system fails quietly: the receipts
 * verify perfectly and describe a different execution.
 *
 * So these drive the real `POST /v1/do` over a real Postgres, take the HTTP
 * response body, and rebuild the receipt FROM THE RESPONSE. If the digest that
 * comes out does not match the one the request path stored, then what we
 * committed to is not what the customer got.
 *
 * The rails that do not have a route-level harness here (x402, internal) are
 * covered at the settle boundary instead, and `rail-coverage.test.ts` is what
 * stops a rail from having no coverage at all.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { capabilities, transactions, users, wallets, walletTransactions } from "../db/schema.js";
import { buildExecutionReceipt, LOCAL_BUILD_SENTINEL } from "../lib/receipt/execution-receipt.js";
import { deriveSourceObservation, settleExecutionReceipt } from "../lib/receipt/settle.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "p5-receipt-secret-at-least-32-chars-long-000";
  process.env.ADMIN_SECRET ??= "p5-receipt-admin-secret-at-least-32-chars-00";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_p5_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_p5_placeholder";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const PRICE_CENTS = 25;

describeMaybe("execution receipts bind what the caller received", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  let okSlug: string;
  let freeSlug: string;
  let boomSlug: string;
  let mixedSlug: string;
  const seeded: { userId: string; walletId: string }[] = [];
  const seededCaps: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 10 });
    db = drizzle(client);

    const { registerCapability } = await import("../capabilities/index.js");
    okSlug = `p5-receipt-ok-${randomUUID().slice(0, 8)}`;
    freeSlug = `p5-receipt-free-${randomUUID().slice(0, 8)}`;
    boomSlug = `p5-receipt-boom-${randomUUID().slice(0, 8)}`;
    mixedSlug = `p5-receipt-mixed-${randomUUID().slice(0, 8)}`;

    registerCapability(okSlug, async (input: any) => ({
      // Deliberately nested and mixed-type: a shape where a lossy
      // re-serialisation on either side would move the digest.
      output: {
        echo: input?.probe ?? null,
        nested: { n: 42, flag: true, list: [1, 2, 3] },
        unicode: "naïve café 😀",
      },
      provenance: { source: "p5-test", fetched_at: new Date().toISOString() },
    }));
    registerCapability(mixedSlug, async (input: any) => ({
      output: { echo: input?.probe ?? null },
      provenance: { source: "p5-test", fetched_at: new Date().toISOString() },
    }));
    registerCapability(freeSlug, async (input: any) => ({
      output: { free: true, echo: input?.probe ?? null },
      provenance: { source: "p5-test", fetched_at: new Date().toISOString() },
    }));
    registerCapability(boomSlug, async () => {
      // The message MUST be one the sanitiser rewrites, or this test proves
      // nothing. The first version threw "p5 deliberate executor failure" - no
      // URL, no hostname, no provider name, no network code - so
      // sanitizeFailureReason was the identity function on it, and the test
      // passed while settle.ts was binding the raw string on a rail that
      // stores raw. A reviewer measured the real gap at 14.8% of production
      // failures.
      //
      // This one contains a hostname and a provider-shaped token, so raw and
      // sanitised differ and the assertion has something to catch.
      throw new Error("VAT service at ec.europa.eu returned MS_UNAVAILABLE");
    });

    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    for (const { userId, walletId } of seeded) {
      await db.delete(transactions).where(eq(transactions.userId, userId));
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
      await db.delete(users).where(eq(users.id, userId));
    }
    seeded.length = 0;
    for (const id of seededCaps) {
      await db.delete(transactions).where(eq(transactions.capabilityId, id));
      await db.delete(capabilities).where(eq(capabilities.id, id));
    }
    seededCaps.length = 0;
  });

  async function seedCapability(slug: string, opts: { isFreeTier?: boolean } = {}) {
    const id = randomUUID();
    seededCaps.push(id);
    await db.insert(capabilities).values({
      id,
      slug,
      name: `P5 receipt probe ${slug}`,
      description: "Seeded by the Phase 5 receipt binding test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { echo: { type: "string" } } },
      priceCents: opts.isFreeTier ? 0 : PRICE_CENTS,
      isActive: true,
      isFreeTier: opts.isFreeTier ?? false,
      avgLatencyMs: 50,
      lifecycleState: "active",
      visible: true,
    });
    return id;
  }

  async function seedUser(balanceCents = 10_000): Promise<string> {
    const userId = randomUUID();
    const walletId = randomUUID();
    const apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;
    seeded.push({ userId, walletId });
    await db.insert(users).values({
      id: userId,
      email: `p5-receipt-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents });
    return apiKey;
  }

  function callDo(apiKey: string | null, body: Record<string, unknown>) {
    return app.request("http://localhost/v1/do", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function receiptRow(transactionId: string) {
    const rows = (await db.execute(sql`
      SELECT * FROM transactions WHERE id = ${transactionId}::uuid
    `)) as unknown as Array<Record<string, unknown>>;
    return rows[0];
  }

  /**
   * Rebuild the receipt from the RESPONSE the caller got, and return its
   * digest. Everything that describes the execution comes from the HTTP body;
   * only the identity fields the caller never sees are read from the row.
   */
  function digestFromResponse(
    row: Record<string, unknown>,
    body: any,
    opts: { status: "completed" | "failed"; method?: "algorithmic" | "ai_generated" | "mixed" },
  ): string {
    const built = buildExecutionReceipt(
      {
        transactionId: row.id as string,
        subjectKind: "capability",
        subjectSlug: body?.result?.capability_used ?? (row.c_slug as string),
        deployCommit: row.receipt_deploy_commit as string,
        manifestDigest: row.receipt_manifest_digest as string | null,
        steps: null,
        rail: row.receipt_rail as string,
        inputs: row.input,
        status: opts.status,
        // THE POINT: straight out of the HTTP response body.
        result: opts.status === "completed" ? body.result.output : null,
        error:
          opts.status === "failed"
            ? {
                code: "execution_failed",
                // What the caller was handed, not what we stored.
                message: String(body?.details?.error ?? ""),
              }
            : null,
        // `hybrid` is the marker spelling of `mixed`; the receipt records the
        // method, not the marker.
        method:
          opts.method ??
          ((row.transparency_marker === "hybrid"
            ? "mixed"
            : row.transparency_marker) as "algorithmic"),
        sourceObservation: deriveSourceObservation(row.provenance, "live-fetch"),
      },
      { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    );
    if (built.outcome !== "complete") throw new Error(`rebuild failed: ${built.reason}`);
    return built.digest;
  }

  it("PAID SYNC RAIL: the stored digest is the digest of what the caller received", async () => {
    await seedCapability(okSlug);
    const apiKey = await seedUser();

    const inputs = { probe: "sync-paid" };
    const res = await callDo(apiKey, {
      capability_slug: okSlug,
      inputs,
      max_price_cents: PRICE_CENTS,
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    const txnId = body.result.transaction_id;

    const row = await receiptRow(txnId);
    expect(row.receipt_status, "the request path did not complete the receipt").toBe("complete");
    expect(row.receipt_rail).toBe("v1_do");

    // The REQUEST half: what was hashed as `inputs` is what the caller sent.
    expect(row.input).toEqual(inputs);

    // The RESULT half: rebuild from the response body and compare digests.
    expect(digestFromResponse({ ...row, c_slug: okSlug }, body, { status: "completed" })).toBe(
      row.receipt_digest,
    );

    // And the response really did carry the nested/unicode shape, so the match
    // above is not a match between two empty objects.
    expect(body.result.output.unicode).toBe("naïve café 😀");
    expect(body.result.output.nested.list).toEqual([1, 2, 3]);
  });

  it("FREE-TIER RAIL: same binding, and the rail is still recorded", async () => {
    await seedCapability(freeSlug, { isFreeTier: true });
    const apiKey = await seedUser();

    const inputs = { probe: "free-tier" };
    const res = await callDo(apiKey, {
      capability_slug: freeSlug, inputs, max_price_cents: PRICE_CENTS,
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const body: any = await res.json();
    const row = await receiptRow(body.result.transaction_id);

    expect(row.receipt_status).toBe("complete");
    expect(row.receipt_rail).toBe("v1_do");
    expect(row.input).toEqual(inputs);
    expect(digestFromResponse({ ...row, c_slug: freeSlug }, body, { status: "completed" })).toBe(
      row.receipt_digest,
    );
  });

  it("FAILURES ARE EXECUTIONS: the error hashed is the error the caller was given", async () => {
    // Phase 2 is explicit that a failed execution gets a receipt. It is also
    // the case most likely to be got wrong, because the sanitised message the
    // caller sees and the raw message we logged are different strings.
    await seedCapability(boomSlug);
    const apiKey = await seedUser();

    const res = await callDo(apiKey, {
      capability_slug: boomSlug,
      inputs: { probe: "boom" },
      max_price_cents: PRICE_CENTS,
    });
    const body: any = await res.json();
    expect(res.status).toBeGreaterThanOrEqual(400);

    const rows = (await db.execute(sql`
      SELECT * FROM transactions
       WHERE capability_id = ${seededCaps[seededCaps.length - 1]}::uuid
       ORDER BY created_at DESC LIMIT 1
    `)) as unknown as Array<Record<string, unknown>>;
    const row = rows[0];

    expect(row.status).toBe("failed");
    expect(row.receipt_status, "a failed execution still gets a receipt").toBe("complete");
    expect(row.receipt_rail).toBe("v1_do");

    // The fixture has to be one the sanitiser changes, or the assertion below
    // is vacuous. Asserted rather than assumed, because that is exactly how
    // this test passed while the code was wrong.
    const rawStored = row.error as string;
    const servedToCaller = String(body?.details?.error ?? "");
    expect(
      servedToCaller,
      "fixture is too weak: the raw and sanitised messages are identical, so " +
        "this test cannot tell whether the receipt bound the right one",
    ).not.toBe(rawStored);
    expect(rawStored).toContain("ec.europa.eu");
    expect(servedToCaller).toContain("[service]");

    // `/v1/do` puts the real message under details.error, not a top-level
    // `error` key. The receipt must bind THAT string.
    expect(digestFromResponse({ ...row, c_slug: boomSlug }, body, { status: "failed" })).toBe(
      row.receipt_digest,
    );
  });

  it("a MIXED capability is not committed as `algorithmic`", async () => {
    // routes/do.ts maps transparency_tag 'mixed' to the marker 'hybrid', which
    // is not one of the receipt's three methods, and settle used to fall back
    // to 'algorithmic' for anything it did not recognise - so the receipt
    // asserted "no model was involved" about an execution that declares one.
    // A reviewer measured 8,010 of ~193,600 production rows over 30 days.
    const capId = randomUUID();
    seededCaps.push(capId);
    await db.insert(capabilities).values({
      id: capId,
      slug: mixedSlug,
      name: `P5 mixed probe ${mixedSlug}`,
      description: "Seeded by the Phase 5 receipt binding test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { echo: { type: "string" } } },
      priceCents: PRICE_CENTS,
      isActive: true,
      transparencyTag: "mixed",
      avgLatencyMs: 50,
      lifecycleState: "active",
      visible: true,
    });
    const apiKey = await seedUser();

    const res = await callDo(apiKey, {
      capability_slug: mixedSlug,
      inputs: { probe: "mixed" },
      max_price_cents: PRICE_CENTS,
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const body: any = await res.json();
    const row = await receiptRow(body.result.transaction_id);

    // The row really does carry the non-member marker, so this is the live case.
    expect(row.transparency_marker).toBe("hybrid");
    expect(row.receipt_status).toBe("complete");

    // Rebuilt as `mixed` matches; rebuilt as `algorithmic` does not.
    const asMixed = digestFromResponse({ ...row, c_slug: mixedSlug }, body, {
      status: "completed",
      method: "mixed",
    });
    const asAlgorithmic = digestFromResponse({ ...row, c_slug: mixedSlug }, body, {
      status: "completed",
      method: "algorithmic",
    });
    expect(asMixed).toBe(row.receipt_digest);
    expect(asAlgorithmic).not.toBe(row.receipt_digest);
  });

  it("an execution whose method cannot be established gets NO receipt, not a guessed one", async () => {
    // The other half of the method fix, and the one the mutation battery
    // showed was untested: the refusal itself.
    //
    // settlement-reconciler.ts writes transparency_marker 'unknown' precisely
    // so it does not fabricate an EU AI Act Art. 50 marker on a call it cannot
    // describe. If the capability's own declaration is also absent, there is
    // nothing to establish the method from - and guessing 'algorithmic' would
    // undo, one file over, the exact care that comment describes.
    const capId = randomUUID();
    seededCaps.push(capId);
    await db.insert(capabilities).values({
      id: capId,
      slug: `p5-receipt-untagged-${randomUUID().slice(0, 8)}`,
      name: "P5 untagged probe",
      description: "Seeded by the Phase 5 receipt binding test.",
      category: "developer-tools",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      priceCents: 5,
      isActive: true,
      transparencyTag: null,
      avgLatencyMs: 20,
      lifecycleState: "active",
      visible: true,
    });

    const id = randomUUID();
    await db.execute(sql`
      INSERT INTO transactions (id, capability_id, status, price_cents, transparency_marker,
                                data_jurisdiction, input, output, receipt_rail,
                                receipt_deploy_commit, completed_at)
      VALUES (${id}::uuid, ${capId}::uuid, 'completed', 5, 'unknown', 'EU',
              '{}'::jsonb, '{}'::jsonb, 'x402', ${LOCAL_BUILD_SENTINEL}, now())
    `);

    await settleExecutionReceipt(db, { transactionId: id });

    const row = await receiptRow(id);
    expect(row.receipt_status, "a guessed method must not produce a complete receipt").not.toBe(
      "complete",
    );
    expect(row.receipt_digest).toBeNull();

    await db.execute(sql`DELETE FROM transactions WHERE id = ${id}::uuid`);
  });

  it("the receipt records the serving commit, and outside production that is the sentinel", async () => {
    await seedCapability(okSlug);
    const apiKey = await seedUser();
    const res = await callDo(apiKey, {
      capability_slug: okSlug,
      inputs: { probe: "commit" },
      max_price_cents: PRICE_CENTS,
    });
    const body: any = await res.json();
    const row = await receiptRow(body.result.transaction_id);

    // Never mistakable for a real 40-hex SHA, which is the whole point of
    // having a defined sentinel rather than a null.
    expect(row.receipt_deploy_commit).toBe(LOCAL_BUILD_SENTINEL);
  });

  it("a receipt that cannot be built does not disturb the transaction it describes", async () => {
    // The safety property the whole design rests on: receipt construction runs
    // after the money transaction commits and swallows its own failures, so a
    // request that executed and charged is never failed by a receipt problem.
    //
    // The first attempt at this test tried to reset a completed receipt back to
    // pending, and the 0108 transition trigger refused it -- correctly, and
    // that refusal is itself worth having seen. A fresh row is used instead.
    //
    // A solution transaction naming a solution with no declared steps is the
    // cleanest unresolvable case: there is no recipe to bind, and unlike a
    // missing capability it cannot be ruled out by a foreign key.
    const id = randomUUID();
    await db.execute(sql`
      INSERT INTO transactions (id, solution_slug, status, price_cents, transparency_marker,
                                data_jurisdiction, input, output, receipt_rail,
                                receipt_deploy_commit, completed_at)
      VALUES (${id}::uuid, ${`p5-no-such-solution-${randomUUID().slice(0, 8)}`},
              'completed', 5, 'algorithmic', 'EU',
              ${JSON.stringify({ probe: "orphan" })}::jsonb,
              ${JSON.stringify({ echo: "orphan" })}::jsonb,
              'v1_do', ${LOCAL_BUILD_SENTINEL}, now())
    `);

    // It resolves rather than throwing. That is the contract: a receipt failure
    // must never propagate into the request that produced it.
    await expect(
      settleExecutionReceipt(db, { transactionId: id, rail: "v1_do", ranStepSlugs: [] }),
    ).resolves.toBeUndefined();

    const row = await receiptRow(id);
    expect(row.receipt_status).toBe("failed");
    expect(row.receipt_failure_reason).toBe("unresolvable_manifest");
    // The execution itself is untouched: still completed, still carrying the
    // output the caller received.
    expect(row.status).toBe("completed");
    expect((row.output as any).echo).toBe("orphan");

    await db.execute(sql`DELETE FROM transactions WHERE id = ${id}::uuid`);
  });

  it("X402 AND INTERNAL RAILS: settle binds the rail the row recorded, not the one passed", async () => {
    // The rails without a route harness here. The row's own `receipt_rail` is
    // authoritative - block 0110 - so a caller passing a different one must not
    // be able to change what the receipt says.
    const capId = await seedCapability(okSlug);
    const apiKey = await seedUser();
    void apiKey;

    // A commit that is NOT what the environment would answer, so the digest
    // below depends on the row's recorded value rather than on process.env.
    // Without that, a settle.ts that ignored receipt_deploy_commit and read the
    // environment would produce an identical digest and this would pass.
    const ROW_COMMIT = "a".repeat(40);

    for (const rail of ["x402", "internal"] as const) {
      const id = randomUUID();
      await db.execute(sql`
        INSERT INTO transactions (id, capability_id, status, price_cents, transparency_marker,
                                  data_jurisdiction, input, output, provenance,
                                  receipt_rail, receipt_deploy_commit, completed_at)
        VALUES (${id}::uuid, ${capId}::uuid, 'completed', 5, 'algorithmic', 'EU',
                ${JSON.stringify({ probe: rail })}::jsonb,
                ${JSON.stringify({ ok: rail })}::jsonb,
                ${JSON.stringify({ source: "p5", fetched_at: new Date().toISOString() })}::jsonb,
                ${rail}, ${ROW_COMMIT}, now())
      `);

      // Deliberately lie about the rail on the call.
      await settleExecutionReceipt(db, { transactionId: id, rail: "v1_do" });

      const row = await receiptRow(id);
      expect(row.receipt_status).toBe("complete");
      expect(row.receipt_rail, "the row's recorded rail must win").toBe(rail);

      // And the digest is the one for the row's rail, not the passed one.
      const asRecorded = digestFromResponse(
        { ...row, c_slug: okSlug },
        { result: { output: row.output, capability_used: okSlug } },
        { status: "completed" },
      );
      expect(asRecorded).toBe(row.receipt_digest);
    }
  });
});
