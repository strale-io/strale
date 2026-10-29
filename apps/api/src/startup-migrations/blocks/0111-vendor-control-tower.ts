import { sql } from "drizzle-orm";
import { getActiveProviders } from "../../lib/dependency-manifest.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0111: Vendor Control Tower + immediate OpenRegister quarantine ──
//
// The German registry account reached 0/500 credits on 2026-08-24. Network
// health stayed green because an unauthenticated probe cannot see account
// exhaustion, and x402 traffic kept selling the capability into 127 upstream
// HTTP 402s. This block creates the account-level authority, records every
// affected capability, and applies a reversible suspension before the API
// starts listening. The hourly tower job restores the saved state only after
// GET /v1/credits reports usable credits (the observed reset is
// 2026-09-06T23:40:04.613Z, i.e. September 7 in Stockholm).
export async function runMigration0111_vendorControlTower(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_accounts (
      provider_name TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      billing_model TEXT NOT NULL,
      plan_name TEXT,
      currency VARCHAR(3),
      payment_method TEXT,
      monitor_mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      status_reason TEXT,
      included_units INTEGER,
      used_units INTEGER,
      remaining_units INTEGER,
      overage_units INTEGER,
      usage_unit TEXT,
      low_balance_threshold_units INTEGER,
      reset_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      consecutive_check_failures INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT vendor_accounts_status_closed CHECK (
        status IN ('unknown','healthy','low','exhausted','auth_error','rate_limited','unavailable','disabled')
      ),
      CONSTRAINT vendor_accounts_monitor_mode_closed CHECK (
        monitor_mode IN ('api_balance','internal_counter','availability','spend')
      )
    )
  `);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_capability_dependencies (
      provider_name TEXT NOT NULL REFERENCES vendor_accounts(provider_name),
      capability_slug TEXT NOT NULL REFERENCES capabilities(slug),
      dependency_kind TEXT NOT NULL DEFAULT 'required',
      units_per_execution NUMERIC(12,3),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider_name, capability_slug),
      CONSTRAINT vendor_dependency_kind_closed CHECK (dependency_kind IN ('required','fallback'))
    )
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS vendor_capability_dependencies_slug_idx
      ON vendor_capability_dependencies(capability_slug)
  `);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_capability_suspensions (
      provider_name TEXT NOT NULL REFERENCES vendor_accounts(provider_name),
      capability_slug TEXT NOT NULL REFERENCES capabilities(slug),
      previous_lifecycle_state TEXT NOT NULL,
      previous_visible BOOLEAN NOT NULL,
      previous_x402_enabled BOOLEAN NOT NULL,
      suspension_marker TEXT NOT NULL,
      suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      restore_after TIMESTAMPTZ,
      restored_at TIMESTAMPTZ,
      restore_error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider_name, capability_slug)
    )
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS vendor_capability_suspensions_active_idx
      ON vendor_capability_suspensions(restored_at) WHERE restored_at IS NULL
  `);
  await tx.execute(sql`ALTER TABLE solutions ADD COLUMN IF NOT EXISTS deactivation_reason TEXT`);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_solution_suspensions (
      provider_name TEXT NOT NULL REFERENCES vendor_accounts(provider_name),
      solution_slug TEXT NOT NULL REFERENCES solutions(slug),
      previous_is_active BOOLEAN NOT NULL,
      previous_x402_enabled BOOLEAN NOT NULL,
      suspension_marker TEXT NOT NULL,
      suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      restore_after TIMESTAMPTZ,
      restored_at TIMESTAMPTZ,
      restore_error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (provider_name, solution_slug)
    )
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS vendor_solution_suspensions_active_idx
      ON vendor_solution_suspensions(restored_at) WHERE restored_at IS NULL
  `);

  await tx.execute(sql`
    INSERT INTO vendor_accounts (
      provider_name, display_name, billing_model, plan_name, currency,
      payment_method, monitor_mode, status, status_reason, included_units,
      used_units, remaining_units, overage_units, usage_unit,
      low_balance_threshold_units, reset_at, expires_at, metadata
    ) VALUES
      ('openregister', 'OpenRegister', 'free_allowance', 'Free', 'EUR', 'none',
       'api_balance', 'exhausted', 'API reported 0 remaining credits', 500, 500, 0, 0,
       'credit', 100, '2026-09-06T23:40:04.613Z', NULL,
       '{"source":"GET /v1/credits","observed_at":"2026-08-25"}'::jsonb),
      ('browserless', 'Browserless Cloud', 'free_allowance', 'Free', 'USD', 'none',
       'api_balance', 'unknown', 'Awaiting first zero-cost usage API check', NULL, NULL, NULL, NULL,
       'unit', NULL, NULL, NULL, '{}'::jsonb),
      ('serper', 'Serper', 'prepaid', 'Starter', 'USD', 'card_or_paypal',
       'internal_counter', 'healthy', 'Conservative platform ledger; vendor exposes no documented balance API',
       50000, 2500, 47500, 0, 'query', 5000, NULL, '2026-11-08T00:00:00Z',
       '{"counter_is_estimate":true,"purchase_date":"2026-05-08","observed_attempts_through_2026-08-25":2392,"baseline_rounding":"up_to_2500"}'::jsonb),
      ('dilisense', 'Dilisense', 'pay_as_you_go', 'Starter', 'EUR', 'card_supported',
       'availability', 'healthy', 'No prepaid balance; 100 calls/month included then pay per use',
       100, NULL, NULL, NULL, 'screening', NULL, NULL, NULL, '{}'::jsonb),
      ('anthropic', 'Anthropic API', 'pay_as_you_go', 'Standard', 'USD', 'card_or_invoice',
       'spend', 'healthy', 'No hard prepaid allowance tracked; platform records per-call cost',
       NULL, NULL, NULL, NULL, 'token', NULL, NULL, NULL, '{}'::jsonb),
      ('cdp', 'Coinbase CDP x402 facilitator', 'pay_as_you_go', 'Standard', 'USD', 'card',
       'spend', 'healthy', 'Settlement spend is monitored by x402 settlement watch',
       NULL, NULL, NULL, NULL, 'settlement', NULL, NULL, NULL, '{}'::jsonb),
      ('esortcode', 'eSortcode Confirmation of Payee', 'prepaid', NULL, 'GBP', 'top_up',
       'availability', 'unknown', 'Finite credits; no documented balance endpoint is integrated',
       NULL, NULL, NULL, NULL, 'lookup', NULL, NULL, NULL, '{}'::jsonb)
    ON CONFLICT (provider_name) DO NOTHING
  `);

  await tx.execute(sql`
    INSERT INTO vendor_capability_dependencies
      (provider_name, capability_slug, dependency_kind, units_per_execution)
    SELECT seed.provider_name, seed.capability_slug, seed.dependency_kind, seed.units_per_execution
      FROM (VALUES
      ('openregister', 'german-company-data', 'required', 11),
      ('browserless', 'annual-report-extract', 'required', NULL),
      ('browserless', 'company-enrich', 'required', NULL),
      ('browserless', 'estonian-company-data', 'required', NULL),
      ('browserless', 'html-to-pdf', 'required', NULL),
      ('browserless', 'landing-page-roast', 'required', NULL),
      ('browserless', 'screenshot-url', 'required', NULL),
      ('browserless', 'web-extract', 'required', NULL),
      ('serper', 'google-search', 'required', 1),
      ('serper', 'google-news-search', 'required', 1),
      ('serper', 'serp-analyze', 'required', 1),
      ('serper', 'serp-related-questions', 'required', 1),
      ('serper', 'keyword-rank-check', 'required', 1),
      ('serper', 'backlink-check', 'required', 1),
      ('serper', 'brand-mention-search', 'required', 1),
      ('serper', 'adverse-media-check', 'fallback', 1),
      ('dilisense', 'sanctions-check', 'required', 1),
      ('dilisense', 'pep-check', 'required', 1),
      ('dilisense', 'adverse-media-check', 'fallback', 1)
      ) AS seed(provider_name, capability_slug, dependency_kind, units_per_execution)
      JOIN capabilities c ON c.slug = seed.capability_slug
    ON CONFLICT (provider_name, capability_slug) DO UPDATE SET
      dependency_kind = EXCLUDED.dependency_kind,
      units_per_execution = EXCLUDED.units_per_execution,
      updated_at = now()
  `);

  // Materialise the canonical manifest into the tower. Missing accounts or
  // future edge drift remain visible in the morning report instead of being
  // silently treated as covered.
  for (const provider of getActiveProviders().filter((item) =>
    item.tier === "paid" || item.tier === "self-hosted")) {
    const dependencies = [
      ...provider.capabilities.map((slug) => ({ slug, kind: "required" as const })),
      ...(provider.fallbackCapabilities ?? []).map((slug) => ({ slug, kind: "fallback" as const })),
    ];
    for (const dependency of dependencies) {
      await tx.execute(sql`
        INSERT INTO vendor_capability_dependencies
          (provider_name, capability_slug, dependency_kind, units_per_execution)
        SELECT ${provider.name}, c.slug, ${dependency.kind}, NULL
          FROM capabilities c
          JOIN vendor_accounts va ON va.provider_name = ${provider.name}
         WHERE c.slug = ${dependency.slug}
        ON CONFLICT (provider_name, capability_slug) DO UPDATE SET
          dependency_kind = EXCLUDED.dependency_kind,
          updated_at = now()
      `);
    }
    const expectedSlugs = [...new Set(dependencies.map((dependency) => dependency.slug))];
    await tx.execute(sql`
      DELETE FROM vendor_capability_dependencies d
       USING vendor_accounts va
       WHERE va.provider_name = ${provider.name}
         AND d.provider_name = va.provider_name
         AND d.capability_slug NOT IN (
           ${sql.join(expectedSlugs.map((slug) => sql`${slug}`), sql`, `)}
         )
    `);
  }

  // quota_cap is expressed in complete capability executions, not raw vendor
  // credits: a name lookup costs 1 autocomplete + 10 company-detail credits,
  // so 500 credits conservatively fund 45 complete calls. The exact rolling
  // reset timestamp lives in vendor_accounts and is refreshed from the API.
  await tx.execute(sql`
    UPDATE capabilities
       SET price_cents = 20,
           quota_cap = 45,
           quota_window = 'monthly',
           quota_reset_dom = 7,
           updated_at = now()
     WHERE slug = 'german-company-data'
       AND (price_cents IS DISTINCT FROM 20 OR quota_cap IS DISTINCT FROM 45 OR quota_reset_dom IS DISTINCT FROM 7)
  `);

  // Both Browserless capabilities already have a known-answer canary. Their
  // second live schema suite duplicated the same paid upstream signal hourly
  // (169 calls in the preceding seven days) without adding independent
  // coverage. Keep the canary and fixtures; retire only this exact duplicate
  // live shape.
  await tx.execute(sql`
    UPDATE test_suites
       SET active = false,
           updated_at = now()
     WHERE capability_slug IN ('screenshot-url', 'html-to-pdf')
       AND test_type = 'schema_check'
       AND test_mode = 'live'
       AND active = true
  `);

  // Gate 5 requires one meaningful fixture for every public input path. The
  // capability already has a reviewed SAP baseline, so reuse that captured
  // output for the register-number and canonical-company-id entry points.
  // These are fixture-only and therefore consume no OpenRegister credits.
  await tx.execute(sql`
    WITH source AS (
      SELECT baseline_output, validation_rules
        FROM test_suites
       WHERE capability_slug = 'german-company-data'
         AND test_type = 'known_answer'
         AND baseline_output IS NOT NULL
       ORDER BY created_at
       LIMIT 1
    )
    INSERT INTO test_suites (
      capability_slug, test_name, test_type, input, validation_rules,
      active, schedule_tier, test_mode, baseline_output,
      baseline_captured_at, fixture_last_refreshed,
      scheduled_testing_eligible, estimated_cost_cents, external_cost_cents
    )
    SELECT 'german-company-data', 'German Company Data — HRB fixture path',
           'known_answer', '{"hrb_number":"HRB 719915"}'::jsonb,
           source.validation_rules, true, 'C', 'fixture', source.baseline_output,
           now(), now(), true, 0, 0
      FROM source
     WHERE NOT EXISTS (
       SELECT 1 FROM test_suites
        WHERE capability_slug = 'german-company-data'
          AND test_name = 'German Company Data — HRB fixture path'
     )
  `);
  await tx.execute(sql`
    WITH source AS (
      SELECT baseline_output, validation_rules
        FROM test_suites
       WHERE capability_slug = 'german-company-data'
         AND test_type = 'known_answer'
         AND baseline_output IS NOT NULL
       ORDER BY created_at
       LIMIT 1
    )
    INSERT INTO test_suites (
      capability_slug, test_name, test_type, input, validation_rules,
      active, schedule_tier, test_mode, baseline_output,
      baseline_captured_at, fixture_last_refreshed,
      scheduled_testing_eligible, estimated_cost_cents, external_cost_cents
    )
    SELECT 'german-company-data', 'German Company Data — company ID fixture path',
           'known_answer', jsonb_build_object('company_id', source.baseline_output->>'company_id'),
           source.validation_rules, true, 'C', 'fixture', source.baseline_output,
           now(), now(), true, 0, 0
      FROM source
     WHERE source.baseline_output->>'company_id' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM test_suites
          WHERE capability_slug = 'german-company-data'
            AND test_name = 'German Company Data — company ID fixture path'
       )
  `);

  const saved = await tx.execute(sql`
    INSERT INTO vendor_capability_suspensions (
      provider_name, capability_slug, previous_lifecycle_state,
      previous_visible, previous_x402_enabled, suspension_marker, restore_after
    )
    SELECT 'openregister', c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
           'vendor:openregister:exhausted', va.reset_at
      FROM capabilities c
      JOIN vendor_accounts va ON va.provider_name = 'openregister'
     WHERE c.slug = 'german-company-data'
       AND va.status = 'exhausted'
       AND (c.deactivation_reason IS NULL OR c.deactivation_reason LIKE 'vendor:%')
    ON CONFLICT (provider_name, capability_slug) DO NOTHING
  `);
  const savedCount = (saved as { count?: number }).count ?? 0;

  await tx.execute(sql`
    INSERT INTO vendor_solution_suspensions (
      provider_name, solution_slug, previous_is_active,
      previous_x402_enabled, suspension_marker, restore_after
    )
    SELECT DISTINCT 'openregister', s.slug, s.is_active, s.x402_enabled,
           'vendor:openregister:exhausted', va.reset_at
      FROM vendor_capability_dependencies d
      JOIN solution_steps ss ON ss.capability_slug = d.capability_slug
      JOIN solutions s ON s.id = ss.solution_id
      JOIN vendor_accounts va ON va.provider_name = 'openregister'
     WHERE d.provider_name = 'openregister'
       AND d.dependency_kind = 'required'
       AND va.status = 'exhausted'
       AND (s.is_active OR s.x402_enabled)
    ON CONFLICT (provider_name, solution_slug) DO NOTHING
  `);

  await tx.execute(sql`
    UPDATE capabilities c
       SET lifecycle_state = 'suspended',
           visible = false,
           x402_enabled = false,
           deactivation_reason = s.suspension_marker,
           updated_at = now()
      FROM vendor_capability_suspensions s
     WHERE s.provider_name = 'openregister'
       AND s.capability_slug = c.slug
       AND s.restored_at IS NULL
       AND (c.deactivation_reason IS NULL OR c.deactivation_reason LIKE 'vendor:%')
  `);
  await tx.execute(sql`
    UPDATE solutions s
       SET is_active = false,
           x402_enabled = false,
           deactivation_reason = vs.suspension_marker,
           updated_at = now()
      FROM vendor_solution_suspensions vs
     WHERE vs.provider_name = 'openregister'
       AND vs.solution_slug = s.slug
       AND vs.restored_at IS NULL
       AND (s.deactivation_reason IS NULL OR s.deactivation_reason LIKE 'vendor:%')
  `);

  if (savedCount > 0) {
    await tx.execute(sql`
      INSERT INTO health_monitor_events
        (event_type, capability_slug, tier, action_taken, details, human_override)
      VALUES (
        'vendor_suspension', 'german-company-data', 1,
        'Suspended until OpenRegister reports usable credits',
        '{"provider":"openregister","reason":"exhausted","restore_policy":"provider-confirmed","observed_reset_at":"2026-09-06T23:40:04.613Z"}'::jsonb,
        false
      )
    `);
  }

  return {
    block: "0111_vendor_control_tower",
    outcome: savedCount > 0
      ? "tower created; german-company-data reversibly suspended"
      : "tower present; OpenRegister suspension already recorded",
    rows_affected: savedCount,
    duration_ms: Date.now() - startedAt,
  };
}
