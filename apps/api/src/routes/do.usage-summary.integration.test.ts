/**
 * Usage summary behind the conversion emails (WP1).
 *
 * `buildUsageSummaryForUser` selected `capability_slug` from `transactions`.
 * That column does not exist there — the table keys capabilities by
 * `capability_id` — so the query threw on every call. Both callers are the
 * low-balance and zero-balance conversion emails, dispatched through
 * `fireAndForget`, which routes the failure to a log line and returns. The
 * result was silent: every "your agent ran out of credits" email failed to
 * send, and nothing surfaced except a `conversion-email-zero-balance` entry.
 *
 * Verified against production read-only before fixing: `transactions` has
 * `capability_id` and no `capability_slug`, so this was failing in production,
 * not only in the test schema.
 *
 * A unit test could not have caught this. The query is raw SQL executed by the
 * driver, so a mocked db module returns whatever the mock is told to return
 * and the column error never happens. It needed a real Postgres, which is
 * exactly what this lane is for.
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
  capabilities,
  transactions,
} from "../db/schema.js";

process.env.FRONTEND_URL ??= "https://strale.dev";
process.env.AUDIT_HMAC_SECRET ??= "wp1-usage-secret-at-least-32-chars-long-0000";
process.env.ADMIN_SECRET ??= "wp1-usage-admin-secret-at-least-32-chars-0000";
process.env.STRIPE_SECRET_KEY ??= "sk_test_wp1_placeholder";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_wp1_placeholder";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const PRICE_CENTS = 40;

describeMaybe("conversion-email usage summary against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  let userId: string;
  let walletId: string;
  let capabilityId: string;
  let slug: string;
  let apiKey: string;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);

    const { registerCapability } = await import("../capabilities/index.js");
    slug = `wp1-usage-${randomUUID().slice(0, 8)}`;
    registerCapability(slug, async () => ({
      output: { ok: true },
      provenance: { source: "wp1-test", fetched_at: new Date().toISOString() },
    }));

    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    await db.delete(transactions).where(eq(transactions.userId, userId));
    // Ledger rows reference the wallet, so they go first or the delete trips
    // the foreign key.
    await db
      .delete(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId));
    await db.delete(wallets).where(eq(wallets.id, walletId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(capabilities).where(eq(capabilities.id, capabilityId));
  });

  async function seed(balanceCents: number) {
    userId = randomUUID();
    walletId = randomUUID();
    capabilityId = randomUUID();
    apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;

    await db.insert(users).values({
      id: userId,
      email: `wp1-usage-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents });
    await db.insert(capabilities).values({
      id: capabilityId,
      slug,
      name: "WP1 usage probe",
      description: "Seeded by the WP1 usage-summary regression test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      priceCents: PRICE_CENTS,
      isActive: true,
      isFreeTier: false,
      avgLatencyMs: 50,
      lifecycleState: "active",
    });
  }

  function callDo() {
    return app.request("http://localhost/v1/do", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        capability_slug: slug,
        inputs: { probe: "wp1" },
        max_price_cents: PRICE_CENTS,
      }),
    });
  }

  it("summarises usage without a database error", async () => {
    // Exactly one call's worth of balance, so this call drives the wallet to
    // zero and takes the zero-balance branch that builds the summary.
    await seed(PRICE_CENTS);

    const res = await callDo();
    expect(res.status).toBe(200);

    // The summary is dispatched fire-and-forget, so a thrown query cannot fail
    // the request — which is why the bug stayed invisible. Assert on the query
    // itself: pre-fix it raised `column "capability_slug" does not exist`.
    const { buildUsageSummaryForUserForTest } = await import("./do.js");
    const summary = await buildUsageSummaryForUserForTest(userId);

    expect(summary.totalCalls).toBe(1);
    expect(summary.totalSpentCents).toBe(PRICE_CENTS);
    expect(summary.topCapabilities).toEqual([{ slug, count: 1 }]);
  }, 120_000);

  it("returns an empty summary for a user with no completed calls", async () => {
    await seed(1_000);

    const { buildUsageSummaryForUserForTest } = await import("./do.js");
    const summary = await buildUsageSummaryForUserForTest(userId);

    expect(summary.totalCalls).toBe(0);
    expect(summary.topCapabilities).toEqual([]);
    expect(summary.totalSpentCents).toBe(0);
    // Always at least 1, so a "calls per day" figure cannot divide by zero.
    expect(summary.daysSinceSignup).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
