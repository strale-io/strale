/**
 * A solution receipt must say which steps actually ran.
 *
 * `PHASE-2-SPEC` §5 is explicit: a step short-circuited by a gate "still
 * appears, with `manifest_digest: null` and the absence recorded". Phase 4's
 * reviewer added `disposition` (`ran` / `skipped` / `unresolved`) precisely so
 * that a step that did not run and a step we could not resolve cannot share a
 * digest.
 *
 * Phase 5 then wired the rails and got it backwards, because
 * `execResult.steps` is keyed by EVERY declared step, not only the ones that
 * produced output — `markSkippedByGate` and three sibling branches deliberately
 * insert a placeholder so a bundle advertising 14 steps does not audit 13 with no
 * gap marker. Reading `Object.keys` of it as "the steps that ran" marked every
 * gate-skipped step `ran` and gave it a manifest digest, which made
 * `disposition` a constant on every production solution path and left a
 * full run and a gate-tripped run with the same `implementation.steps`.
 *
 * That is the under-specification the field exists to prevent, so this drives
 * the real route over a real gated solution rather than testing the helper.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import {
  capabilities,
  solutions,
  solutionSteps,
  transactions,
  users,
  wallets,
  walletTransactions,
} from "../db/schema.js";
import { readManifestSnapshot } from "../lib/receipt/manifest-snapshot.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "p5-solrcpt-secret-at-least-32-chars-long-00";
  process.env.ADMIN_SECRET ??= "p5-solrcpt-admin-secret-at-least-32-chars-0";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_p5_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_p5_placeholder";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("solution receipts record which steps actually ran", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  let gateSlug: string;
  let afterSlug: string;
  let solutionSlug: string;
  let solutionId: string;
  const capIds: string[] = [];
  const seeded: { userId: string; walletId: string }[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);

    const { registerCapability } = await import("../capabilities/index.js");
    const tag = randomUUID().slice(0, 8);
    gateSlug = `p5-sol-gate-${tag}`;
    afterSlug = `p5-sol-after-${tag}`;
    solutionSlug = `p5-sol-${tag}`;

    // Step 1 returns the value its gate is armed on, so the run stops here.
    registerCapability(gateSlug, async () => ({
      output: { verdict: "stop" },
      provenance: { source: "p5-test", fetched_at: new Date().toISOString() },
    }));
    // Step 2 must never execute. If it does, this test is not testing a gate.
    registerCapability(afterSlug, async () => {
      throw new Error("step 2 ran, but the gate should have stopped the bundle");
    });

    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await db.delete(solutionSteps).where(eq(solutionSteps.solutionId, solutionId));
    await db.delete(solutions).where(eq(solutions.id, solutionId));
    for (const id of capIds) await db.delete(capabilities).where(eq(capabilities.id, id));
    await client.end();
  });

  afterEach(async () => {
    for (const { userId, walletId } of seeded) {
      await db.delete(transactions).where(eq(transactions.userId, userId));
      await db.execute(sql`DELETE FROM wallet_reservations WHERE wallet_id = ${walletId}::uuid`);
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
      await db.delete(users).where(eq(users.id, userId));
    }
    seeded.length = 0;
  });

  async function seedCapability(slug: string) {
    const id = randomUUID();
    capIds.push(id);
    await db.insert(capabilities).values({
      id,
      slug,
      name: `P5 solution probe ${slug}`,
      description: "Seeded by the Phase 5 solution receipt test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { verdict: { type: "string" } } },
      priceCents: 5,
      isActive: true,
      transparencyTag: "algorithmic",
      avgLatencyMs: 20,
      lifecycleState: "active",
      visible: true,
    });
  }

  async function seedUser(balanceCents = 10_000): Promise<string> {
    const userId = randomUUID();
    const walletId = randomUUID();
    const apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;
    seeded.push({ userId, walletId });
    await db.insert(users).values({
      id: userId,
      email: `p5-solrcpt-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents });
    return apiKey;
  }

  it("a gate-tripped step is `skipped` with a null digest, not `ran`", async () => {
    await seedCapability(gateSlug);
    await seedCapability(afterSlug);

    solutionId = randomUUID();
    await db.insert(solutions).values({
      id: solutionId,
      slug: solutionSlug,
      name: "P5 gated bundle",
      description: "Two steps, the first of which stops the run.",
      category: "compliance",
      priceCents: 20,
      componentSumCents: 10,
      valueTier: "standard",
      maintenanceLevel: "low",
      geography: "EU",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      isActive: true,
    });
    await db.insert(solutionSteps).values([
      {
        solutionId,
        capabilitySlug: gateSlug,
        stepOrder: 1,
        inputMap: { probe: "$.probe" },
        gateCondition: {
          field: "verdict",
          equals: "stop",
          message: "The first check stopped the bundle.",
        },
      },
      {
        solutionId,
        capabilitySlug: afterSlug,
        stepOrder: 2,
        inputMap: { probe: "$.probe" },
      },
    ]);

    const apiKey = await seedUser();
    const res = await app.request(`http://localhost/v1/solutions/${solutionSlug}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ inputs: { probe: "x" }, max_price_cents: 100 }),
    });

    const body: any = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    // The gate really did trip, so this is the case under test.
    expect(body.result.gated?.stopped_at, JSON.stringify(body.result)).toBe(gateSlug);

    const rows = (await db.execute(sql`
      SELECT * FROM transactions WHERE id = ${body.result.transaction_id}::uuid
    `)) as unknown as Array<Record<string, unknown>>;
    const row = rows[0];
    expect(row.receipt_status, "the solution rail did not settle its receipt").toBe("complete");

    // Read the committed step identities back out of the snapshot authority,
    // which recomputes the digest before trusting the row.
    const snapshot = await readManifestSnapshot(db, row.receipt_manifest_digest as string);
    const steps = (snapshot as { steps: Array<Record<string, unknown>> }).steps;

    expect(steps).toHaveLength(2);

    const ran = steps.find((s) => s.slug === gateSlug)!;
    const stopped = steps.find((s) => s.slug === afterSlug)!;

    expect(ran.disposition, "the gate step DID run").toBe("ran");
    expect(ran.manifest_digest, "a step that ran binds its declaration").not.toBeNull();

    expect(
      stopped.disposition,
      "a step the gate prevented must not be recorded as having run",
    ).toBe("skipped");
    expect(
      stopped.manifest_digest,
      "a step that never ran must not carry a declaration digest",
    ).toBeNull();
  });

  it("a full run and a gate-tripped run do not share an implementation digest", async () => {
    // The property the disposition exists for. With every step marked `ran`,
    // these two were byte-identical: `implementation.steps` could not tell a
    // bundle that completed from one that stopped at step 1.
    const { normalizeSolutionDeclaration } = await import("../lib/receipt/manifest-snapshot.js");
    const { declarationDigest } = await import("../lib/receipt/manifest-snapshot.js");

    const digestA = declarationDigest(
      normalizeSolutionDeclaration({
        slug: solutionSlug,
        steps: [
          { step_order: 1, slug: gateSlug, disposition: "ran", manifest_digest: `sha256:${"a".repeat(64)}` },
          { step_order: 2, slug: afterSlug, disposition: "ran", manifest_digest: `sha256:${"b".repeat(64)}` },
        ],
      }),
    );
    const digestB = declarationDigest(
      normalizeSolutionDeclaration({
        slug: solutionSlug,
        steps: [
          { step_order: 1, slug: gateSlug, disposition: "ran", manifest_digest: `sha256:${"a".repeat(64)}` },
          { step_order: 2, slug: afterSlug, disposition: "skipped", manifest_digest: null },
        ],
      }),
    );
    expect(digestB).not.toBe(digestA);
  });
});
