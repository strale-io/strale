/**
 * Integration tests for GET /v1/capabilities/:slug (Phase A0c.1.v2).
 *
 * Phase A0b shipped a cost_class taxonomy on `capabilities` and a
 * dispatcher gate that refuses internal_test invocations for paid
 * capabilities (DEC-20260512-A). The frontend's `isSQSUnqualified`
 * filter currently hides capabilities labelled "Unverified" — which
 * paid_prepaid / paid_subscription capabilities will become once the
 * gate denies them test traffic. A0c.1.v2 adds two fields to the
 * /v1/capabilities/:slug response so the frontend can distinguish
 * "paid capability awaiting first customer call" from "capability
 * with genuine quality issues":
 *
 *   - cost_class: capabilities.cost_class column (Block 0067).
 *   - last_customer_call_at: MAX(transactions.created_at) filtered to
 *     exclude internal test-runner writes (user_id != system user).
 *
 * The filter convention matches lib/daily-digest/fetch-platform.ts
 * (cited at audit time): customer paths set user_id = real_user or
 * NULL (free-tier); test-runner.ts:1270 writes user_id = system
 * user, identified by email 'system@strale.internal'. Per
 * DEC-20260504-A audit-follow-up test coverage, the most important
 * regression test is "filter ignores system@strale.internal" — a
 * future refactor that drops the user filter would silently leak
 * test-runner traffic into the customer-facing surface.
 *
 * Pattern follows do.spend-cap.integration.test.ts: gated on
 * DATABASE_URL_TEST so CI without a Postgres harness skips cleanly;
 * local dev with a test DB exercises the real query round-trip.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { capabilitiesRoute } from "./capabilities.js";
import { transactions, users, capabilities } from "../db/schema.js";

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("GET /v1/capabilities/:slug — cost_class + last_customer_call_at", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let systemUserId: string;
  // Track every row we create so afterEach can purge precisely. Slug + id
  // pairs let us delete the dependent transactions before the capability
  // row's FK constraint blocks the parent delete.
  const createdCapabilityIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);

    // Ensure the system user exists. test-runner.ts:1383 creates this
    // row on demand; in a fresh test DB it may not exist yet. Idempotent
    // insert keeps repeated test runs stable.
    const sys = await client`
      INSERT INTO users (id, email, api_key_hash, key_prefix)
      VALUES (gen_random_uuid(), 'system@strale.internal', ${`test-system-${randomUUID()}`}, ${`sys_${randomUUID().slice(0, 8)}`})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
    `;
    systemUserId = sys[0].id;
  });

  afterAll(async () => {
    await client.end({ timeout: 2 });
  });

  afterEach(async () => {
    if (createdCapabilityIds.length > 0) {
      await client`DELETE FROM transactions WHERE capability_id IN ${client(createdCapabilityIds)}`;
      await client`DELETE FROM capabilities WHERE id IN ${client(createdCapabilityIds)}`;
      createdCapabilityIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await client`DELETE FROM users WHERE id IN ${client(createdUserIds)}`;
      createdUserIds.length = 0;
    }
  });

  async function seedCap(opts: { costClass: string | null }): Promise<{ id: string; slug: string }> {
    const slug = `test-cost-class-${randomUUID().slice(0, 8)}`;
    const id = randomUUID();
    await db.insert(capabilities).values({
      id,
      slug,
      name: `Test ${slug}`,
      description: "Integration test capability for Phase A0c.1.v2 regression coverage. Should not appear in production.",
      category: "validation",
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object", properties: {} },
      priceCents: 0,
      isActive: true,
      marketplaceEligible: true,
      lifecycleState: "active",
      visible: true,
      costClass: opts.costClass,
    });
    createdCapabilityIds.push(id);
    return { id, slug };
  }

  async function seedCustomerUser(): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({
      id,
      email: `customer-${randomUUID().slice(0, 8)}@example.com`,
      apiKeyHash: `test-key-${randomUUID()}`,
      keyPrefix: `cust_${randomUUID().slice(0, 8)}`,
    });
    createdUserIds.push(id);
    return id;
  }

  async function seedTransaction(opts: {
    capabilityId: string;
    userId: string | null;
    status?: "completed" | "failed" | "pending";
    createdAt: Date;
  }): Promise<void> {
    await db.insert(transactions).values({
      capabilityId: opts.capabilityId,
      userId: opts.userId,
      status: opts.status ?? "completed",
      input: {},
      priceCents: 0,
      completedAt: opts.createdAt,
      createdAt: opts.createdAt,
    });
  }

  async function fetchCap(slug: string): Promise<Record<string, unknown>> {
    const res = await capabilitiesRoute.request(`/${slug}`);
    expect(res.status, `expected 200 for /${slug}, got ${res.status}`).toBe(200);
    return (await res.json()) as Record<string, unknown>;
  }

  // ── 1. cost_class field appears in response when classified ─────────────
  it("returns cost_class when the capability is classified", async () => {
    const { slug } = await seedCap({ costClass: "free_quota" });
    const body = await fetchCap(slug);
    expect(body.cost_class).toBe("free_quota");
  });

  // ── 2. cost_class is null for unclassified caps (inverted default) ──────
  it("returns cost_class: null for unclassified caps (not omitted)", async () => {
    const { slug } = await seedCap({ costClass: null });
    const body = await fetchCap(slug);
    expect(body).toHaveProperty("cost_class");
    expect(body.cost_class).toBeNull();
  });

  // ── 3. last_customer_call_at reflects the latest customer txn ───────────
  it("returns the most recent customer-initiated completed timestamp", async () => {
    const { id, slug } = await seedCap({ costClass: "free_unlimited" });
    const customerId = await seedCustomerUser();
    const recent = new Date("2026-05-12T08:00:00Z");
    const older = new Date("2026-05-10T08:00:00Z");
    await seedTransaction({ capabilityId: id, userId: customerId, createdAt: older });
    await seedTransaction({ capabilityId: id, userId: customerId, createdAt: recent });
    const body = await fetchCap(slug);
    expect(body.last_customer_call_at).not.toBeNull();
    expect(new Date(body.last_customer_call_at as string).toISOString()).toBe(recent.toISOString());
  });

  // ── 4. last_customer_call_at is null when no customer txn exists ────────
  it("returns last_customer_call_at: null when only system-user txns exist", async () => {
    const { id, slug } = await seedCap({ costClass: "paid_prepaid" });
    // Seed an internal test-runner transaction only.
    await seedTransaction({
      capabilityId: id,
      userId: systemUserId,
      createdAt: new Date("2026-05-12T09:00:00Z"),
    });
    const body = await fetchCap(slug);
    expect(body).toHaveProperty("last_customer_call_at");
    expect(body.last_customer_call_at).toBeNull();
  });

  // ── 5. CORE regression: filter ignores system@strale.internal ───────────
  // Per DEC-20260504-A: this test must fail against an un-applied fix.
  // A future refactor that drops the system-user exclusion from the
  // subquery would let the (more recent) test-runner timestamp leak
  // through here, breaking the frontend's "awaiting customer traffic"
  // signal for paid caps.
  it("ignores system@strale.internal transactions even when more recent than customer ones", async () => {
    const { id, slug } = await seedCap({ costClass: "free_quota" });
    const customerId = await seedCustomerUser();
    const customerTimestamp = new Date("2026-05-11T10:00:00Z");
    const internalTimestamp = new Date("2026-05-12T10:00:00Z"); // newer
    await seedTransaction({ capabilityId: id, userId: customerId, createdAt: customerTimestamp });
    await seedTransaction({ capabilityId: id, userId: systemUserId, createdAt: internalTimestamp });
    const body = await fetchCap(slug);
    expect(new Date(body.last_customer_call_at as string).toISOString()).toBe(
      customerTimestamp.toISOString(),
    );
  });
});
