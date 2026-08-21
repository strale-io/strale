/**
 * WP4 acceptance signal: the two rails bill a gated solution identically.
 *
 * This is the test the package exists to make pass. Before it, the wallet rail
 * refunded a gated run in full and the x402 rail settled it in full — same
 * execution, opposite billing, decided by which payment method the caller
 * happened to use. Confirmed by grep before it was confirmed by test: the token
 * `gated` appeared twelve times in routes/solution-execute.ts and zero times in
 * routes/x402-gateway-v2.ts.
 *
 * Verified discriminating: restoring the old `anyStepSucceeded` predicate on the
 * x402 rail turns the parity assertion red and leaves the wallet assertions
 * green, which is exactly the asymmetry the package removes.
 *
 * No real payment is made. The facilitator is mocked at the module boundary —
 * `verifyX402PaymentOnly` returns a verified handle and `settleX402Payment` is a
 * spy — so the route runs its real logic end to end while no USDC moves. The
 * spy is the point: the assertion is not merely that the response is a 502, but
 * that settlement is never reached.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import {
  users,
  wallets,
  walletTransactions,
  walletReservations,
  capabilities,
  solutions,
  solutionSteps,
  transactions,
} from "../db/schema.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "wp4-parity-secret-at-least-32-chars-000000";
  process.env.ADMIN_SECRET ??= "wp4-parity-admin-secret-at-least-32-chars0";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_wp4_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_wp4_placeholder";
  // Makes isX402Configured() true so the route reaches its execution path.
  process.env.X402_RECEIVING_ADDRESS ??= "0x0000000000000000000000000000000000000001";
  process.env.X402_NETWORK ??= "base";
}

const settleSpy = vi.fn(async () => ({
  valid: true,
  settlementId: "wp4-test-settlement",
}));

// Mocked at the module boundary so BOTH rails run their real code. Only the
// on-chain calls are replaced.
vi.mock("../lib/x402-gateway.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/x402-gateway.js")>();
  return {
    ...actual,
    isX402Configured: () => true,
    verifyX402PaymentOnly: async () => ({
      valid: true,
      verified: { payload: {}, requirements: {} },
    }),
    settleX402Payment: (...args: unknown[]) => settleSpy(...(args as [])),
  };
});

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const SOLUTION_PRICE = 250;
const STARTING_BALANCE = 5_000;

describeMaybe("a gated solution bills identically on both rails", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  let userId = "";
  let walletId = "";
  let solutionId = "";
  let solSlug = "";
  let apiKey = "";
  const capabilityIds: string[] = [];

  /** Flipped per test: does the gate step report the condition that stops the run? */
  let gateTrips = true;

  const GATE_SLUG = `wp4-gate-${randomUUID().slice(0, 8)}`;
  const WORK_SLUG = `wp4-work-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 8 });
    db = drizzle(client);

    const { registerCapability } = await import("../capabilities/index.js");

    // The gate step SUCCEEDS — it truthfully reports that the subject cannot be
    // checked. That is precisely why the old x402 predicate billed for it:
    // `anyStepSucceeded` saw a successful step and settled.
    registerCapability(GATE_SLUG, async () => ({
      output: { reachable: gateTrips ? false : true, checked: true },
      provenance: { source: "wp4-test", fetched_at: new Date().toISOString() },
    }));

    registerCapability(WORK_SLUG, async () => ({
      output: { finding: "none", ok: true },
      provenance: { source: "wp4-test", fetched_at: new Date().toISOString() },
    }));

    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    settleSpy.mockClear();
    // The x402 rail has no user, so its rows carry user_id NULL and a delete
    // keyed on userId silently leaves them behind. They then outlive the test
    // with a fresh completed_at, and integrity-hash-chain's head selection —
    // which scans ALL transactions by (completed_at, id) DESC — resumes from
    // one of them. That failed in CI while passing locally, which is what
    // leftover rows look like.
    if (solSlug) {
      await db.delete(transactions).where(eq(transactions.solutionSlug, solSlug));
    }
    if (userId) {
      await db.delete(walletReservations).where(eq(walletReservations.userId, userId));
      await db.delete(transactions).where(eq(transactions.userId, userId));
    }
    if (walletId) {
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
    }
    if (userId) await db.delete(users).where(eq(users.id, userId));
    if (solutionId) {
      await db.delete(solutionSteps).where(eq(solutionSteps.solutionId, solutionId));
      await db.delete(solutions).where(eq(solutions.id, solutionId));
    }
    for (const id of capabilityIds.splice(0)) {
      await db.delete(capabilities).where(eq(capabilities.id, id));
    }
    userId = walletId = solutionId = "";
    gateTrips = true;
  });

  async function seed() {
    userId = randomUUID();
    solutionId = randomUUID();
    solSlug = `wp4-sol-${randomUUID().slice(0, 8)}`;
    apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;

    await db.insert(users).values({
      id: userId,
      email: `wp4-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });

    const walletService = await import("../lib/wallet-service.js");
    const wallet = await db.transaction((tx) =>
      walletService.openWallet(tx, {
        userId,
        grantCents: STARTING_BALANCE,
        type: "trial_credit",
        description: "WP4 parity grant",
      }),
    );
    walletId = wallet.id;

    for (const slug of [GATE_SLUG, WORK_SLUG]) {
      const id = randomUUID();
      capabilityIds.push(id);
      await db.insert(capabilities).values({
        id,
        slug,
        name: `WP4 ${slug}`,
        description: "Seeded by the WP4 billing-parity test.",
        category: "developer-tools",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        priceCents: 10,
        isActive: true,
        avgLatencyMs: 50,
        lifecycleState: "active",
      });
    }

    await db.insert(solutions).values({
      id: solutionId,
      slug: solSlug,
      name: "WP4 parity solution",
      description: "Seeded by the WP4 billing-parity test.",
      category: "compliance",
      priceCents: SOLUTION_PRICE,
      componentSumCents: 20,
      valueTier: "standard",
      maintenanceLevel: "low",
      geography: "EU",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      isActive: true,
      x402Enabled: true,
      x402PriceUsd: 2.75,
    });

    // Step 1 gates on `reachable === false`; step 2 is the work behind it.
    const { __resetX402CacheForTests } = await import("./x402-gateway-v2.js");
    __resetX402CacheForTests();

    await db.insert(solutionSteps).values([
      {
        solutionId,
        capabilitySlug: GATE_SLUG,
        stepOrder: 1,
        inputMap: { probe: "probe" },
        gateCondition: {
          field: "reachable",
          equals: false,
          reason: "the subject registry is unreachable",
        },
      },
      {
        solutionId,
        capabilitySlug: WORK_SLUG,
        stepOrder: 2,
        inputMap: { probe: "probe" },
      },
    ]);
  }

  function runWalletRail() {
    return app.request(`http://localhost/v1/solutions/${solSlug}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ inputs: { probe: "wp4" } }),
    });
  }

  function runX402Rail() {
    return app.request(`http://localhost/x402/solutions/${solSlug}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // MUST be unique per request. The route dedups replays on a hash of
        // this header (cert-audit C9), so a constant value makes every call
        // after the first return the first one's cached row — a 200 with no
        // execution and no settlement, which reads exactly like a billing bug.
        // A real payment authorization is distinct per request too.
        "X-PAYMENT": `wp4-auth-${randomUUID()}`,
      },
      body: JSON.stringify({ probe: "wp4" }),
    });
  }

  async function balance(): Promise<number> {
    const [row] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);
    return row!.balanceCents;
  }

  it("wallet rail: the caller keeps their money", async () => {
    await seed();

    const res = await runWalletRail();
    const body = (await res.json()) as Record<string, any>;

    // Review finding: this line was `body.charged_cents ?? body.price_cents ?? 0`,
    // which is vacuously 0 when the response carries NEITHER key — and neither
    // was ever at the top level, so it asserted nothing at all. The real field
    // is result.price_cents; the gated block also states it outright.
    expect(body.result).toHaveProperty("price_cents");
    expect(body.result.price_cents).toBe(0);
    expect(body.result.gated?.charged).toBe(false);

    // The load-bearing assertion either way: the money did not move.
    expect(await balance()).toBe(STARTING_BALANCE);
  }, 120_000);

  it("x402 rail: settlement is never reached", async () => {
    await seed();

    const res = await runX402Rail();

    // The assertion that matters is the spy, not the status code: pre-WP4 this
    // rail returned 200 AND moved the USDC, because the gate step counted as a
    // success under `anyStepSucceeded`.
    expect(settleSpy).not.toHaveBeenCalled();
    expect(res.status).toBe(502);

    const body = (await res.json()) as Record<string, any>;
    expect(body.failure_class).toBe("gate_tripped");
  }, 120_000);

  it("the two rails agree — which is the whole point", async () => {
    await seed();

    await runWalletRail();
    const walletCharged = STARTING_BALANCE - (await balance());

    await runX402Rail();
    const x402Charged = settleSpy.mock.calls.length;

    expect(walletCharged).toBe(0);
    expect(x402Charged).toBe(0);
  }, 120_000);

  it("and both still charge when the gate does NOT trip", async () => {
    // Guards the other direction. A parity fix that simply stopped charging
    // would also make the assertions above pass, and would be worse than the
    // bug.
    await seed();
    gateTrips = false;

    const walletRes = await runWalletRail();
    expect(walletRes.status).toBe(200);
    expect(await balance()).toBe(STARTING_BALANCE - SOLUTION_PRICE);

    const x402Res = await runX402Rail();
    expect(x402Res.status).toBe(200);
    expect(settleSpy).toHaveBeenCalledTimes(1);
  }, 120_000);
});

