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


// Environment is set only when the lane is actually going to run. These
// module-level assignments execute even when the suite skips, so applying them
// unconditionally leaked configuration into every other suite in a full-suite
// run and made an unrelated admin-auth test fail intermittently.
if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "wp1-idem-secret-at-least-32-chars-long-00000";
  process.env.ADMIN_SECRET ??= "wp1-idem-admin-secret-at-least-32-chars-00000";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_wp1_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_wp1_placeholder";
}

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

  async function seedCapability(
    slug: string,
    opts: { isFreeTier?: boolean; priceCents?: number } = {},
  ) {
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
      priceCents: opts.priceCents ?? PRICE_CENTS,
      isActive: true,
      isFreeTier: opts.isFreeTier ?? false,
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

  it("a different payload under the same key is a 409, not a replay (WP6 inverts the WP1 pin)", async () => {
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

    // WP6 binds the key to a fingerprint of the request it was issued for, so
    // reusing it for different inputs is a client bug rather than a retry.
    // Pre-WP6 this returned 200 carrying the FIRST call's answer.
    expect(second.status).toBe(409);
    const body = (await second.json()) as any;
    expect(body.error_code).toBe("idempotency_key_reused");
    // And crucially it does NOT hand over the earlier result.
    expect(JSON.stringify(body)).not.toContain("original");
  }, 120_000);

  it("a different capability under the same key is a 409, not the first one's output (WP6)", async () => {
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

    expect(second.status).toBe(409);
    const body = (await second.json()) as any;

    expect(body.error_code).toBe("idempotency_key_reused");

    // The property that matters: capability A's output is NOT handed to a
    // caller who asked for B. Pre-WP6 it was, and the response labelled it as
    // B — worse than a stale replay, because the caller is told it received
    // something it did not.
    expect(JSON.stringify(body)).not.toContain('"from":"A"');
  }, 120_000);

  it("the same key from a different customer is independent (WP6)", async () => {
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

    // WP6 scopes the unique index to (user_id, idempotency_key), so customer
    // two's key is their own. Pre-WP6 the index was global while the replay
    // lookup was per-user, so customer two neither replayed nor inserted and
    // got an unhandled 500 — which also leaked whether a key existed anywhere
    // on the platform.
    const other = await callDo(apiKeyTwo, body, sharedKey);
    expect(other.status).toBe(200);

    // Independent: customer two gets their OWN execution, not customer one's.
    const otherBody = (await other.json()) as any;
    expect(otherBody.meta?.idempotency_replay ?? false).toBe(false);
  }, 120_000);

  it("binds the key on the FREE-TIER path too (the review's blocking finding)", async () => {
    // Every case above seeds a PAID capability, so all four route through
    // executeSync and none touched executeFreeTierAuthenticated. That path took
    // the fingerprint as a parameter and never wrote it, so its rows carried a
    // NULL fingerprint — and a NULL fingerprint replays by design. The guard
    // was permanently off for free-tier keys, and the parameter's presence made
    // it read as done.
    await seedCapability(slugA, { isFreeTier: true, priceCents: 0 });
    await seedCapability(slugB, { isFreeTier: true, priceCents: 0 });
    const apiKey = await seedUser();
    const key = randomUUID();

    const first = await callDo(
      apiKey,
      { capability_slug: slugA, inputs: { probe: "x" }, max_price_cents: PRICE_CENTS },
      key,
    );
    expect(first.status).toBe(200);

    const second = await callDo(
      apiKey,
      { capability_slug: slugB, inputs: { probe: "x" }, max_price_cents: PRICE_CENTS },
      key,
    );
    expect(second.status).toBe(409);
    expect(((await second.json()) as any).error_code).toBe("idempotency_key_reused");
  }, 120_000);

  it("rejects an over-long key with 400, not a Postgres 500", async () => {
    await seedCapability(slugA);
    const apiKey = await seedUser();
    const res = await callDo(
      apiKey,
      { capability_slug: slugA, inputs: { probe: "x" }, max_price_cents: PRICE_CENTS },
      "k".repeat(300),
    );
    expect(res.status).toBe(400);
  }, 120_000);
});
