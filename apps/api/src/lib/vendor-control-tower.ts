/**
 * Vendor Control Tower — account-level allowance, billing and restoration.
 *
 * Endpoint health and account health are different facts. An unauthenticated
 * 401 is a zero-cost proof that a vendor is reachable; it says nothing about
 * whether our authenticated account has credits. This module owns the second
 * fact and translates a hard account refusal into reversible capability
 * suspensions across every serving rail.
 */
import { sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { alertOnce } from "./alert-once.js";
import { log, logWarn } from "./log.js";

export type VendorStatus =
  | "unknown"
  | "healthy"
  | "low"
  | "exhausted"
  | "auth_error"
  | "rate_limited"
  | "unavailable"
  | "disabled";

export interface VendorBalance {
  providerName: string;
  planName: string | null;
  includedUnits: number | null;
  usedUnits: number | null;
  remainingUnits: number | null;
  overageUnits: number | null;
  usageUnit: string;
  resetAt: string | null;
  canUseOverage: boolean;
}

export interface VendorBalanceAssessment extends VendorBalance {
  status: "healthy" | "low" | "exhausted";
  statusReason: string;
  lowBalanceThresholdUnits: number | null;
}

interface OpenRegisterCreditsResponse {
  included_credits?: unknown;
  used_credits?: unknown;
  remaining_credits?: unknown;
  overage_credits?: unknown;
  paid?: unknown;
  period?: { reset_at?: unknown };
}

interface BrowserlessUsageResponse {
  plan?: { name?: unknown };
  units?: { included?: unknown; used?: unknown; remaining?: unknown };
  billingPeriod?: { end?: unknown };
}

type FetchLike = typeof fetch;

function finiteNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Vendor balance response has invalid ${field}`);
  }
  return n;
}

function nullableIso(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`Vendor balance response has invalid ${field}`);
  }
  return new Date(value).toISOString();
}

export function parseOpenRegisterCredits(body: OpenRegisterCreditsResponse): VendorBalance {
  return {
    providerName: "openregister",
    planName: body.paid === true ? "Paid" : "Free",
    includedUnits: finiteNumber(body.included_credits, "included_credits"),
    usedUnits: finiteNumber(body.used_credits, "used_credits"),
    remainingUnits: finiteNumber(body.remaining_credits, "remaining_credits"),
    overageUnits: finiteNumber(body.overage_credits ?? 0, "overage_credits"),
    usageUnit: "credit",
    resetAt: nullableIso(body.period?.reset_at, "period.reset_at"),
    canUseOverage: body.paid === true,
  };
}

export function parseBrowserlessUsage(body: BrowserlessUsageResponse): VendorBalance {
  return {
    providerName: "browserless",
    planName: typeof body.plan?.name === "string" ? body.plan.name : null,
    includedUnits: finiteNumber(body.units?.included, "units.included"),
    usedUnits: finiteNumber(body.units?.used, "units.used"),
    remainingUnits: finiteNumber(body.units?.remaining, "units.remaining"),
    overageUnits: 0,
    usageUnit: "unit",
    resetAt: nullableIso(body.billingPeriod?.end, "billingPeriod.end"),
    canUseOverage: false,
  };
}

export function assessVendorBalance(balance: VendorBalance): VendorBalanceAssessment {
  const included = balance.includedUnits;
  const remaining = balance.remainingUnits;
  const lowBalanceThresholdUnits = included == null
    ? null
    : Math.max(1, Math.ceil(included * 0.20));

  if (remaining !== null && remaining <= 0 && !balance.canUseOverage) {
    return {
      ...balance,
      status: "exhausted",
      statusReason: `No ${balance.usageUnit}s remain and this plan has no overage`,
      lowBalanceThresholdUnits,
    };
  }
  if (
    remaining !== null &&
    lowBalanceThresholdUnits !== null &&
    remaining <= lowBalanceThresholdUnits
  ) {
    return {
      ...balance,
      status: "low",
      statusReason: `${remaining} of ${included} ${balance.usageUnit}s remain`,
      lowBalanceThresholdUnits,
    };
  }
  return {
    ...balance,
    status: "healthy",
    statusReason: remaining === null
      ? "No hard allowance applies"
      : `${remaining} of ${included ?? "unknown"} ${balance.usageUnit}s remain`,
    lowBalanceThresholdUnits,
  };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 || response.status === 403) {
    throw Object.assign(new Error(`Vendor rejected account credentials (HTTP ${response.status})`), {
      vendorStatus: "auth_error" as const,
    });
  }
  if (!response.ok) {
    throw new Error(`Vendor balance endpoint returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchOpenRegisterBalance(
  fetchImpl: FetchLike = fetch,
): Promise<VendorBalance> {
  const key = process.env.OPENREGISTER_API_KEY;
  if (!key) {
    throw Object.assign(new Error("OPENREGISTER_API_KEY is not configured"), {
      vendorStatus: "auth_error" as const,
    });
  }
  const body = await fetchJson(
    "https://api.openregister.de/v1/credits",
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
    fetchImpl,
  );
  return parseOpenRegisterCredits(body as OpenRegisterCreditsResponse);
}

export async function fetchBrowserlessBalance(
  fetchImpl: FetchLike = fetch,
): Promise<VendorBalance> {
  const token = process.env.BROWSERLESS_API_KEY;
  if (!token) {
    throw Object.assign(new Error("BROWSERLESS_API_KEY is not configured"), {
      vendorStatus: "auth_error" as const,
    });
  }
  const body = await fetchJson(
    `https://api.browserless.io/v1/account/usage?token=${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" } },
    fetchImpl,
  );
  return parseBrowserlessUsage(body as BrowserlessUsageResponse);
}

const BALANCE_ADAPTERS: ReadonlyArray<{
  providerName: string;
  fetchBalance: (fetchImpl?: FetchLike) => Promise<VendorBalance>;
}> = [
  { providerName: "openregister", fetchBalance: fetchOpenRegisterBalance },
  { providerName: "browserless", fetchBalance: fetchBrowserlessBalance },
];

interface RecoveryAdapter {
  providerName: string;
  units: number;
  request: () => { url: string; init: RequestInit };
}

function requiredVendorKey(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/** Authenticated canaries for vendors without a balance endpoint. They run
 * only while that vendor has an active tower suspension and a cooldown lease
 * is due. eSortcode's documented testOutcome path consumes zero credits. */
const RECOVERY_ADAPTERS: ReadonlyArray<RecoveryAdapter> = [
  {
    providerName: "esortcode",
    units: 0,
    request: () => {
      const params = new URLSearchParams({
        key: requiredVendorKey("ESORTCODE_API_KEY"),
        sortcode: "000000",
        accountNumber: "00110022",
        name: "Selena Gomez",
        accountType: "PERSONAL",
        testOutcome: "MATCHED",
      });
      return {
        url: `https://wsp.esortcode.com/uk/v1/cop?${params.toString()}`,
        init: { headers: { Accept: "application/json" } },
      };
    },
  },
];

