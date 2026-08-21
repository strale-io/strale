/**
 * Solutions hold a reservation for the duration of a run (WP3).
 *
 * The adversarial review's third blocking finding: solutions had the identical
 * crash window to `/v1/do` — debit, commit, then execute for seconds to
 * minutes with the only refunds living in this process — on the platform's
 * most expensive SKUs. Worse, a comment in the route claimed WP3's reconciler
 * already covered it, which was false: nothing wrote a reservation there.
 *
 * That is now wired, and this proves it end to end rather than by inspection.
 * The wiring is the part most likely to be wrong — the state machine itself is
 * covered in lib/wallet-reservations.integration.test.ts — so these drive the
 * real route and assert on real rows.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
  process.env.AUDIT_HMAC_SECRET ??= "wp3-sol-secret-at-least-32-chars-long-0000";
  process.env.ADMIN_SECRET ??= "wp3-sol-admin-secret-at-least-32-chars-0000";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_wp3_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_wp3_placeholder";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const SOLUTION_PRICE = 250;
const STARTING_BALANCE = 5_000;

describeMaybe("solution execution holds a wallet reservation", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  let userId = "";
  let walletId = "";
  let capabilityId = "";
  let solutionId = "";
  let capSlug = "";
  let solSlug = "";
  let apiKey = "";

  /** Flipped per test to make the single step succeed or fail. */
  let stepShouldFail = false;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 8 });
    db = drizzle(client);

    const { registerCapability } = await import("../capabilities/index.js");
    capSlug = `wp3-solstep-${randomUUID().slice(0, 8)}`;
    registerCapability(capSlug, async () => {
      if (stepShouldFail) throw new Error("step failed on purpose");
      return {
        output: { ok: true },
        provenance: { source: "wp3-test", fetched_at: new Date().toISOString() },
      };
    });

    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    if (userId) {
      await db
        .delete(walletReservations)
        .where(eq(walletReservations.userId, userId));
      await db.delete(transactions).where(eq(transactions.userId, userId));
    }
    if (walletId) {
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
    }
    if (userId) await db.delete(users).where(eq(users.id, userId));
    if (solutionId) {
      await db
        .delete(solutionSteps)
        .where(eq(solutionSteps.solutionId, solutionId));
      await db.delete(solutions).where(eq(solutions.id, solutionId));
    }
    if (capabilityId)
      await db.delete(capabilities).where(eq(capabilities.id, capabilityId));
    userId = walletId = capabilityId = solutionId = "";
    stepShouldFail = false;
  });

  async function seed() {
    userId = randomUUID();
    capabilityId = randomUUID();
    solutionId = randomUUID();
    solSlug = `wp3-sol-${randomUUID().slice(0, 8)}`;
    apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;

    await db.insert(users).values({
      id: userId,
      email: `wp3-sol-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });

    const walletService = await import("../lib/wallet-service.js");
    const wallet = await db.transaction((tx) =>
      walletService.openWallet(tx, {
        userId,
        grantCents: STARTING_BALANCE,
        type: "trial_credit",
        description: "WP3 solutions grant",
      }),
    );
    walletId = wallet.id;

    await db.insert(capabilities).values({
      id: capabilityId,
      slug: capSlug,
      name: "WP3 solution step",
      description: "Seeded by the WP3 solutions reservation test.",
      category: "developer-tools",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      priceCents: 10,
      isActive: true,
      avgLatencyMs: 50,
      lifecycleState: "active",
    });

    await db.insert(solutions).values({
      id: solutionId,
      slug: solSlug,
      name: "WP3 probe solution",
      description: "Seeded by the WP3 solutions reservation test.",
      category: "compliance",
      priceCents: SOLUTION_PRICE,
      componentSumCents: 10,
      valueTier: "standard",
      maintenanceLevel: "low",
      geography: "EU",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      isActive: true,
    });

    await db.insert(solutionSteps).values({
      solutionId,
      capabilitySlug: capSlug,
      stepOrder: 1,
      inputMap: { probe: "probe" },
    });
  }

  function runSolution() {
    return app.request(`http://localhost/v1/solutions/${solSlug}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ inputs: { probe: "wp3" } }),
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

  async function reservationRows() {
    return db
      .select({
        id: walletReservations.id,
        state: walletReservations.state,
        amountCents: walletReservations.amountCents,
      })
      .from(walletReservations)
      .where(eq(walletReservations.userId, userId));
  }

  async function ledgerSum(): Promise<number> {
    const rows = await db
      .select({ amountCents: walletTransactions.amountCents })
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId));
    return rows.reduce((sum, r) => sum + r.amountCents, 0);
  }

  it("captures the reservation when the solution succeeds", async () => {
    await seed();
    stepShouldFail = false;

    const res = await runSolution();
    expect(res.status).toBe(200);

    const [reservation] = await reservationRows();
    expect(reservation).toBeDefined();
    // Captured, not left open — an open reservation on a finished run is what
    // would let the reconciler refund work the customer received.
    expect(reservation!.state).toBe("captured");
    expect(reservation!.amountCents).toBe(SOLUTION_PRICE);

    expect(await balance()).toBe(STARTING_BALANCE - SOLUTION_PRICE);
    expect(await ledgerSum()).toBe(await balance());
  }, 120_000);

  it("releases the reservation and refunds when every step fails", async () => {
    await seed();
    stepShouldFail = true;

    const res = await runSolution();
    // The route's own contract: a fully failed run is not charged.
    expect([200, 500]).toContain(res.status);

    const [reservation] = await reservationRows();
    expect(reservation).toBeDefined();
    expect(reservation!.state).toBe("released");

    // Money back, and the ledger explains it.
    expect(await balance()).toBe(STARTING_BALANCE);
    expect(await ledgerSum()).toBe(await balance());
  }, 120_000);

  it("leaves nothing for the reconciler to find after a completed run", async () => {
    // The property that matters operationally: a settled run must not appear
    // in findAbandoned, however long it sat, or the reconciler would refund
    // completed work.
    await seed();
    stepShouldFail = false;
    await runSolution();

    await db
      .update(walletReservations)
      .set({ deadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(walletReservations.userId, userId));

    const reservations = await import("../lib/wallet-reservations.js");
    expect(await reservations.findAbandoned(db)).toHaveLength(0);
  }, 120_000);
});
