/**
 * Vendor suspension audit writes against real Postgres.
 *
 * jsonb_build_object is variadic, so bind parameters inside it have no type
 * context unless we cast them. A mock can render valid-looking SQL while the
 * server rejects it with "could not determine data type of parameter $3".
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { suspendRequiredCapabilities, restoreVendorSuspensions } from "./vendor-control-tower.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("vendor control tower against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const createdSlugs = new Set<string>();
  const createdProviders = new Set<string>();

  beforeAll(() => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
  });

  afterEach(async () => {
    for (const slug of createdSlugs) {
      await db.execute(sql`DELETE FROM health_monitor_events WHERE capability_slug = ${slug}`);
      await db.execute(sql`DELETE FROM vendor_capability_suspensions WHERE capability_slug = ${slug}`);
      await db.execute(sql`DELETE FROM vendor_capability_dependencies WHERE capability_slug = ${slug}`);
      await db.execute(sql`DELETE FROM capabilities WHERE slug = ${slug}`);
    }
    for (const provider of createdProviders) {
      await db.execute(sql`DELETE FROM vendor_accounts WHERE provider_name = ${provider}`);
    }
    createdSlugs.clear();
    createdProviders.clear();
  });

  afterAll(async () => {
    await client.end();
  });

  it("suspends and restores a dependency while recording typed JSON audit details", async () => {
    const suffix = randomUUID().slice(0, 8);
    const provider = `test-vendor-${suffix}`;
    const slug = `test-vendor-cap-${suffix}`;
    createdProviders.add(provider);
    createdSlugs.add(slug);

    await db.execute(sql`
      INSERT INTO vendor_accounts (
        provider_name, display_name, billing_model, monitor_mode, status,
        remaining_units, usage_unit
      ) VALUES (${provider}, ${provider}, 'prepaid', 'api_balance', 'auth_error', 0, 'credit')
    `);
    await db.execute(sql`
      INSERT INTO capabilities (
        slug, name, description, category, price_cents, input_schema,
        output_schema, lifecycle_state, visible, x402_enabled
      ) VALUES (
        ${slug}, ${slug}, 'vendor tower integration fixture', 'validation', 1,
        '{}'::jsonb, '{}'::jsonb, 'active', true, true
      )
    `);
    await db.execute(sql`
      INSERT INTO vendor_capability_dependencies (
        provider_name, capability_slug, dependency_kind, units_per_execution
      ) VALUES (${provider}, ${slug}, 'required', 1)
    `);

    await expect(suspendRequiredCapabilities(provider, "auth_error", null))
      .resolves.toEqual([slug]);

    await db.execute(sql`
      UPDATE vendor_accounts
         SET status = 'healthy', remaining_units = 100
       WHERE provider_name = ${provider}
    `);
    await expect(restoreVendorSuspensions(provider)).resolves.toEqual([slug]);

    const events = await db.execute(sql`
      SELECT event_type, details
        FROM health_monitor_events
       WHERE capability_slug = ${slug}
       ORDER BY created_at
    `) as unknown as Array<{ event_type: string; details: Record<string, unknown> }>;
    expect(events.map((event) => event.event_type)).toEqual([
      "vendor_suspension",
      "vendor_restoration",
    ]);
    expect(events[0]?.details).toMatchObject({
      provider,
      status: "auth_error",
      restore_after: null,
    });
  });
});