const CREDENTIAL_REARM_PROVIDERS: ReadonlyArray<{ providerName: string; envVar: string }> = [
  { providerName: "serper", envVar: "SERPER_API_KEY" },
  { providerName: "dilisense", envVar: "DILISENSE_API_KEY" },
];

function credentialFingerprint(envVar: string): string | null {
  const value = process.env[envVar];
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

function rowsOf<T>(value: unknown): T[] {
  return (Array.isArray(value) ? value : (value as { rows?: unknown[] })?.rows ?? []) as T[];
}

const BLOCKING_STATUSES = new Set<VendorStatus>(["exhausted", "auth_error", "disabled"]);
const STATUS_CACHE_MS = 30_000;
const statusCache = new Map<string, { status: VendorStatus; expiresAt: number }>();

export function resetVendorStatusCacheForTests(): void {
  statusCache.clear();
}

export class VendorUnavailableError extends Error {
  constructor(public providerName: string, public vendorStatus: VendorStatus) {
    super(`Vendor '${providerName}' is ${vendorStatus}; the request was refused before spending or charging.`);
    this.name = "VendorUnavailableError";
  }
}

interface RecoveryLease {
  providerName: string;
  token: string;
  observedStatus: VendorStatus;
}

/** Claim one sparse internal recovery canary for a blocked provider that has
 * no balance API. Customer requests never claim this lease: suspended
 * capabilities remain unservable until the scheduled canary succeeds. */
async function claimRecoveryProbe(
  providerName: string,
  status: VendorStatus,
): Promise<RecoveryLease | null> {
  if (!new Set<VendorStatus>(["auth_error", "exhausted", "unavailable"]).has(status)) return null;
  const token = randomUUID();
  const result = await getDb().execute(sql`
    UPDATE vendor_accounts
       SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{recovery_probe}',
             jsonb_build_object(
               'token', ${token},
               'status', ${status},
               'expires_at', now() + INTERVAL '5 minutes'
             )
           ),
           updated_at = now()
     WHERE provider_name = ${providerName}
       AND status = ${status}
       AND monitor_mode <> 'api_balance'
       -- A successful request cannot prove that a finite local allowance was
       -- replenished. Exhausted internal counters need balance evidence or an
       -- explicit operator reconciliation, never a speculative reset.
       AND NOT (monitor_mode = 'internal_counter' AND status = 'exhausted')
       -- eSortcode's zero-credit test can prove credentials, but it cannot
       -- prove that production credits were topped up.
       AND NOT (provider_name = 'esortcode' AND status = 'exhausted')
       AND (
         EXISTS (
           SELECT 1 FROM vendor_capability_suspensions s
            WHERE s.provider_name = vendor_accounts.provider_name AND s.restored_at IS NULL
         )
         OR EXISTS (
           SELECT 1 FROM vendor_solution_suspensions s
            WHERE s.provider_name = vendor_accounts.provider_name AND s.restored_at IS NULL
         )
       )
       AND COALESCE(last_checked_at, 'epoch'::timestamptz) <= now() - CASE
             WHEN ${status} = 'auth_error' THEN INTERVAL '1 hour'
             ELSE INTERVAL '6 hours'
           END
       AND COALESCE((metadata#>>'{recovery_probe,expires_at}')::timestamptz, 'epoch'::timestamptz) <= now()
    RETURNING provider_name
  `);
  return rowsOf<{ provider_name: string }>(result).length > 0
    ? { providerName, token, observedStatus: status }
    : null;
}

/** Shared pre-flight for metered-vendor HTTP clients. */
export async function assertVendorAvailable(providerName: string): Promise<void> {
  const cached = statusCache.get(providerName);
  const now = Date.now();
  let status: VendorStatus;
  if (cached && cached.expiresAt > now) {
    status = cached.status;
  } else {
    const result = await getDb().execute(sql`
      SELECT status FROM vendor_accounts WHERE provider_name = ${providerName}
    `);
    const row = rowsOf<{ status?: VendorStatus }>(result)[0];
    // A missing row is allowed but loud in the morning coverage report. This
    // preserves deploy compatibility while a newly declared provider gets its
    // account adapter in the same PR.
    status = row?.status ?? "unknown";
    statusCache.set(providerName, { status, expiresAt: now + STATUS_CACHE_MS });
  }
  if (BLOCKING_STATUSES.has(status)) {
    throw new VendorUnavailableError(providerName, status);
  }
}

async function writeAssessment(assessment: VendorBalanceAssessment): Promise<void> {
  await getDb().execute(sql`
    UPDATE vendor_accounts
       SET plan_name = COALESCE(${assessment.planName}, plan_name),
           status = ${assessment.status},
           status_reason = ${assessment.statusReason},
           included_units = ${assessment.includedUnits},
           used_units = ${assessment.usedUnits},
           remaining_units = ${assessment.remainingUnits},
           overage_units = ${assessment.overageUnits},
           usage_unit = ${assessment.usageUnit},
           low_balance_threshold_units = ${assessment.lowBalanceThresholdUnits},
           reset_at = ${assessment.resetAt},
           last_checked_at = now(),
           last_success_at = now(),
           consecutive_check_failures = 0,
           last_error = NULL,
           updated_at = now()
     WHERE provider_name = ${assessment.providerName}
  `);
  statusCache.delete(assessment.providerName);
}

async function readAccountStatus(providerName: string): Promise<{
  status: VendorStatus;
  lastCheckedAt: string | null;
}> {
  const result = await getDb().execute(sql`
    SELECT status, last_checked_at FROM vendor_accounts WHERE provider_name = ${providerName}
  `);
  const row = rowsOf<{ status?: VendorStatus; last_checked_at?: string | null }>(result)[0];
  return { status: row?.status ?? "unknown", lastCheckedAt: row?.last_checked_at ?? null };
}

const SUSPENDABLE = new Set<VendorStatus>(["exhausted", "auth_error", "disabled"]);

export async function suspendRequiredCapabilities(
  providerName: string,
  status: VendorStatus,
  restoreAfter: string | null,
): Promise<string[]> {
  if (!SUSPENDABLE.has(status)) return [];
  const marker = `vendor:${providerName}:${status}`;
  const db = getDb();
  return db.transaction(async (tx) => {
    const saved = await tx.execute(sql`
      INSERT INTO vendor_capability_suspensions (
        provider_name, capability_slug, previous_lifecycle_state,
        previous_visible, previous_x402_enabled, suspension_marker, restore_after
      )
      SELECT ${providerName}, c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
             ${marker}, ${restoreAfter}::timestamptz
        FROM vendor_capability_dependencies d
        JOIN capabilities c ON c.slug = d.capability_slug
       WHERE d.provider_name = ${providerName}
         AND d.dependency_kind = 'required'
         AND (c.deactivation_reason IS NULL OR c.deactivation_reason LIKE 'vendor:%')
      ON CONFLICT (provider_name, capability_slug) DO UPDATE SET
        previous_lifecycle_state = EXCLUDED.previous_lifecycle_state,
        previous_visible = EXCLUDED.previous_visible,
        previous_x402_enabled = EXCLUDED.previous_x402_enabled,
        suspension_marker = EXCLUDED.suspension_marker,
        suspended_at = now(),
        restore_after = EXCLUDED.restore_after,
        restored_at = NULL,
        restore_error = NULL,
        updated_at = now()
      WHERE vendor_capability_suspensions.restored_at IS NOT NULL
      RETURNING capability_slug
    `);
    const slugs = rowsOf<{ capability_slug: string }>(saved).map((r) => r.capability_slug);

    const savedSolutions = await tx.execute(sql`
      INSERT INTO vendor_solution_suspensions (
        provider_name, solution_slug, previous_is_active,
        previous_x402_enabled, suspension_marker, restore_after
      )
      SELECT DISTINCT ${providerName}, s.slug, s.is_active, s.x402_enabled,
             ${marker}, ${restoreAfter}::timestamptz
        FROM vendor_capability_dependencies d
        JOIN solution_steps ss ON ss.capability_slug = d.capability_slug
        JOIN solutions s ON s.id = ss.solution_id
       WHERE d.provider_name = ${providerName}
         AND d.dependency_kind = 'required'
         AND ((s.is_active OR s.x402_enabled) OR s.deactivation_reason LIKE 'vendor:%')
         AND (s.deactivation_reason IS NULL OR s.deactivation_reason LIKE 'vendor:%')
      ON CONFLICT (provider_name, solution_slug) DO UPDATE SET
        previous_is_active = EXCLUDED.previous_is_active,
        previous_x402_enabled = EXCLUDED.previous_x402_enabled,
        suspension_marker = EXCLUDED.suspension_marker,
        suspended_at = now(),
        restore_after = EXCLUDED.restore_after,
        restored_at = NULL,
        restore_error = NULL,
        updated_at = now()
      WHERE vendor_solution_suspensions.restored_at IS NOT NULL
      RETURNING solution_slug
    `);
    const solutionSlugs = rowsOf<{ solution_slug: string }>(savedSolutions)
      .map((row) => row.solution_slug);

    await tx.execute(sql`
      UPDATE capabilities c
         SET lifecycle_state = 'suspended',
             visible = false,
             x402_enabled = false,
             deactivation_reason = COALESCE(c.deactivation_reason, s.suspension_marker),
             updated_at = now()
        FROM vendor_capability_suspensions s
       WHERE s.provider_name = ${providerName}
         AND s.capability_slug = c.slug
         AND s.restored_at IS NULL
         AND (c.deactivation_reason IS NULL OR c.deactivation_reason LIKE 'vendor:%')
    `);
    await tx.execute(sql`
      UPDATE solutions s
         SET is_active = false,
             x402_enabled = false,
             deactivation_reason = COALESCE(s.deactivation_reason, vs.suspension_marker),
             updated_at = now()
        FROM vendor_solution_suspensions vs
       WHERE vs.provider_name = ${providerName}
         AND vs.solution_slug = s.slug
         AND vs.restored_at IS NULL
         AND (s.deactivation_reason IS NULL OR s.deactivation_reason LIKE 'vendor:%')
    `);

    for (const slug of slugs) {
      await tx.execute(sql`
        INSERT INTO health_monitor_events
          (event_type, capability_slug, tier, action_taken, details, human_override)
        VALUES (
          'vendor_suspension', ${slug}, 1,
          ${`Suspended because ${providerName} is ${status}`},
          jsonb_build_object('provider', ${providerName}, 'status', ${status}, 'restore_after', ${restoreAfter}),
          false
        )
      `);
    }
    for (const slug of solutionSlugs) {
      await tx.execute(sql`
        INSERT INTO health_monitor_events
          (event_type, capability_slug, tier, action_taken, details, human_override)
        VALUES (
          'vendor_solution_suspension', ${slug}, 1,
          ${`Suspended solution because ${providerName} is ${status}`},
          jsonb_build_object('provider', ${providerName}, 'status', ${status}, 'restore_after', ${restoreAfter}),
          false
        )
      `);
    }
    return slugs;
  });
}

export async function restoreVendorSuspensions(providerName: string): Promise<string[]> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [availability] = rowsOf<{
      status: VendorStatus;
      remaining_units: number | null;
      overage_units: number | null;
      required_units: number;
    }>(await tx.execute(sql`
      SELECT va.status, va.remaining_units, va.overage_units,
             COALESCE((
               SELECT MAX(d.units_per_execution)::float8
                 FROM vendor_capability_dependencies d
                WHERE d.provider_name = va.provider_name
                  AND d.dependency_kind = 'required'
             ), 1) AS required_units
        FROM vendor_accounts va
       WHERE va.provider_name = ${providerName}
       FOR UPDATE
    `));
    const confirmedUsable = availability
      && (availability.status === "healthy" || availability.status === "low")
      && (
        availability.remaining_units === null
        || availability.remaining_units >= availability.required_units
        || (availability.overage_units ?? 0) > 0
      );
    if (!confirmedUsable) return [];

    const active = rowsOf<{
      capability_slug: string;
    }>(await tx.execute(sql`
      SELECT capability_slug
       FROM vendor_capability_suspensions
       WHERE provider_name = ${providerName}
         AND restored_at IS NULL
         AND (restore_after IS NULL OR restore_after <= now())
       ORDER BY capability_slug
       FOR UPDATE
    `));

    const restored: string[] = [];
    for (const s of active) {
      const blockers = rowsOf<{
        provider_name: string;
        status: VendorStatus;
        remaining_units: number | null;
        overage_units: number | null;
        restore_after: string | null;
        required_units: number;
        previous_lifecycle_state: string;
        previous_visible: boolean;
        previous_x402_enabled: boolean;
        suspension_marker: string;
      }>(await tx.execute(sql`
        SELECT b.provider_name, va.status, va.remaining_units, va.overage_units,
               b.restore_after, b.previous_lifecycle_state, b.previous_visible,
               b.previous_x402_enabled, b.suspension_marker,
               COALESCE((
                 SELECT MAX(d.units_per_execution)::float8
                   FROM vendor_capability_dependencies d
                  WHERE d.provider_name = b.provider_name
                    AND d.capability_slug = b.capability_slug
                    AND d.dependency_kind = 'required'
               ), 1) AS required_units
          FROM vendor_capability_suspensions b
          JOIN vendor_accounts va ON va.provider_name = b.provider_name
         WHERE b.capability_slug = ${s.capability_slug}
           AND b.restored_at IS NULL
         ORDER BY b.suspended_at
         FOR UPDATE OF b, va
      `));
      const allReady = blockers.length > 0 && blockers.every((blocker) =>
        (blocker.status === "healthy" || blocker.status === "low")
        && (blocker.restore_after === null || Date.parse(blocker.restore_after) <= Date.now())
        && (
          blocker.remaining_units === null
          || blocker.remaining_units >= blocker.required_units
          || (blocker.overage_units ?? 0) > 0
        ));
      if (!allReady) continue;
      const current = rowsOf<{ deactivation_reason: string | null }>(await tx.execute(sql`
        SELECT deactivation_reason FROM capabilities
         WHERE slug = ${s.capability_slug}
         FOR UPDATE
      `))[0];
      const owner = blockers.find((blocker) => blocker.suspension_marker === current?.deactivation_reason);
      if (!owner) continue;
      const result = await tx.execute(sql`
        UPDATE capabilities
           SET lifecycle_state = ${owner.previous_lifecycle_state},
               visible = ${owner.previous_visible},
               x402_enabled = ${owner.previous_x402_enabled},
               deactivation_reason = NULL,
               updated_at = now()
         WHERE slug = ${s.capability_slug}
           AND deactivation_reason = ${owner.suspension_marker}
        RETURNING slug
      `);
      if (rowsOf<{ slug: string }>(result).length === 0) {
        await tx.execute(sql`
          UPDATE vendor_capability_suspensions
             SET restore_error = 'Capability changed by another authority while vendor-suspended',
                 updated_at = now()
           WHERE capability_slug = ${s.capability_slug}
             AND restored_at IS NULL
        `);
        continue;
      }
      await tx.execute(sql`
        UPDATE vendor_capability_suspensions
           SET restored_at = now(), restore_error = NULL, updated_at = now()
         WHERE capability_slug = ${s.capability_slug}
           AND restored_at IS NULL
      `);
      await tx.execute(sql`
        INSERT INTO health_monitor_events
          (event_type, capability_slug, tier, action_taken, details, human_override)
        VALUES (
          'vendor_restoration', ${s.capability_slug}, 1,
          ${`Restored after ${providerName} reported usable allowance`},
          jsonb_build_object('provider', ${providerName}, 'restore_policy', 'provider-confirmed'),
          false
        )
      `);
      restored.push(s.capability_slug);
    }

    const activeSolutions = rowsOf<{
      solution_slug: string;
    }>(await tx.execute(sql`
      SELECT solution_slug
       FROM vendor_solution_suspensions
       WHERE provider_name = ${providerName}
         AND restored_at IS NULL
         AND (restore_after IS NULL OR restore_after <= now())
       ORDER BY solution_slug
       FOR UPDATE
    `));
    for (const s of activeSolutions) {
      const blockers = rowsOf<{
        provider_name: string;
        status: VendorStatus;
        remaining_units: number | null;
        overage_units: number | null;
        restore_after: string | null;
        required_units: number;
        previous_is_active: boolean;
        previous_x402_enabled: boolean;
        suspension_marker: string;
      }>(await tx.execute(sql`
        SELECT b.provider_name, va.status, va.remaining_units, va.overage_units,
               b.restore_after, b.previous_is_active, b.previous_x402_enabled,
               b.suspension_marker,
               COALESCE((
                 SELECT MAX(d.units_per_execution)::float8
                   FROM vendor_capability_dependencies d
                  WHERE d.provider_name = b.provider_name
                    AND d.dependency_kind = 'required'
               ), 1) AS required_units
          FROM vendor_solution_suspensions b
          JOIN vendor_accounts va ON va.provider_name = b.provider_name
         WHERE b.solution_slug = ${s.solution_slug}
           AND b.restored_at IS NULL
         ORDER BY b.suspended_at
         FOR UPDATE OF b, va
      `));
      const allReady = blockers.length > 0 && blockers.every((blocker) =>
        (blocker.status === "healthy" || blocker.status === "low")
        && (blocker.restore_after === null || Date.parse(blocker.restore_after) <= Date.now())
        && (
          blocker.remaining_units === null
          || blocker.remaining_units >= blocker.required_units
          || (blocker.overage_units ?? 0) > 0
        ));
      if (!allReady) continue;
      const current = rowsOf<{ deactivation_reason: string | null }>(await tx.execute(sql`
        SELECT deactivation_reason FROM solutions
         WHERE slug = ${s.solution_slug}
         FOR UPDATE
      `))[0];
      const owner = blockers.find((blocker) => blocker.suspension_marker === current?.deactivation_reason);
      if (!owner) continue;
      const result = await tx.execute(sql`
        UPDATE solutions
           SET is_active = ${owner.previous_is_active},
               x402_enabled = ${owner.previous_x402_enabled},
               deactivation_reason = NULL,
               updated_at = now()
         WHERE slug = ${s.solution_slug}
           AND deactivation_reason = ${owner.suspension_marker}
        RETURNING slug
      `);
      if (rowsOf<{ slug: string }>(result).length === 0) {
        await tx.execute(sql`
          UPDATE vendor_solution_suspensions
             SET restore_error = 'Solution changed by another authority while vendor-suspended',
                 updated_at = now()
           WHERE solution_slug = ${s.solution_slug}
             AND restored_at IS NULL
        `);
        continue;
      }
      await tx.execute(sql`
        UPDATE vendor_solution_suspensions
           SET restored_at = now(), restore_error = NULL, updated_at = now()
         WHERE solution_slug = ${s.solution_slug}
           AND restored_at IS NULL
      `);
      await tx.execute(sql`
        INSERT INTO health_monitor_events
          (event_type, capability_slug, tier, action_taken, details, human_override)
        VALUES (
          'vendor_solution_restoration', ${s.solution_slug}, 1,
          ${`Restored solution after ${providerName} reported usable allowance`},
          jsonb_build_object('provider', ${providerName}, 'restore_policy', 'provider-confirmed'),
          false
        )
      `);
    }
    return restored;
  });
}

