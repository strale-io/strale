/**
 * Contract test: GET /v1/capabilities (LIST) ↔ GET /v1/capabilities/:slug
 * (DETAIL) field-parity invariant for fields the strale-frontend consumes
 * from both surfaces.
 *
 * Why this exists. A0c.1.v2 (PRs #96, #97) added `cost_class` and
 * `last_customer_call_at` to the DETAIL handler only. The frontend's
 * `useCapability(slug)` hook filters `useCapabilities()` locally — both
 * the /capabilities listing UI and the /capabilities/:slug detail page
 * read from the LIST endpoint shape. The A0c.2b "Awaiting traffic" badge
 * silently failed in production until A0c.1.v3 (PR #103) extended the
 * LIST handler too.
 *
 * The class of failure: a future field added to one handler but not the
 * other will recreate the same bug. PR #103's tests cover the specific
 * fields. This file covers the class — for any field the frontend reads
 * from both surfaces, both handlers must emit it with equal values.
 *
 * Approach (rejected alternatives in spec): named shared-fields set, not
 * strict superset/subset. List has intentional add-ons (search_tags,
 * freshness_level, last_tested_at — consumed only by the listing UI, not
 * by useCapability(slug)) and detail has its own (partOfSolutions — the
 * detail page renders related solutions). Those intentional asymmetries
 * are NOT in FRONTEND_SHARED_FIELDS and so are not checked here.
 *
 * Pattern follows do.spend-cap.integration.test.ts and the existing
 * capabilities.integration.test.ts: gated on DATABASE_URL_TEST so CI
 * without a Postgres harness skips cleanly; local dev with a test DB
 * exercises the real query round-trip. Per the DEC-20260504-A
 * test-harness exemption, mutation verification of this contract
 * requires a developer with DATABASE_URL_TEST set — the integration
 * test isn't run in CI today.
 *
 * Per DEC-20260513-A open follow-up.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { capabilitiesRoute } from "./capabilities.js";
import { capabilities } from "../db/schema.js";

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/**
 * Fields the strale-frontend consumes from BOTH list and detail endpoints.
 *
 * Add a field here when:
 *   1. The frontend consumes it from a capability list/detail page.
 *   2. The backend adds it to one handler.
 * The test will fail if the field is missing from the other handler,
 * forcing the developer to either (a) add it to both, or (b) confirm
 * the field doesn't belong in this set and remove it.
 *
 * Removing a field requires confirming no frontend consumer reads it
 * from the LIST endpoint.
 *
 * Intentional asymmetries (NOT in this set):
 *   - LIST-only: search_tags, freshness_level, last_tested_at — consumed
 *     by the /capabilities listing UI, not by useCapability(slug).
 *   - DETAIL-only: partOfSolutions — the detail page renders related
 *     solutions; the listing UI doesn't need them.
 */
const FRONTEND_SHARED_FIELDS = [
  "slug",
  "name",
  "description",
  "category",
  "price_cents",
  "input_schema",
  "output_schema",
  "transparency_tag",
  "geography",
  "data_source",
  "is_free_tier",
  "cost_class",            // added A0c.1.v2 (detail) + A0c.1.v3 (list, PR #103)
  "last_customer_call_at", // added A0c.1.v2 (detail) + A0c.1.v3 (list, PR #103)
] as const;

describeMaybe("Capability endpoint contract: list ↔ detail field parity", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const createdCapabilityIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 2 });
    db = drizzle(client);

    // The LIST handler's last_customer_call_at subquery references the
    // system user by email; ensure the row exists so the WHERE clause
    // doesn't degenerate. test-runner.ts:1383 creates it on demand in
    // prod; in a fresh test DB the upsert keeps repeated runs stable.
    await client`
      INSERT INTO users (id, email, api_key_hash, key_prefix)
      VALUES (gen_random_uuid(), 'system@strale.internal', ${`test-system-${randomUUID()}`}, ${`sys_${randomUUID().slice(0, 8)}`})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    `;
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

  async function seedSampleCap(costClass: string | null): Promise<{ id: string; slug: string }> {
    const slug = `test-contract-${randomUUID().slice(0, 8)}`;
    const id = randomUUID();
    await db.insert(capabilities).values({
      id,
      slug,
      name: `Contract test ${slug}`,
      description: "Integration test capability for the list↔detail contract invariant. Should not appear in production.",
      category: "validation",
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object", properties: {} },
      priceCents: 5,
      isActive: true,
      marketplaceEligible: true,
      lifecycleState: "active",
      visible: true,
      costClass,
      transparencyTag: "algorithmic",
      isFreeTier: false,
      dataSource: "test fixture",
      geography: "global",
    });
    createdCapabilityIds.push(id);
    return { id, slug };
  }

  it("FRONTEND_SHARED_FIELDS is non-empty and includes the A0c.1 fields", () => {
    expect(FRONTEND_SHARED_FIELDS.length).toBeGreaterThan(0);
    // Pin the canonical A0c.1 failure-mode fields so a future cleanup
    // that drops them from the shared-fields set has to do so deliberately.
    expect(FRONTEND_SHARED_FIELDS).toContain("cost_class");
    expect(FRONTEND_SHARED_FIELDS).toContain("last_customer_call_at");
  });

  for (const field of FRONTEND_SHARED_FIELDS) {
    it(`field "${field}" is present on both LIST and DETAIL with equal values`, async () => {
      // Seed a known-state capability so the assertion exercises a row
      // we control, regardless of what else is in the DB.
      const { slug } = await seedSampleCap("free_quota");

      // LIST: locate our seeded slug in the array response.
      const listRes = await capabilitiesRoute.request("/");
      expect(listRes.status, `LIST expected 200, got ${listRes.status}`).toBe(200);
      const listBody = (await listRes.json()) as { capabilities: Array<Record<string, unknown>> };
      const listEntry = listBody.capabilities.find((c) => c.slug === slug);
      expect(listEntry, `LIST missing entry for seeded slug ${slug}`).toBeDefined();

      // DETAIL: fetch the same slug.
      const detailRes = await capabilitiesRoute.request(`/${slug}`);
      expect(detailRes.status, `DETAIL expected 200 for ${slug}, got ${detailRes.status}`).toBe(200);
      const detailEntry = (await detailRes.json()) as Record<string, unknown>;

      // Shape invariant: the field must exist on both responses.
      expect(
        listEntry,
        `LIST entry for ${slug} missing field "${field}" — contract violated; add the field to the LIST handler in capabilities.ts or remove it from FRONTEND_SHARED_FIELDS.`,
      ).toHaveProperty(field);
      expect(
        detailEntry,
        `DETAIL entry for ${slug} missing field "${field}" — contract violated; add the field to the DETAIL handler in capabilities.ts or remove it from FRONTEND_SHARED_FIELDS.`,
      ).toHaveProperty(field);

      // Value invariant: catches serializer drift where one handler emits
      // a Date and the other an ISO string, one applies a default and the
      // other doesn't, etc.
      expect(
        listEntry![field],
        `field "${field}" value differs between LIST and DETAIL for ${slug}: list=${JSON.stringify(listEntry![field])}, detail=${JSON.stringify(detailEntry[field])}`,
      ).toEqual(detailEntry[field]);
    });
  }
});
