/**
 * Integration test for spendCapWouldExceed against a real Postgres.
 *
 * This is the route-level harness flagged as deferred in PR #43. It
 * runs only when DATABASE_URL_TEST is set in the environment. Without
 * the env var the suite skips cleanly, so local-dev without a test
 * database keeps passing.
 *
 * Why a separate file from do.spend-cap.test.ts: the unit test is
 * pure and runs in every CI tick. This file requires a real DB and
 * is opt-in. Splitting them keeps the always-run suite fast.
 *
 * What this catches that the unit test cannot:
 *   - Real postgres-js bind-parameter encoding. The unit test
 *     simulates the encoder by walking SQL queryChunks; this test
 *     exercises the actual driver round-trip.
 *   - Drizzle's column-type serialization for Date → timestamptz.
 *     The unit test asserts no Date *reaches* tx.execute(sql``); this
 *     test confirms the typed-column path round-trips correctly.
 *   - The status filter ('completed','executing') applies as expected
 *     against real rows.
 *
 * Setup for running locally:
 *   1. Start a local Postgres (e.g. `docker run --rm -p 5433:5432
 *      -e POSTGRES_PASSWORD=test postgres:15`).
 *   2. Apply the strale schema (`drizzle-kit push` or run migrations
 *      against the test DB).
 *   3. Set DATABASE_URL_TEST to point at it before running:
 *      `DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/postgres
 *       npx vitest run src/routes/do.spend-cap.integration.test.ts`
 *
 * The test isolates itself by inserting a fresh test user per run
 * (UUIDs are random) and cleaning up its rows in afterEach.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { spendCapWouldExceed } from "./do.js";
import { transactions, users, wallets, capabilities } from "../db/schema.js";

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;

// Skip the entire suite when no test DB is configured. Local devs and
// CI ticks without a Postgres harness still run the unit test in
// do.spend-cap.test.ts which captures the structural bug shape.
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("spendCapWouldExceed — real Postgres round-trip", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let testUserId: string;
  let testCapabilityId: string;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);
  });

  afterEach(async () => {
    if (testUserId) {
      await client`DELETE FROM transactions WHERE user_id = ${testUserId}`;
      await client`DELETE FROM wallets WHERE user_id = ${testUserId}`;
      await client`DELETE FROM users WHERE id = ${testUserId}`;
    }
    if (testCapabilityId) {
      await client`DELETE FROM capabilities WHERE id = ${testCapabilityId}`;
    }
  });

  async function seedUserAndCapability(opts: { capCents: number }) {
    testUserId = randomUUID();
    testCapabilityId = randomUUID();
    const apiKeyHash = `test-key-${randomUUID()}`;
    const keyPrefix = `test_${randomUUID().slice(0, 8)}`;
    const slug = `test-spend-cap-${randomUUID().slice(0, 8)}`;

    await db.insert(users).values({
      id: testUserId,
      email: `spend-cap-test-${testUserId}@test.local`,
      apiKeyHash,
      keyPrefix,
      maxSpendPerHourCents: opts.capCents,
    });
    await db.insert(wallets).values({
      userId: testUserId,
      balanceCents: 100_000,
    });
    await db.insert(capabilities).values({
      id: testCapabilityId,
      slug,
      name: "Test capability for spend-cap integration",
      description: "Synthetic capability for spendCapWouldExceed integration tests.",
      category: "validation",
      priceCents: 10,
      inputSchema: { type: "object", properties: {}, required: [] },
      outputSchema: { type: "object", properties: {} },
      capabilityType: "deterministic",
      transparencyTag: "algorithmic",
    });
    return { userId: testUserId, capabilityId: testCapabilityId };
  }

  async function seedTransaction(opts: {
    userId: string;
    capabilityId: string;
    priceCents: number;
    status: "completed" | "executing" | "failed";
    createdAt?: Date;
  }) {
    const txnId = randomUUID();
    const created = opts.createdAt ?? new Date();
    await client`
      INSERT INTO transactions
        (id, user_id, capability_id, status, input, price_cents, created_at)
      VALUES
        (${txnId}::uuid, ${opts.userId}::uuid, ${opts.capabilityId}::uuid,
         ${opts.status}, ${JSON.stringify({})}::jsonb, ${opts.priceCents}, ${created.toISOString()}::timestamptz)
    `;
    return txnId;
  }

  it("does NOT throw on the round-trip — postgres-js encoder accepts the typed-column Date binding", async () => {
    // This is the direct repro of the PR-43 production failure. Before
    // the fix, this call would throw `TypeError [ERR_INVALID_ARG_TYPE]:
    // Received an instance of Date` from the postgres-js bind encoder.
    // After the fix, it round-trips cleanly.
    const { userId } = await seedUserAndCapability({ capCents: 100 });
    await db.transaction(async (tx) => {
      const result = await spendCapWouldExceed(tx, userId, 25, 100);
      expect(result).toBeNull(); // empty window → 0 spent
    });
  });

  it("returns null when prior spend + requested ≤ cap", async () => {
    const { userId, capabilityId } = await seedUserAndCapability({ capCents: 100 });
    await seedTransaction({ userId, capabilityId, priceCents: 50, status: "completed" });

    await db.transaction(async (tx) => {
      const result = await spendCapWouldExceed(tx, userId, 25, 100);
      expect(result).toBeNull();
    });
  });

  it("returns { spent } when prior spend + requested > cap", async () => {
    const { userId, capabilityId } = await seedUserAndCapability({ capCents: 100 });
    await seedTransaction({ userId, capabilityId, priceCents: 80, status: "completed" });

    await db.transaction(async (tx) => {
      const result = await spendCapWouldExceed(tx, userId, 25, 100);
      expect(result).toEqual({ spent: 80 });
    });
  });

  it("counts both 'completed' and 'executing' rows (in-flight async cap-tightening)", async () => {
    const { userId, capabilityId } = await seedUserAndCapability({ capCents: 100 });
    await seedTransaction({ userId, capabilityId, priceCents: 40, status: "completed" });
    await seedTransaction({ userId, capabilityId, priceCents: 40, status: "executing" });

    await db.transaction(async (tx) => {
      const result = await spendCapWouldExceed(tx, userId, 30, 100);
      expect(result).toEqual({ spent: 80 });
    });
  });

  it("excludes 'failed' rows from the spend total", async () => {
    const { userId, capabilityId } = await seedUserAndCapability({ capCents: 100 });
    await seedTransaction({ userId, capabilityId, priceCents: 50, status: "completed" });
    await seedTransaction({ userId, capabilityId, priceCents: 90, status: "failed" });

    await db.transaction(async (tx) => {
      const result = await spendCapWouldExceed(tx, userId, 25, 100);
      // 50 (completed) + 25 (requested) = 75 ≤ 100 → null
      // The 90 'failed' row must not contribute or this would be over.
      expect(result).toBeNull();
    });
  });

  it("excludes rows older than the 1-hour window", async () => {
    const { userId, capabilityId } = await seedUserAndCapability({ capCents: 100 });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await seedTransaction({
      userId,
      capabilityId,
      priceCents: 95,
      status: "completed",
      createdAt: twoHoursAgo,
    });

    await db.transaction(async (tx) => {
      const result = await spendCapWouldExceed(tx, userId, 25, 100);
      // The 95-cent row is 2h old, outside the 1h window → not counted.
      expect(result).toBeNull();
    });
  });

  it("isolates by user_id (one capped user's spend doesn't affect another's check)", async () => {
    const { userId: userA, capabilityId } = await seedUserAndCapability({ capCents: 100 });
    const userB = randomUUID();
    const userBKey = `test-b-${randomUUID()}`;
    await db.insert(users).values({
      id: userB,
      email: `spend-cap-test-b-${userB}@test.local`,
      apiKeyHash: userBKey,
      keyPrefix: `tb_${randomUUID().slice(0, 8)}`,
    });
    await db.insert(wallets).values({ userId: userB, balanceCents: 100_000 });

    // Heavy spend on userB; should not affect userA's check.
    await seedTransaction({ userId: userB, capabilityId, priceCents: 200, status: "completed" });

    try {
      await db.transaction(async (tx) => {
        const result = await spendCapWouldExceed(tx, userA, 25, 100);
        expect(result).toBeNull();
      });
    } finally {
      await client`DELETE FROM transactions WHERE user_id = ${userB}`;
      await client`DELETE FROM wallets WHERE user_id = ${userB}`;
      await client`DELETE FROM users WHERE id = ${userB}`;
    }
  });
});
