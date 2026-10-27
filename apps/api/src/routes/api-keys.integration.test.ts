/** Real-Postgres coverage in CI's integration-db lane, never a production DB. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestDatabase } from "../test-support/integration-db.js";
import { apiKeys, capabilities, solutions, solutionSteps, transactions, users, walletTransactions, wallets, walletReservations } from "../db/schema.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../lib/auth.js";
import { keyCapError, keySpending } from "../lib/api-keys.js";
import * as walletService from "../lib/wallet-service.js";
import { runMigration0124_apiKeys } from "../lib/startup-migrations.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeDb = DATABASE_URL_TEST ? describe : describe.skip;
describeDb("additional keys against real Postgres", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: typeof import("../app.js")["app"];
  let userId: string, walletId: string, capabilityId: string, slug: string;
  let primary: string, secret: string, keyId: string;
  let solutionId: string | null = null;
  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 8 }); db = drizzle(client);
    ({ app } = await import("../app.js"));
  }, 120_000);
  beforeEach(async () => {
    userId = randomUUID(); walletId = randomUUID(); capabilityId = randomUUID(); keyId = randomUUID();
    primary = generateApiKey(); secret = generateApiKey(); slug = `key-limit-${randomUUID().slice(0, 8)}`;
    const { registerCapability } = await import("../capabilities/index.js");
    registerCapability(slug, async () => ({ output: { ok: true }, provenance: { source: "test", fetched_at: new Date().toISOString() } }));
    await db.insert(users).values({ id: userId, email: `${userId}@example.test`, apiKeyHash: hashApiKey(primary), keyPrefix: getKeyPrefix(primary), maxSpendPerHourCents: 1000 });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents: 1000 });
    await db.insert(apiKeys).values({ id: keyId, userId, apiKeyHash: hashApiKey(secret), keyPrefix: getKeyPrefix(secret), label: "Agent", maxSpendPerHourCents: 25, maxSpendTotalCents: 50 });
    await db.insert(capabilities).values({ id: capabilityId, slug, name: "Key limit test", description: "Synthetic key limit test", category: "developer-tools", inputSchema: { type: "object", properties: { probe: { type: "string" } } }, outputSchema: { type: "object", properties: { ok: { type: "boolean" } } }, priceCents: 25, isActive: true, isFreeTier: false, avgLatencyMs: 20, lifecycleState: "active", visible: true });
  });
  afterEach(async () => {
    await db.delete(walletReservations).where(eq(walletReservations.userId, userId));
    await db.delete(walletTransactions).where(eq(walletTransactions.walletId, walletId));
    await db.delete(transactions).where(eq(transactions.userId, userId));
    await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
    await db.delete(wallets).where(eq(wallets.id, walletId));
    await db.delete(users).where(eq(users.id, userId));
    if (solutionId) {
      await db.delete(solutionSteps).where(eq(solutionSteps.solutionId, solutionId));
      await db.delete(solutions).where(eq(solutions.id, solutionId));
      solutionId = null;
    }
    await db.delete(capabilities).where(eq(capabilities.id, capabilityId));
  });
  afterAll(async () => { await client.end(); });
  function request(path: string, key = primary, method = "GET", body?: unknown) {
    return app.request(`http://localhost${path}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  function call(key = secret) { return request("/v1/do", key, "POST", { capability_slug: slug, inputs: { probe: "test" }, max_price_cents: 25 }); }

  it("authenticates, updates last-used once a minute and makes revoked/unknown 401 identical", async () => {
    expect((await request("/v1/wallet/balance", secret)).status).toBe(200);
    const [first] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId));
    expect(first.lastUsedAt).not.toBeNull();
    expect((await request("/v1/wallet/balance", secret)).status).toBe(200);
    const [second] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId));
    expect(second.lastUsedAt).toEqual(first.lastUsedAt);
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, keyId));
    const revoked = await request("/v1/wallet/balance", secret);
    const unknown = await request("/v1/wallet/balance", generateApiKey());
    expect(revoked.status).toBe(401); expect(unknown.status).toBe(401);
    expect(await revoked.json()).toEqual(await unknown.json());
  });
  it.each(["hourly", "total"])("two parallel calls cannot both fit one %s key budget", async (period) => {
    await db.update(apiKeys).set({ maxSpendPerHourCents: period === "hourly" ? 25 : null, maxSpendTotalCents: period === "total" ? 25 : null }).where(eq(apiKeys.id, keyId));
    const responses = await Promise.all([call(), call()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
    const rejected = responses.find((r) => r.status === 429)!;
    expect(await rejected.json()).toMatchObject({ error_code: period === "hourly" ? "key_hourly_cap_exceeded" : "key_total_cap_exceeded" });
    const entries = await db.select().from(walletTransactions).where(eq(walletTransactions.apiKeyId, keyId));
    expect(entries).toHaveLength(1); expect(entries[0].amountCents).toBe(-25);
    expect((await db.select().from(wallets).where(eq(wallets.id, walletId)))[0].balanceCents).toBe(975);
  });
  it("account cap applies across primary and additional keys; primary has no key cap", async () => {
    await db.update(users).set({ maxSpendPerHourCents: 25 }).where(eq(users.id, userId));
    expect((await call(primary)).status).toBe(200);
    const refused = await call();
    expect(refused.status).toBe(429); expect(await refused.json()).toMatchObject({ error_code: "spend_cap_exceeded" });
    expect((await call(primary)).status).toBe(429);
    const entries = await db.select().from(walletTransactions).where(eq(walletTransactions.walletId, walletId));
    expect(entries).toHaveLength(1); expect(entries[0].apiKeyId).toBeNull();
  });
  it("creates once-only secrets, lists net spending, updates, and revokes itself while primary still works", async () => {
    const created = await request("/v1/api-keys", secret, "POST", { label: "Second", max_spend_total_cents: 75 });
    expect(created.status).toBe(201); expect(created.headers.get("cache-control")).toBe("no-store");
    const data = await created.json() as any;
    expect(data.api_key).toMatch(/^sk_live_[0-9a-f]{64}$/);
    const [stored] = await db.select().from(apiKeys).where(eq(apiKeys.id, data.id));
    expect(stored.apiKeyHash).toBe(hashApiKey(data.api_key));
    expect((await request(`/v1/api-keys/${data.id}`, primary, "PATCH", { label: "Renamed", max_spend_total_cents: 0 })).status).toBe(200);
    const listed = await request("/v1/api-keys"); const listText = await listed.text();
    expect(listText).not.toContain(data.api_key); expect(listText).not.toContain(stored.apiKeyHash);
    expect(JSON.parse(listText).keys.find((k: any) => k.id === data.id)).toMatchObject({ label: "Renamed", max_spend_total_cents: 0, spent_hour_cents: 0, spent_total_cents: 0 });
    const revoked = await request(`/v1/api-keys/${data.id}`, data.api_key, "DELETE");
    expect(revoked.status).toBe(200);
    expect((await request("/v1/wallet/balance", data.api_key)).status).toBe(401);
    expect((await request("/v1/wallet/balance", primary)).status).toBe(200);
  });
  it("cannot mutate another account's key or revoke the primary through this API", async () => {
    const otherId = randomUUID();
    expect((await request(`/v1/api-keys/${otherId}`, primary, "PATCH", { label: "wrong" })).status).toBe(404);
    expect((await request(`/v1/api-keys/${otherId}`, primary, "DELETE")).status).toBe(404);
    expect((await request(`/v1/api-keys/${userId}`, primary, "DELETE")).status).toBe(404);
    expect((await request("/v1/wallet/balance")).status).toBe(200);
  });
  it("rejects invalid cap, malformed IDs, empty updates and unauthenticated management", async () => {
    expect((await request("/v1/api-keys", primary, "POST", { label: "x", max_spend_total_cents: -1 })).status).toBe(400);
    expect((await request(`/v1/api-keys/${keyId}`, primary, "PATCH", {})).status).toBe(400);
    expect((await request("/v1/api-keys/invalid", primary, "DELETE")).status).toBe(400);
    expect((await app.request("http://localhost/v1/api-keys")).status).toBe(401);
  });
  it("refunds release key budget and an old refund cannot offset new spending", async () => {
    const referenceId = randomUUID();
    await db.transaction(async (tx) => {
      const wallet = await walletService.lockWalletForUser(tx, userId);
      await walletService.debit(tx, { wallet: wallet!, apiKeyId: keyId, amountCents: 25, referenceId, description: "hold" });
    });
    expect((await keySpending(db, userId, keyId))[0]).toMatchObject({ spent_hour_cents: 25, spent_total_cents: 25 });
    await db.transaction((tx) => walletService.refund(tx, { walletId, amountCents: 25, referenceId, description: "release" }));
    expect((await keySpending(db, userId, keyId))[0]).toMatchObject({ spent_hour_cents: 0, spent_total_cents: 0 });
    await db.execute(sql`UPDATE wallet_transactions SET created_at = now() - interval '2 hours' WHERE reference_id = ${referenceId} AND type = 'purchase'`);
    await db.insert(walletTransactions).values({ walletId, apiKeyId: keyId, amountCents: -25, type: "purchase", referenceId: randomUUID() });
    expect((await keySpending(db, userId, keyId))[0]).toMatchObject({ spent_hour_cents: 25, spent_total_cents: 25 });
  });
  it("uses current limits under the wallet lock and denies a revoked key", async () => {
    await db.update(apiKeys).set({ maxSpendTotalCents: 0 }).where(eq(apiKeys.id, keyId));
    await db.transaction(async (tx) => {
      await walletService.lockWalletForUser(tx, userId);
      expect(await keyCapError(tx, userId, keyId, 25)).toMatchObject({ error_code: "key_total_cap_exceeded" });
    });
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, keyId));
    await db.transaction(async (tx) => {
      await walletService.lockWalletForUser(tx, userId);
      expect(await keyCapError(tx, userId, keyId, 25)).toMatchObject({ error_code: "unauthorized" });
    });
  });
  it("keeps async reservations inside key caps and tags their debit", async () => {
    await db.update(capabilities).set({ avgLatencyMs: 15000 }).where(eq(capabilities.id, capabilityId));
    const started = await call();
    expect(started.status).toBe(202);
    const data = await started.json() as any;
    const refused = await call();
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error_code: "key_hourly_cap_exceeded" });
    const entries = await db.select().from(walletTransactions).where(eq(walletTransactions.apiKeyId, keyId));
    expect(entries).toHaveLength(1); expect(entries[0].amountCents).toBe(-25);
    // Let the background finalizer finish before fixture cleanup.
    const id = data.result?.transaction_id ?? data.transaction_id;
    for (let i = 0; i < 100; i++) {
      const [row] = await db.select().from(transactions).where(eq(transactions.id, id));
      if (row.status !== "executing") return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Async test did not finalize");
  });
  it("solution debits are attributed and cannot bypass a key's budget", async () => {
    solutionId = randomUUID();
    const solSlug = `key-sol-${randomUUID().slice(0, 8)}`;
    await db.insert(solutions).values({ id: solutionId, slug: solSlug, name: "Key test", description: "Key test bundle", category: "compliance", priceCents: 25, componentSumCents: 25, valueTier: "standard", maintenanceLevel: "low", geography: "EU", inputSchema: { type: "object" }, isActive: true });
    await db.insert(solutionSteps).values({ solutionId, capabilitySlug: slug, stepOrder: 1, inputMap: { probe: "probe" } });
    const path = `/v1/solutions/${solSlug}/execute`;
    expect((await request(path, secret, "POST", { inputs: { probe: "test" } })).status).toBe(200);
    const refused = await request(path, secret, "POST", { inputs: { probe: "test" } });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error_code: "key_hourly_cap_exceeded" });
    const entries = await db.select().from(walletTransactions).where(eq(walletTransactions.apiKeyId, keyId));
    expect(entries).toHaveLength(1);
  });
  it("account closure revokes and anonymizes additional keys", async () => {
    const closed = await request("/v1/auth/me", primary, "DELETE");
    expect(closed.status).toBe(200);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId));
    expect(row.revokedAt).not.toBeNull(); expect(row.label).toBe("REDACTED");
    expect(row.apiKeyHash).not.toBe(hashApiKey(secret));
    expect((await request("/v1/wallet/balance", secret)).status).toBe(401);
    expect((await request("/v1/wallet/balance", primary)).status).toBe(401);
  });
  it("migration re-runs without changing keys, primary hash or ledger attribution", async () => {
    await runMigration0124_apiKeys(db); await runMigration0124_apiKeys(db);
    expect((await db.select().from(users).where(eq(users.id, userId)))[0].apiKeyHash).toBe(hashApiKey(primary));
    expect((await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)))[0].apiKeyHash).toBe(hashApiKey(secret));
  });
});