async function markBalanceCheckFailure(providerName: string, error: unknown): Promise<VendorStatus> {
  const explicit = (error as { vendorStatus?: VendorStatus })?.vendorStatus;
  const message = error instanceof Error ? error.message : String(error);
  const result = await getDb().execute(sql`
    UPDATE vendor_accounts
       SET consecutive_check_failures = consecutive_check_failures + 1,
           status = CASE
             WHEN ${explicit ?? null} = 'auth_error' THEN 'auth_error'
             WHEN consecutive_check_failures + 1 >= 3 THEN 'unavailable'
             ELSE status
           END,
           status_reason = CASE
             WHEN ${explicit ?? null} = 'auth_error' THEN 'Balance API rejected credentials'
             WHEN consecutive_check_failures + 1 >= 3 THEN 'Balance monitor failed three consecutive times'
             ELSE status_reason
           END,
           last_checked_at = now(),
           last_error = ${message.slice(0, 500)},
           updated_at = now()
     WHERE provider_name = ${providerName}
     RETURNING status
  `);
  statusCache.delete(providerName);
  return rowsOf<{ status: VendorStatus }>(result)[0]?.status ?? "unknown";
}

async function alertVendorIssue(assessment: VendorBalanceAssessment): Promise<void> {
  if (assessment.status === "healthy") return;
  await alertOnce(`vendor-control:${assessment.providerName}:${assessment.status}`, 12 * 60 * 60 * 1000, {
    severity: assessment.status === "exhausted" ? "critical" : "warning",
    subject: `${assessment.providerName} account is ${assessment.status}`,
    body:
      `${assessment.statusReason}. ` +
      (assessment.resetAt
        ? `The vendor reports a reset at ${assessment.resetAt}. `
        : "No reset time was reported. ") +
      "Affected services are controlled automatically and this issue will appear in the next morning run.",
  });
}