/**
 * The capability rail, added after adversarial review.
 *
 * The solutions block above could not have caught the blocking finding: it
 * exercises solutions only, so an unwired CAPABILITY rail was invisible to it
 * while the package's exit condition claimed every rail was covered. Same
 * capability, same USDC, two endpoints — they must agree.
 */
describeMaybe("a capability returning an unusable output bills on neither rail", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  let capabilityId = "";
  const CAP_SLUG = `wp4-bad-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
    const { registerCapability } = await import("../capabilities/index.js");
    // RESOLVES — does not throw — with an error marker plus a numeric HTTP
    // status. Pre-WP4 both rails treated resolution as success and charged.
    registerCapability(CAP_SLUG, async () => ({
      output: { error: "Registry returned 503", status: 503 },
      provenance: { source: "wp4-test", fetched_at: new Date().toISOString() },
    }));
    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    if (capabilityId) {
      // Keyed on capabilityId, not userId: this rail has no user, so its rows
      // carry user_id NULL. Leaving them behind gives integrity-hash-chain's
      // global head selection a fresher completed_at to resume from — which is
      // how the solutions block broke that test in CI while passing locally.
      // `transactions` has no slug column; capability_id is the identifier.
      await db.delete(transactions).where(eq(transactions.capabilityId, capabilityId));
      await db.delete(capabilities).where(eq(capabilities.id, capabilityId));
    }
    await client.end();
  });


  it("the x402 capability rail does not settle", async () => {
    settleSpy.mockClear();
    capabilityId = randomUUID();
    await db.insert(capabilities).values({
      id: capabilityId,
      slug: CAP_SLUG,
      name: "WP4 unusable-output capability",
      description: "Seeded by the WP4 billing-parity test.",
      category: "developer-tools",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      priceCents: 25,
      isActive: true,
      avgLatencyMs: 50,
      lifecycleState: "active",
      x402Enabled: true,
      x402PriceUsd: 0.3,
    });

    const { __resetX402CacheForTests } = await import("./x402-gateway-v2.js");
    __resetX402CacheForTests();

    const res = await app.request(`http://localhost/x402/${CAP_SLUG}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": `wp4-auth-${randomUUID()}`,
      },
      body: JSON.stringify({ probe: "wp4" }),
    });

    // The assertion that would have caught the blocking finding.
    expect(settleSpy).not.toHaveBeenCalled();
    expect(res.status).not.toBe(200);
  }, 120_000);
});
