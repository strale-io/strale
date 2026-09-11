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
import {
  rearmVendorAfterCredentialChange,
  recordBalanceNotApplicable,
  recordVendorHttpFailure,
  restoreVendorSuspensions,
  suspendRequiredCapabilities,
} from "./vendor-control-tower.js";

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

  // 2026-09-11: this write is refused by Postgres 16 with "could not determine
  // data type of parameter $4" — the fingerprint appeared alone in an IS NOT
  // NULL test, which gives the server no type to infer. The caller catches and
  // logs, so a live 401/402/403 from a metered vendor was never recorded. In
  // production, 52 Browserless refusals reached this write from 2026-08-26 and
  // none changed the account or withdrew anything. (Browserless is now kept
  // out of this path on purpose; see browserlessFetch.) The mocked unit test
  // renders the SQL and never reaches a server, which is why it could not see
  // this.
  async function seedProviderWithRequiredCapability(provider: string, slug: string) {
    createdProviders.add(provider);
    createdSlugs.add(slug);
    await db.execute(sql`
      INSERT INTO vendor_accounts (
        provider_name, display_name, billing_model, monitor_mode, status,
        remaining_units, usage_unit
      ) VALUES (${provider}, ${provider}, 'free_allowance', 'api_balance', 'healthy', 900, 'unit')
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
  }

  async function accountRow(provider: string) {
    const rows = await db.execute(sql`
      SELECT status, status_reason, last_error, metadata
        FROM vendor_accounts WHERE provider_name = ${provider}
    `) as unknown as Array<{
      status: string; status_reason: string | null; last_error: string | null;
      metadata: Record<string, unknown> | null;
    }>;
    return rows[0];
  }

  async function servingState(slug: string) {
    const rows = await db.execute(sql`
      SELECT visible, x402_enabled FROM capabilities WHERE slug = ${slug}
    `) as unknown as Array<{ visible: boolean; x402_enabled: boolean }>;
    return rows[0];
  }

  it("records a live credential rejection and withdraws the required capability", async () => {
    const suffix = randomUUID().slice(0, 8);
    const provider = `test-vendor-${suffix}`;
    const slug = `test-vendor-cap-${suffix}`;
    await seedProviderWithRequiredCapability(provider, slug);

    await recordVendorHttpFailure(provider, 403);

    expect(await accountRow(provider)).toMatchObject({
      status: "auth_error",
      status_reason: "Authenticated API returned HTTP 403",
      last_error: "HTTP 403",
    });
    expect(await servingState(slug)).toEqual({ visible: false, x402_enabled: false });
  });

  it("records a live exhaustion (HTTP 402) the same way", async () => {
    const suffix = randomUUID().slice(0, 8);
    const provider = `test-vendor-${suffix}`;
    const slug = `test-vendor-cap-${suffix}`;
    await seedProviderWithRequiredCapability(provider, slug);

    await recordVendorHttpFailure(provider, 402);

    expect(await accountRow(provider)).toMatchObject({ status: "exhausted", last_error: "HTTP 402" });
    expect(await servingState(slug)).toEqual({ visible: false, x402_enabled: false });
  });

  // Serper and Dilisense publish no balance API, so a refused key holds until
  // the key itself changes, then restores without anyone's hand. The
  // fingerprint write shared the untyped-parameter defect above, so this path
  // had never completed against a real database either.
  it("holds a refused Serper key until the key changes, then restores", async () => {
    const suffix = randomUUID().slice(0, 8);
    const slug = `test-serper-cap-${suffix}`;
    createdSlugs.add(slug);
    const savedKey = process.env.SERPER_API_KEY;
    const before = await db.execute(sql`
      SELECT status, status_reason, last_error, metadata, remaining_units
        FROM vendor_accounts WHERE provider_name = 'serper'
    `) as unknown as Array<{
      status: string; status_reason: string | null; last_error: string | null;
      metadata: Record<string, unknown> | null; remaining_units: number | null;
    }>;
    // A positive local allowance, so re-arming lands on healthy rather than on
    // the separate exhausted-counter rule.
    await db.execute(sql`
      INSERT INTO vendor_accounts (
        provider_name, display_name, billing_model, monitor_mode, status,
        remaining_units, usage_unit
      ) VALUES ('serper', 'Serper', 'prepaid', 'internal_counter', 'healthy', 1000, 'query')
      ON CONFLICT (provider_name) DO UPDATE
        SET status = 'healthy', metadata = '{}'::jsonb, remaining_units = 1000
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
      ) VALUES ('serper', ${slug}, 'required', 1)
    `);

    try {
      process.env.SERPER_API_KEY = "revoked-key";
      await recordVendorHttpFailure("serper", 403);
      const blocked = await accountRow("serper");
      expect(blocked?.status).toBe("auth_error");
      expect(blocked?.metadata?.blocked_credential_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(await servingState(slug)).toEqual({ visible: false, x402_enabled: false });

      // An unchanged key must not clear the block.
      expect(await rearmVendorAfterCredentialChange("serper", "SERPER_API_KEY")).toBe(false);
      expect((await accountRow("serper"))?.status).toBe("auth_error");
      expect(await servingState(slug)).toEqual({ visible: false, x402_enabled: false });

      process.env.SERPER_API_KEY = "rotated-key";
      expect(await rearmVendorAfterCredentialChange("serper", "SERPER_API_KEY")).toBe(true);
      expect((await accountRow("serper"))?.status).toBe("healthy");
      expect(await servingState(slug)).toEqual({ visible: true, x402_enabled: true });
    } finally {
      if (savedKey === undefined) delete process.env.SERPER_API_KEY;
      else process.env.SERPER_API_KEY = savedKey;
      const prior = before[0];
      if (prior) {
        await db.execute(sql`
          UPDATE vendor_accounts
             SET status = ${prior.status},
                 status_reason = ${prior.status_reason}::text,
                 last_error = ${prior.last_error}::text,
                 metadata = ${JSON.stringify(prior.metadata ?? {})}::jsonb,
                 remaining_units = ${prior.remaining_units}::int
           WHERE provider_name = 'serper'
        `);
      } else {
        await db.execute(sql`DELETE FROM vendor_accounts WHERE provider_name = 'serper'`);
      }
    }
  });

  // Calls in flight when a block lands still report back. None of them may
  // lift it: a 429 is not blocking, and swapping exhausted for auth_error would
  // hand recovery to a canary that cannot see a top-up.
  it("keeps the first blocking status against later, weaker evidence", async () => {
    const suffix = randomUUID().slice(0, 8);
    const authBlocked = `test-vendor-${suffix}-auth`;
    const exhausted = `test-vendor-${suffix}-exhausted`;
    await seedProviderWithRequiredCapability(authBlocked, `test-vendor-cap-${suffix}-a`);
    await seedProviderWithRequiredCapability(exhausted, `test-vendor-cap-${suffix}-e`);

    await recordVendorHttpFailure(authBlocked, 403);
    await recordVendorHttpFailure(authBlocked, 429);
    expect(await accountRow(authBlocked)).toMatchObject({
      status: "auth_error",
      status_reason: "Authenticated API returned HTTP 403",
      last_error: "HTTP 429",
    });

    await recordVendorHttpFailure(exhausted, 402);
    await recordVendorHttpFailure(exhausted, 401);
    expect(await accountRow(exhausted)).toMatchObject({ status: "exhausted", last_error: "HTTP 401" });
    expect(await servingState(`test-vendor-cap-${suffix}-e`)).toEqual({ visible: false, x402_enabled: false });
  });

  it("reads a not-applicable balance check from live evidence and never lifts a block", async () => {
    const suffix = randomUUID().slice(0, 8);
    const recent = `test-vendor-${suffix}-recent`;
    const silent = `test-vendor-${suffix}-silent`;
    const blocked = `test-vendor-${suffix}-blocked`;
    const reasons = { confirmed: "a call succeeded recently", unconfirmed: "nothing has succeeded" };
    for (const [provider, status, lastSuccess] of [
      [recent, "healthy", "1 hour"],
      [silent, "healthy", "3 days"],
      [blocked, "auth_error", "1 hour"],
    ] as const) {
      createdProviders.add(provider);
      await db.execute(sql`
        INSERT INTO vendor_accounts (
          provider_name, display_name, billing_model, monitor_mode, status, status_reason,
          included_units, used_units, remaining_units, usage_unit, reset_at,
          last_checked_at, last_success_at
        ) VALUES (
          ${provider}, ${provider}, 'free_allowance', 'api_balance', ${status}, 'earlier reason',
          1000, 2, 998, 'unit', now() + INTERVAL '10 days',
          now() - INTERVAL '2 days', now() - ${lastSuccess}::interval
        )
      `);
    }

    for (const provider of [recent, silent, blocked]) {
      await recordBalanceNotApplicable(provider, reasons);
    }

    const rows = await db.execute(sql`
      SELECT provider_name, status, status_reason, remaining_units, included_units, reset_at,
             last_checked_at > now() - INTERVAL '1 minute' AS fresh
        FROM vendor_accounts WHERE provider_name IN (${recent}, ${silent}, ${blocked})
    `) as unknown as Array<Record<string, unknown>>;
    const byName = new Map(rows.map((row) => [row.provider_name, row]));
    expect(byName.get(recent)).toMatchObject({
      status: "healthy", status_reason: "a call succeeded recently",
      remaining_units: null, included_units: null, reset_at: null, fresh: true,
    });
    // A carried-forward "healthy" with no evidence behind it is how Browserless
    // read healthy for sixteen days; it must surface as unknown instead.
    expect(byName.get(silent)).toMatchObject({
      status: "unknown", status_reason: "nothing has succeeded", fresh: true,
    });
    expect(byName.get(blocked)).toMatchObject({
      status: "auth_error", status_reason: "earlier reason", remaining_units: null, fresh: true,
    });
  });
});