export async function syncBalanceVendor(
  providerName: string,
  fetchBalance: (fetchImpl?: FetchLike) => Promise<VendorBalance>,
): Promise<VendorBalanceAssessment | null> {
  const before = await readAccountStatus(providerName);
  try {
    const assessment = assessVendorBalance(await fetchBalance());
    await writeAssessment(assessment);

    // Keep the internal test-budget window aligned to OpenRegister's actual
    // rolling reset rather than a permanently hard-coded day of month.
    if (providerName === "openregister" && assessment.resetAt) {
      await getDb().execute(sql`
        UPDATE capabilities
           SET quota_reset_dom = EXTRACT(
                 DAY FROM (${assessment.resetAt}::timestamptz AT TIME ZONE 'Europe/Stockholm')
               )::int,
               updated_at = now()
         WHERE slug IN (
           SELECT capability_slug FROM vendor_capability_dependencies
            WHERE provider_name = 'openregister'
         )
      `);
    }

    if (assessment.status === "exhausted") {
      await suspendRequiredCapabilities(providerName, assessment.status, assessment.resetAt);
    } else {
      const restored = await restoreVendorSuspensions(providerName);
      if (restored.length > 0) {
        log.info({ label: "vendor-capabilities-restored", provider: providerName, restored }, "vendor-capabilities-restored");
      }
    }
    if (before.status !== assessment.status || before.lastCheckedAt === null) {
      await alertVendorIssue(assessment);
    }
    return assessment;
  } catch (error) {
    const status = await markBalanceCheckFailure(providerName, error);
    if (status === "auth_error") {
      await suspendRequiredCapabilities(providerName, status, null);
    }
    if (status === "auth_error" || status === "unavailable") {
      await alertOnce(`vendor-control:${providerName}:${status}`, 12 * 60 * 60 * 1000, {
        severity: status === "auth_error" ? "critical" : "warning",
        subject: `${providerName} balance monitor is ${status}`,
        body: `${error instanceof Error ? error.message : String(error)}. This will appear in the next morning run.`,
      });
    }
    logWarn("vendor-balance-check-failed", "vendor balance check failed", {
      provider: providerName,
      status,
      err: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Called by vendor HTTP clients when the real API provides stronger evidence. */
function classifyVendorHttpFailure(
  providerName: string,
  httpStatus: number,
  detail = "",
): VendorStatus | null {
  if (providerName === "esortcode" && httpStatus === 403 && /ZeroCredits/i.test(detail)) {
    return "exhausted";
  }
  let status: VendorStatus | null = null;
  if (httpStatus === 402) status = "exhausted";
  else if (httpStatus === 401 || httpStatus === 403) status = "auth_error";
  else if (httpStatus === 429) status = "rate_limited";
  return status;
}

export async function recordVendorHttpFailure(
  providerName: string,
  httpStatus: number,
  detail = "",
): Promise<void> {
  const status = classifyVendorHttpFailure(providerName, httpStatus, detail);
  if (!status) return;
  const statusReason = providerName === "esortcode" && status === "exhausted"
    ? "eSortcode returned ZeroCredits"
    : `Authenticated API returned HTTP ${httpStatus}`;
  const rearmProvider = CREDENTIAL_REARM_PROVIDERS.find((item) => item.providerName === providerName);
  const blockedFingerprint = status === "auth_error" && rearmProvider
    ? credentialFingerprint(rearmProvider.envVar) ?? "missing"
    : null;

  await getDb().execute(sql`
    UPDATE vendor_accounts
       SET status = ${status},
           status_reason = ${statusReason},
           remaining_units = CASE WHEN ${status} = 'exhausted' THEN 0 ELSE remaining_units END,
           metadata = CASE
             WHEN ${blockedFingerprint} IS NOT NULL THEN jsonb_set(
               COALESCE(metadata, '{}'::jsonb) - 'recovery_probe',
               '{blocked_credential_fingerprint}',
               to_jsonb(${blockedFingerprint}::text)
             )
             ELSE COALESCE(metadata, '{}'::jsonb) - 'recovery_probe'
           END,
           last_checked_at = now(),
           last_error = ${`HTTP ${httpStatus}`},
           updated_at = now()
     WHERE provider_name = ${providerName}
  `);
  statusCache.delete(providerName);
  if (SUSPENDABLE.has(status)) {
    const resetRows = rowsOf<{ reset_at: string | null }>(await getDb().execute(sql`
      SELECT reset_at FROM vendor_accounts WHERE provider_name = ${providerName}
    `));
    await suspendRequiredCapabilities(providerName, status, resetRows[0]?.reset_at ?? null);
  }
}

/** A credential rotation is explicit operator evidence and costs no vendor
 * units. Re-arm the provider while preserving its existing local allowance;
 * the next real customer call confirms the new key and immediately re-blocks
 * on failure. The fingerprint is one-way and never exposes the credential. */
export async function rearmVendorAfterCredentialChange(
  providerName: string,
  envVar: string,
): Promise<boolean> {
  const fingerprint = credentialFingerprint(envVar);
  if (!fingerprint) return false;
  // Upgrade legacy auth_error rows without treating the absence of historical
  // evidence as a credential change. The next genuinely different value can
  // re-arm; this deployment cannot bless the existing unknown key.
  await getDb().execute(sql`
    UPDATE vendor_accounts
       SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{blocked_credential_fingerprint}',
             to_jsonb(${fingerprint}::text)
           ),
           updated_at = now()
     WHERE provider_name = ${providerName}
       AND status = 'auth_error'
       AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'blocked_credential_fingerprint')
  `);
  const result = await getDb().execute(sql`
    UPDATE vendor_accounts
       SET status = CASE
             WHEN monitor_mode = 'internal_counter' AND COALESCE(remaining_units, 0) <= 0
               THEN 'exhausted'
             ELSE 'healthy'
           END,
           status_reason = CASE
             WHEN monitor_mode = 'internal_counter' AND COALESCE(remaining_units, 0) <= 0
               THEN 'Credential changed, but local allowance still requires top-up reconciliation'
             ELSE 'Credential changed; re-armed without a synthetic vendor call'
           END,
           metadata = COALESCE(metadata, '{}'::jsonb) - 'blocked_credential_fingerprint',
           last_checked_at = now(),
           updated_at = now()
     WHERE provider_name = ${providerName}
       AND status = 'auth_error'
       AND metadata ? 'blocked_credential_fingerprint'
       AND metadata->>'blocked_credential_fingerprint' <> ${fingerprint}
     RETURNING status
  `);
  statusCache.delete(providerName);
  const row = rowsOf<{ status: VendorStatus }>(result)[0];
  if (!row) return false;
  if (row.status === "healthy" || row.status === "low") {
    await restoreVendorSuspensions(providerName);
  }
  return true;
}

async function completeRecoveryProbe(
  lease: RecoveryLease,
  units: number,
): Promise<VendorStatus | null> {
  const result = await getDb().execute(sql`
    UPDATE vendor_accounts
       SET used_units = CASE
             WHEN monitor_mode = 'internal_counter' THEN COALESCE(used_units, 0) + ${units}
             ELSE used_units
           END,
           remaining_units = CASE
             WHEN monitor_mode = 'internal_counter' AND remaining_units IS NOT NULL
               THEN GREATEST(0, remaining_units - ${units})
             ELSE remaining_units
           END,
           status = CASE
             WHEN monitor_mode = 'availability' THEN 'healthy'
             WHEN monitor_mode = 'internal_counter' AND remaining_units IS NULL THEN 'unknown'
             WHEN monitor_mode = 'internal_counter' AND remaining_units - ${units} <= 0 THEN 'exhausted'
             WHEN monitor_mode = 'internal_counter'
                  AND remaining_units - ${units} <= COALESCE(low_balance_threshold_units, 0) THEN 'low'
             WHEN monitor_mode = 'internal_counter' THEN 'healthy'
             ELSE status
           END,
           status_reason = CASE
             WHEN monitor_mode = 'availability'
               THEN 'Scheduled authenticated recovery canary succeeded'
             WHEN monitor_mode = 'internal_counter' AND remaining_units IS NOT NULL
               THEN 'Scheduled authenticated recovery canary succeeded; existing local allowance preserved'
             ELSE 'Recovery canary succeeded but no balance evidence exists; operator reconciliation required'
           END,
           metadata = COALESCE(metadata, '{}'::jsonb) - 'recovery_probe',
           last_checked_at = now(),
           last_success_at = now(),
           last_error = NULL,
           updated_at = now()
     WHERE provider_name = ${lease.providerName}
       AND status = ${lease.observedStatus}
       AND metadata#>>'{recovery_probe,token}' = ${lease.token}
       AND metadata#>>'{recovery_probe,status}' = ${lease.observedStatus}
       AND (metadata#>>'{recovery_probe,expires_at}')::timestamptz > now()
     RETURNING status
  `);
  statusCache.delete(lease.providerName);
  return rowsOf<{ status: VendorStatus }>(result)[0]?.status ?? null;
}

async function failRecoveryProbe(
  lease: RecoveryLease,
  message: string,
  nextStatus: VendorStatus = lease.observedStatus,
): Promise<boolean> {
  const result = await getDb().execute(sql`
    UPDATE vendor_accounts
       SET status = ${nextStatus},
           status_reason = CASE
             WHEN ${nextStatus} = 'exhausted' THEN ${message}
             ELSE status_reason
           END,
           remaining_units = CASE WHEN ${nextStatus} = 'exhausted' THEN 0 ELSE remaining_units END,
           metadata = COALESCE(metadata, '{}'::jsonb) - 'recovery_probe',
           last_checked_at = now(),
           last_error = ${message},
           updated_at = now()
     WHERE provider_name = ${lease.providerName}
       AND status = ${lease.observedStatus}
       AND metadata#>>'{recovery_probe,token}' = ${lease.token}
       AND metadata#>>'{recovery_probe,status}' = ${lease.observedStatus}
     RETURNING provider_name
  `);
  statusCache.delete(lease.providerName);
  return rowsOf<{ provider_name: string }>(result).length > 0;
}

export type RecoveryProbeOutcome = "not_due" | "recovered" | "still_blocked" | "failed" | "stale";

/** Run one scheduled, authenticated canary independently of serving
 * eligibility. Completion is compare-and-set against the exact lease token
 * and observed status, so a late response cannot overwrite newer evidence. */
export async function runVendorRecoveryProbe(
  providerName: string,
  status: VendorStatus,
  fetchImpl: FetchLike = fetch,
): Promise<RecoveryProbeOutcome> {
  const adapter = RECOVERY_ADAPTERS.find((item) => item.providerName === providerName);
  if (!adapter) return "not_due";
  const lease = await claimRecoveryProbe(providerName, status);
  if (!lease) return "not_due";

  let response: Response;
  try {
    const request = adapter.request();
    response = await fetchImpl(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failRecoveryProbe(lease, message);
    logWarn("vendor-recovery-probe-failed", "vendor recovery canary failed", {
      provider: providerName,
      err: message,
    });
    return "failed";
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const nextStatus = classifyVendorHttpFailure(providerName, response.status, detail)
      ?? lease.observedStatus;
    const message = providerName === "esortcode" && nextStatus === "exhausted"
      ? "eSortcode recovery canary returned ZeroCredits"
      : `Recovery canary returned HTTP ${response.status}`;
    await failRecoveryProbe(lease, message, nextStatus);
    logWarn("vendor-recovery-probe-blocked", "vendor recovery canary remains blocked", {
      provider: providerName,
      http_status: response.status,
    });
    return "still_blocked";
  }

  const completedStatus = await completeRecoveryProbe(lease, adapter.units);
  if (completedStatus === null) return "stale";
  if (completedStatus === "healthy" || completedStatus === "low") {
    await restoreVendorSuspensions(providerName);
    return "recovered";
  }
  return "still_blocked";
}

/** Local accounting for vendors such as Serper that publish no balance API. */
export async function recordVendorUsage(
  providerName: string,
  units: number,
): Promise<void> {
  if (!Number.isFinite(units) || units <= 0) return;
  const result = await getDb().execute(sql`
    UPDATE vendor_accounts
       SET used_units = CASE
             WHEN monitor_mode = 'internal_counter' THEN COALESCE(used_units, 0) + ${units}
             ELSE used_units
           END,
           remaining_units = CASE
             WHEN monitor_mode <> 'internal_counter' THEN remaining_units
             WHEN remaining_units IS NULL THEN NULL
             ELSE GREATEST(0, remaining_units - ${units})
           END,
           status = CASE
             WHEN monitor_mode = 'internal_counter' AND remaining_units - ${units} <= 0 THEN 'exhausted'
             WHEN monitor_mode = 'internal_counter'
                  AND remaining_units - ${units} <= COALESCE(low_balance_threshold_units, 0) THEN 'low'
             WHEN monitor_mode = 'internal_counter' AND remaining_units IS NOT NULL THEN 'healthy'
             WHEN status IN ('unknown', 'rate_limited', 'unavailable') THEN 'healthy'
             ELSE status
           END,
           status_reason = CASE
             WHEN monitor_mode = 'availability' OR status IN ('rate_limited', 'unavailable')
               THEN 'Authenticated API call succeeded'
             ELSE status_reason
           END,
           last_checked_at = now(),
           last_success_at = now(),
           updated_at = now()
     WHERE provider_name = ${providerName}
     RETURNING status, reset_at
  `);
  statusCache.delete(providerName);
  const row = rowsOf<{ status: VendorStatus; reset_at: string | null }>(result)[0];
  if (row && SUSPENDABLE.has(row.status)) {
    await suspendRequiredCapabilities(providerName, row.status, row.reset_at);
  }
}

export async function runVendorControlTower(): Promise<void> {
  const failed: string[] = [];
  for (const adapter of BALANCE_ADAPTERS) {
    const result = await syncBalanceVendor(adapter.providerName, adapter.fetchBalance);
    if (result === null) failed.push(adapter.providerName);
  }
  for (const provider of CREDENTIAL_REARM_PROVIDERS) {
    try {
      await rearmVendorAfterCredentialChange(provider.providerName, provider.envVar);
    } catch (error) {
      failed.push(`${provider.providerName}:credential-rearm`);
      logWarn("vendor-credential-rearm-failed", "credential-change rearm failed", {
        provider: provider.providerName,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const blocked = rowsOf<{ provider_name: string; status: VendorStatus }>(await getDb().execute(sql`
    SELECT DISTINCT va.provider_name, va.status
      FROM vendor_accounts va
     WHERE va.provider_name = 'esortcode'
       AND va.status IN ('auth_error', 'exhausted', 'unavailable')
       AND (
         EXISTS (
           SELECT 1 FROM vendor_capability_suspensions s
            WHERE s.provider_name = va.provider_name AND s.restored_at IS NULL
         )
         OR EXISTS (
           SELECT 1 FROM vendor_solution_suspensions s
            WHERE s.provider_name = va.provider_name AND s.restored_at IS NULL
         )
       )
  `));
  for (const account of blocked) {
    const outcome = await runVendorRecoveryProbe(account.provider_name, account.status);
    if (outcome === "failed") failed.push(`${account.provider_name}:recovery`);
  }
  // A healthy balance observation or guarded recovery canary may become
  // restorable only after restore_after. Retry those reversible restores.
  const recoverable = rowsOf<{ provider_name: string }>(await getDb().execute(sql`
    SELECT DISTINCT va.provider_name
      FROM vendor_accounts va
     WHERE va.status IN ('healthy', 'low')
       AND (
         EXISTS (
           SELECT 1 FROM vendor_capability_suspensions s
            WHERE s.provider_name = va.provider_name AND s.restored_at IS NULL
         )
         OR EXISTS (
           SELECT 1 FROM vendor_solution_suspensions s
            WHERE s.provider_name = va.provider_name AND s.restored_at IS NULL
         )
       )
  `));
  for (const account of recoverable) {
    try {
      await restoreVendorSuspensions(account.provider_name);
    } catch (error) {
      failed.push(`${account.provider_name}:restore`);
      logWarn("vendor-restore-sweep-failed", "vendor restoration sweep failed", {
        provider: account.provider_name,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (failed.length > 0) {
    throw new Error(`Vendor balance checks failed: ${failed.join(", ")}`);
  }
}

export function registeredBalanceAdapterNames(): string[] {
  return BALANCE_ADAPTERS.map((a) => a.providerName).sort();
}

export function registeredRecoveryAdapterNames(): string[] {
  return RECOVERY_ADAPTERS.map((a) => a.providerName).sort();
}
