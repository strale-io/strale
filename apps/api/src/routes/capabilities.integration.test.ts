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

// ─── Phase A0c.1.v3 (2026-05-13): list-endpoint regression tests ────────────
//
// Diagnostic surfaced 2026-05-12 ~22:00 UTC: A0c.1.v2 (PR #96/#97) extended
// only the detail handler. The frontend's `useCapability(slug)` filters
// `useCapabilities()` locally, so both detail + list surfaces depended on
// the list endpoint's shape. Missing `cost_class` + `last_customer_call_at`
// on the list response → A0c.2b's badge silently failed everywhere.
//
// These three tests mirror the canonical production failure mode
// (paid_prepaid + null) so a future refactor that drops the new fields
// from the list serializer trips immediately.
describeMaybe("GET /v1/capabilities (LIST) — cost_class + last_customer_call_at", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let systemUserId: string;
  const createdCapabilityIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);
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

  async function seedListCap(opts: { costClass: string | null }): Promise<{ id: string; slug: string }> {
    const slug = `test-list-${randomUUID().slice(0, 8)}`;
    const id = randomUUID();
    await db.insert(capabilities).values({
      id,
      slug,
      name: `Test ${slug}`,
      description: "Integration test capability for Phase A0c.1.v3 list-endpoint regression.",
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

  async function seedTxn(opts: {
    capabilityId: string;
    userId: string | null;
    createdAt: Date;
    status?: "completed" | "failed" | "pending";
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

  async function fetchListBySlug(slug: string): Promise<Record<string, unknown> | undefined> {
    const res = await capabilitiesRoute.request("/");
    expect(res.status, `expected 200 for /, got ${res.status}`).toBe(200);
    const body = (await res.json()) as { capabilities: Array<Record<string, unknown>> };
    return body.capabilities.find((c) => c.slug === slug);
  }

  // ── 1. CANONICAL PRODUCTION FAILURE MODE ──────────────────────────────────
  // paid_prepaid cap with no transactions: list endpoint must emit
  // cost_class='paid_prepaid' AND last_customer_call_at=null. This is the
  // exact agent-trace-analyze case that surfaced the bug 2026-05-12 — both
  // fields had to be present in the LIST response for the frontend's badge
  // to fire, because useCapability(slug) filters the list locally.
  it("emits cost_class and last_customer_call_at=null for paid_prepaid cap with no transactions", async () => {
    const { slug } = await seedListCap({ costClass: "paid_prepaid" });
    const cap = await fetchListBySlug(slug);
    expect(cap, `expected cap '${slug}' in list response`).toBeDefined();
    expect(cap).toHaveProperty("cost_class");
    expect(cap!.cost_class).toBe("paid_prepaid");
    expect(cap).toHaveProperty("last_customer_call_at");
    expect(cap!.last_customer_call_at).toBeNull();
  });

  // ── 2. paid_prepaid WITH a customer_paid transaction ──────────────────────
  // The MAX(created_at) GROUP BY aggregation must return the transaction's
  // created_at on the list endpoint, not null. Mirrors the detail handler's
  // existing test #3 against the new batched query path.
  it("returns the customer transaction's created_at for paid_prepaid cap with traffic", async () => {
    const { id, slug } = await seedListCap({ costClass: "paid_prepaid" });
    const customerId = await seedCustomerUser();
    const txnTime = new Date("2026-05-13T08:00:00Z");
    await seedTxn({ capabilityId: id, userId: customerId, createdAt: txnTime });
    const cap = await fetchListBySlug(slug);
    expect(cap).toBeDefined();
    expect(cap!.cost_class).toBe("paid_prepaid");
    expect(cap!.last_customer_call_at).not.toBeNull();
    expect(new Date(cap!.last_customer_call_at as string).toISOString()).toBe(
      txnTime.toISOString(),
    );
  });

  // ── 3. List-endpoint WHERE clause excludes system-user transactions ──────
  // Same filter discipline as detail handler test #5. A refactor that drops
  // the system-user exclusion from the GROUP BY query would let test-runner
  // timestamps leak into the list response, breaking the badge logic for
  // every paid_prepaid cap with internal-test traffic.
  it("ignores system@strale.internal transactions in the GROUP BY aggregation", async () => {
    const { id, slug } = await seedListCap({ costClass: "paid_prepaid" });
    const customerId = await seedCustomerUser();
    const customerTime = new Date("2026-05-11T10:00:00Z");
    const internalTime = new Date("2026-05-13T10:00:00Z"); // newer
    await seedTxn({ capabilityId: id, userId: customerId, createdAt: customerTime });
    await seedTxn({ capabilityId: id, userId: systemUserId, createdAt: internalTime });
    const cap = await fetchListBySlug(slug);
    expect(cap).toBeDefined();
    // The list endpoint must return the OLDER customer-paid timestamp,
    // NOT the newer system-user timestamp.
    expect(new Date(cap!.last_customer_call_at as string).toISOString()).toBe(
      customerTime.toISOString(),
    );
  });
});
