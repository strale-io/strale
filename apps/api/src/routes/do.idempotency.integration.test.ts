/**
 * Idempotency and replay against a real Postgres (WP1, CR-03 / N4).
 *
 * The Idempotency-Key lookup on /v1/do matches on `(idempotency_key, user_id)`
 * and returns the stored row. It compares nothing else — not the request
 * payload, not the capability, not the status. The uniqueness that backstops
 * concurrent inserts is a real partial index, which a mocked db module cannot
 * enforce, so none of this was falsifiable before this lane.
 *
 * Four properties are covered. The first is the one that works. The other
 * three pin defects the re-audit found, so they are measurable and so WP6 has
 * a concrete acceptance signal — when WP6 binds the key to a request
 * fingerprint and scopes the index per user, these expectations invert.
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
process.env.AUDIT_HMAC_SECRET ??= "wp1-idem-secret-at-least-32-chars-long-00000";
process.env.ADMIN_SECRET ??= "wp1-idem-admin-secret-at-least-32-chars-00000";
process.env.STRIPE_SECRET_KEY ??= "sk_test_wp1_placeholder";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_wp1_placeholder";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const PRICE_CENTS = 25;

describeMaybe("/v1/do idempotency against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  let slugA: string;
  let slugB: string;
  const seeded: { userId: string; walletId: string }[] = [];
  const seededCaps: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 10 });
    db = drizzle(client);

    const { registerCapability } = await import("../capabilities/index.js");
    slugA = `wp1-idem-a-${randomUUID().slice(0, 8)}`;
    slugB = `wp1-idem-b-${randomUUID().slice(0, 8)}`;
    // Distinguishable outputs, so a replay that returns the WRONG
    // capability's result is visible rather than merely suspected.
    registerCapability(slugA, async (input: any) => ({
      output: { from: "A", echo: input?.probe ?? null },
      provenance: { source: "wp1-test", fetched_at: new Date().toISOString() },
    }));
    registerCapability(slugB, async (input: any) => ({
      output: { from: "B", echo: input?.probe ?? null },
      provenance: { source: "wp1-test", fetched_at: new Date().toISOString() },
    }));

    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    for (const { userId, walletId } of seeded) {
      await db.delete(transactions).where(eq(transactions.userId, userId));
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
      await db.delete(users).where(eq(users.id, userId));
    }
    seeded.length = 0;
    for (const id of seededCaps) {
      await db.delete(capabilities).where(eq(capabilities.id, id));
    }
    seededCaps.length = 0;
  });

  async function seedCapability(slug: string) {
    const id = randomUUID();
    seededCaps.push(id);
    await db.insert(capabilities).values({
      id,
      slug,
      name: `WP1 idempotency probe ${slug}`,
      description: "Seeded by the WP1 idempotency test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { from: { type: "string" } } },
      priceCents: PRICE_CENTS,
      isActive: true,
      isFreeTier: false,
      avgLatencyMs: 50,
      lifecycleState: "active",
    });
  }

  async function seedUser(balanceCents = 10_000): Promise<string> {
    const userId = randomUUID();
    const walletId = randomUUID();
    const apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;
    seeded.push({ userId, walletId });

    await db.insert(users).values({
      id: userId,
      email: `wp1-idem-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents });
    return apiKey;
  }

  function callDo(
    apiKey: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    return app.request("http://localhost/v1/do", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  }

  it("replays the stored result instead of charging twice", async () => {
    await seedCapability(slugA);
    const apiKey = await seedUser();
    const key = randomUUID();
    const body = {
      capability_slug: slugA,
      inputs: { probe: "one" },
      max_price_cents: PRICE_CENTS,
    };

    const first = await callDo(apiKey, body, key);
    const second = await callDo(apiKey, body, key);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // One execution, one charge — the property the header exists to provide.
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  }, 120_000);

  it("PINS BUG: a different payload under the same key replays the old result", async () => {
    await seedCapability(slugA);
    const apiKey = await seedUser();
    const key = randomUUID();

    await callDo(
      apiKey,
      { capability_slug: slugA, inputs: { probe: "original" }, max_price_cents: PRICE_CENTS },
      key,
    );
    const second = await callDo(
      apiKey,
      { capability_slug: slugA, inputs: { probe: "COMPLETELY DIFFERENT" }, max_price_cents: PRICE_CENTS },
      key,
    );

    // The key is not bound to a request fingerprint, so the second request's
    // inputs are ignored and the caller is handed the first request's answer.
    // A conflict (409) is the correct response. WP6 must make this fail.
    expect(second.status).toBe(200);
    const body = (await second.json()) as any;
    expect(JSON.stringify(body)).toContain("original");
    expect(JSON.stringify(body)).not.toContain("COMPLETELY DIFFERENT");
  }, 120_000);

  it("PINS BUG: a different capability under the same key returns the first one's output", async () => {
    await seedCapability(slugA);
    await seedCapability(slugB);
    const apiKey = await seedUser();
    const key = randomUUID();

    await callDo(
      apiKey,
      { capability_slug: slugA, inputs: { probe: "x" }, max_price_cents: PRICE_CENTS },
      key,
    );
    const second = await callDo(
      apiKey,
      { capability_slug: slugB, inputs: { probe: "x" }, max_price_cents: PRICE_CENTS },
      key,
    );

    expect(second.status).toBe(200);
    const body = (await second.json()) as any;

    // Capability A's output, returned for a request that asked for B — and the
    // response labels it as B. That is worse than a stale replay: the caller
    // is told it received something it did not.
    expect(JSON.stringify(body.result ?? body)).toContain('"from":"A"');
    expect(body.capability_used ?? body.result?.capability_used).toBe(slugB);
  }, 120_000);

  it("PINS BUG: the same key from a different customer collides", async () => {
    await seedCapability(slugA);
    const apiKeyOne = await seedUser();
    const apiKeyTwo = await seedUser();
    const sharedKey = randomUUID();
    const body = {
      capability_slug: slugA,
      inputs: { probe: "x" },
      max_price_cents: PRICE_CENTS,
    };

    expect((await callDo(apiKeyOne, body, sharedKey)).status).toBe(200);

    // The unique index is on idempotency_key alone, while the replay lookup is
    // scoped by user. So customer two neither replays nor succeeds: the insert
    // violates the constraint and surfaces as an unhandled 500. Two customers
    // picking the same UUID is unlikely; a client using a deterministic key
    // ("order-123") is not. It is also a weak oracle for whether a key exists
    // anywhere on the platform. WP6 scopes the index to (user_id, key).
    const other = await callDo(apiKeyTwo, body, sharedKey);
    expect(other.status).toBe(500);
  }, 120_000);
});
