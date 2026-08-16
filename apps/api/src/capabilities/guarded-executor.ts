/**
 * Phase A0b dispatcher gate.
 *
 * Every external invocation of a capability goes through `guardedExecute`.
 * The gate reads the capability's cost_class (Block 0067 schema), consults
 * the ALLOW_MATRIX, and either:
 *
 *   - allows the call (delegates to the registered executor),
 *   - refuses with a typed error (paid_prepaid / paid_subscription from a
 *     non-customer_paid context — scheduler/CI/health-probe must never
 *     burn paid credits), or
 *   - allows-with-budget-check (free_quota / paid_with_free_tier from a
 *     non-customer_paid context — increments a per-window counter against
 *     a fraction of the vendor quota and refuses if the budget is spent).
 *
 * Unclassified capabilities (cost_class IS NULL) follow the GRACE-mode
 * inverted default: customer_paid still flows through (preserves customer
 * traffic during the Phase B backfill window); all other contexts are
 * refused with `CapabilityNotClassifiedError`.
 *
 * Intra-capability invocations (a capability executor calling another
 * executor via the registry) are NOT routed through `guardedExecute` —
 * the outer call already paid the ALLOW_MATRIX check, and double-counting
 * the budget would be wrong. Such call sites continue to use `getExecutor`.
 *
 * Background: 2026-05-11 investigation found 95% of 60-day DE OpenRegister
 * traffic came from the test scheduler, exhausting the 50/mo free tier.
 * Root cause: scheduler treated `external_cost_cents = 0` as "free to
 * test," conflating "no per-call cost" with "no quota". Journal:
 * https://www.notion.so/35d67c87082c812ba68ec4e424f8cad1
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { log, logError, logWarn } from "../lib/log.js";
import { alertOnce } from "../lib/alert-once.js";
import {
  type CapabilityExecutor,
  type CapabilityInput,
  type CapabilityResult,
  getExecutor,
} from "./index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Canonical enum values, mirroring the Block 0067 DB CHECK constraint. */
export const COST_CLASSES = [
  "free_unlimited",
  "free_quota",
  "paid_with_free_tier",
  "paid_prepaid",
  "paid_subscription",
] as const;

export type CostClass = (typeof COST_CLASSES)[number];

export type QuotaWindow = "daily" | "monthly" | "none";

export interface CapabilityCostMeta {
  slug: string;
  cost_class: CostClass | null;
  quota_window: QuotaWindow | null;
  quota_cap: number | null;
  quota_reset_dom: number | null;
}

/**
 * Discriminated union of who is invoking the executor. Every call site
 * must pass an explicit value — no default. TypeScript enforces presence;
 * the runtime ALLOW_MATRIX enforces semantics.
 */
export type InvocationContext =
  | { kind: "customer_paid"; userId: string | null; transactionId: string | null }
  | { kind: "internal_test"; suiteId: string; reason: "scheduled" | "manual" }
  | { kind: "health_probe"; probeId: string }
  | { kind: "ci"; workflowRunId: string };

/**
 * How long before the same budget alert may reach an inbox again. Seven days:
 * long enough that a daily-resetting window cannot produce a daily email, short
 * enough that a genuinely new or worsening situation still surfaces within a
 * week.
 */
const ALERT_COOLDOWN_DAYS = 7;

type Decision = "allow" | "refuse" | "budget_check";

// ─── ALLOW_MATRIX ───────────────────────────────────────────────────────────
//
// Single source of truth for which (cost_class × invocation_context) cells
// permit execution. Read top-to-bottom:
//
//   * paid_prepaid × {internal_test, health_probe, ci} → refuse. Every call
//     bills; non-customer paths must never spend.
//   * paid_subscription × {internal_test, ci} → refuse. Subscriptions have
//     flat cost, but scheduling test traffic against them inflates the
//     vendor's claimed-usage metric and may breach fair-use clauses.
//     health_probe is allowed because probes don't invoke the executor;
//     they ping the vendor URL directly (lib/dependency-manifest.ts).
//   * free_quota × non-customer → budget_check. Scheduler/CI consumption
//     leaves headroom for customer traffic via the 10%/20% caps.
//   * paid_with_free_tier × non-customer → budget_check. Tighter 5%/10%
//     caps because the next call could be the one that bills.
//   * free_unlimited × anything → allow. No constraint.
//   * customer_paid × anything → allow. Customer paid; budget reservations
//     are for Strale's own non-customer testing.

const ALLOW_MATRIX: Record<CostClass, Record<InvocationContext["kind"], Decision>> = {
  free_unlimited: {
    customer_paid: "allow",
    internal_test: "allow",
    health_probe: "allow",
    ci: "allow",
  },
  free_quota: {
    customer_paid: "allow",
    internal_test: "budget_check",
    health_probe: "allow",
    ci: "budget_check",
  },
  paid_with_free_tier: {
    customer_paid: "allow",
    internal_test: "budget_check",
    health_probe: "allow",
    ci: "budget_check",
  },
  paid_prepaid: {
    customer_paid: "allow",
    internal_test: "refuse",
    health_probe: "refuse",
    ci: "refuse",
  },
  paid_subscription: {
    customer_paid: "allow",
    internal_test: "refuse",
    health_probe: "allow",
    ci: "refuse",
  },
};

/**
 * Unclassified row (cost_class IS NULL) → fail-closed for non-customer
 * contexts, but allow customer_paid so the boot invariant's GRACE mode
 * doesn't break customer traffic for caps awaiting classification.
 * Per Phase A0b chat decision Q2.
 */
const NULL_DECISIONS: Record<InvocationContext["kind"], Decision> = {
  customer_paid: "allow",
  internal_test: "refuse",
  health_probe: "refuse",
  ci: "refuse",
};

// ─── Error classes ──────────────────────────────────────────────────────────

/**
 * Read-only view of the matrix for one invocation context, including the
 * unclassified (`cost_class IS NULL`) row.
 *
 * Exported for tests. The `customer_paid` column being `allow` throughout is
 * what makes a cost-control refusal unreachable from customer traffic — every
 * customer-facing entry point passes that context — so it is worth pinning
 * rather than leaving as a property nobody checks.
 */
export function describeAllowMatrix(
  kind: InvocationContext["kind"],
): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const [costClass, byKind] of Object.entries(ALLOW_MATRIX)) {
    out[costClass] = byKind[kind];
  }
  out["(unclassified)"] = NULL_DECISIONS[kind];
  return out;
}

export class CapabilityNotClassifiedError extends Error {
  constructor(public slug: string, public ctx: InvocationContext) {
    super(
      `Capability '${slug}' has no cost_class. Non-customer invocations are refused ` +
        `during the Phase A0b GRACE window. Classify by adding cost_class to ` +
        `manifests/${slug}.yaml (see CLAUDE.md cost-class taxonomy).`,
    );
    this.name = "CapabilityNotClassifiedError";
  }
}

export class CapabilityInvocationRefusedError extends Error {
  constructor(
    public slug: string,
    public costClass: CostClass,
    public contextKind: InvocationContext["kind"],
  ) {
    super(
      `Capability '${slug}' (cost_class=${costClass}) refuses invocation from ` +
        `context kind '${contextKind}'. ALLOW_MATRIX governs this; bypass would ` +
        `burn vendor credits outside customer-initiated paths.`,
    );
    this.name = "CapabilityInvocationRefusedError";
  }
}

export class BudgetExhaustedError extends Error {
  constructor(
    public slug: string,
    public meta: CapabilityCostMeta,
    public ctx: InvocationContext,
  ) {
    super(
      `Capability '${slug}' has exhausted its ${meta.quota_window} test budget ` +
        `(${meta.cost_class}, quota_cap=${meta.quota_cap}). Customer traffic is ` +
        `unaffected; Strale's own test/CI usage must wait for the next window.`,
    );
    this.name = "BudgetExhaustedError";
  }
}

// ─── Cost-meta lookup ───────────────────────────────────────────────────────
//
// Backed by an in-process LRU-style cache so a hot capability doesn't
// trigger a SELECT per call. The cache is invalidated only by process
// restart (acceptable: cost_class changes deploy via migration → restart).
//
// Cache TTL is 5 minutes; tests can call `__resetCostMetaCacheForTests`.

const META_CACHE_TTL_MS = 5 * 60 * 1000;
const metaCache = new Map<string, { value: CapabilityCostMeta; expiresAt: number }>();

export function __resetCostMetaCacheForTests(): void {
  metaCache.clear();
}

/**
 * Pre-insert cost-meta seed for the onboarding pipeline.
 *
 * onboard.ts verifies fixtures BEFORE persistCapability(), so a brand-new
 * capability has no DB row when the gate consults getCapabilityCostMeta —
 * cost_class reads NULL and internal_test is refused. That made
 * `onboard.ts --strict` impossible for any new capability, even one whose
 * manifest correctly declared cost_class (observed 2026-08-12 onboarding
 * page-exists), while the refusal message instructed the author to do
 * exactly what they had already done. The manifest is the authoring
 * surface for cost_class (see normalizeManifestToRow), so during
 * onboarding the declared value may be seeded into the in-process cache;
 * persistCapability writes the identical value to the DB moments later.
 *
 * Note the seed does NOT bypass the ALLOW_MATRIX: it only supplies the
 * cost_class the matrix consults. New paid_prepaid / paid_subscription
 * capabilities are still refused from internal_test — by design, onboard
 * verification must never burn paid vendor credits.
 *
 * Fail-closed is preserved: this function throws on null or invalid
 * cost_class instead of defaulting (the caller early-returns for
 * undeclared manifests, so the gate simply stays closed for them). The
 * same invalid value would be rejected by the Block 0067 CHECK constraint
 * at insert time anyway.
 */
export function seedCostMetaForOnboarding(meta: CapabilityCostMeta): void {
  if (meta.cost_class === null || !COST_CLASSES.includes(meta.cost_class)) {
    throw new Error(
      `seedCostMetaForOnboarding: '${meta.slug}' declared invalid cost_class ` +
        `'${String(meta.cost_class)}' — must be one of: ${COST_CLASSES.join(", ")}.`,
    );
  }
  metaCache.set(meta.slug, {
    value: meta,
    expiresAt: Date.now() + META_CACHE_TTL_MS,
  });
}

export async function getCapabilityCostMeta(slug: string): Promise<CapabilityCostMeta> {
  const now = Date.now();
  const cached = metaCache.get(slug);
  if (cached && cached.expiresAt > now) return cached.value;

  const db = getDb();
  const rows = await db.execute(sql`
    SELECT slug, cost_class, quota_window, quota_cap, quota_reset_dom
      FROM capabilities
     WHERE slug = ${slug}
  `);
  const resultRows = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
  const row = resultRows[0] as {
    slug?: string;
    cost_class?: string | null;
    quota_window?: string | null;
    quota_cap?: number | null;
    quota_reset_dom?: number | null;
  } | undefined;

  const meta: CapabilityCostMeta = {
    slug,
    cost_class: (row?.cost_class as CostClass | null) ?? null,
    quota_window: (row?.quota_window as QuotaWindow | null) ?? null,
    quota_cap: row?.quota_cap ?? null,
    quota_reset_dom: row?.quota_reset_dom ?? null,
  };

  metaCache.set(slug, { value: meta, expiresAt: now + META_CACHE_TTL_MS });
  return meta;
}

// ─── Budget window + cap helpers ────────────────────────────────────────────

/**
 * Compute the start-of-window timestamp for the given quota_window kind.
 * Daily windows start at UTC midnight; monthly windows start on the
 * vendor's reset day-of-month (defaults to 1 if quota_reset_dom is null).
 * Pure function; safe in test environments.
 */
export function computeWindowStart(
  windowKind: "daily" | "monthly",
  quotaResetDom: number | null,
  now: Date = new Date(),
): Date {
  if (windowKind === "daily") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  // monthly
  const resetDom = quotaResetDom ?? 1;
  const cur = new Date(now);
  const year = cur.getUTCFullYear();
  const month = cur.getUTCMonth();
  // Try this month's reset day. If we're before that day, use last month's.
  const thisCycle = new Date(Date.UTC(year, month, resetDom, 0, 0, 0, 0));
  if (cur >= thisCycle) return thisCycle;
  return new Date(Date.UTC(year, month - 1, resetDom, 0, 0, 0, 0));
}

/**
 * Pick the budget cap as a percentage of the vendor quota.
 * Per design point 4:
 *   free_quota          → 10% daily / 20% monthly
 *   paid_with_free_tier → 5% daily / 10% monthly
 * Ceiling at 1 — a capability with quota_cap < 10 still gets at least
 * one test slot per window. (free_unlimited / paid_* never reach here.)
 */
export function computeBudgetCap(meta: CapabilityCostMeta): number {
  if (meta.quota_cap == null || meta.quota_window == null) {
    throw new Error(`computeBudgetCap: ${meta.slug} missing quota_cap/quota_window`);
  }
  let pct: number;
  if (meta.cost_class === "free_quota") {
    pct = meta.quota_window === "daily" ? 0.10 : 0.20;
  } else if (meta.cost_class === "paid_with_free_tier") {
    pct = meta.quota_window === "daily" ? 0.05 : 0.10;
  } else {
    throw new Error(
      `computeBudgetCap: ${meta.slug} cost_class ${meta.cost_class} doesn't budget-track`,
    );
  }
  return Math.max(1, Math.floor(meta.quota_cap * pct));
}

// ─── Budget assertion (atomic increment) ────────────────────────────────────

interface BudgetRow {
  test_count: number;
  budget_cap: number;
  alert_30_fired_at: Date | null;
  alert_50_fired_at: Date | null;
  alert_80_fired_at: Date | null;
  hard_stop_fired_at: Date | null;
}

/**
 * Atomic increment via INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
 * The post-increment value is read in the same round-trip; if it exceeds
 * budget_cap we decrement back and throw `BudgetExhaustedError` — the
 * call never reaches the executor.
 *
 * Race semantics: under burst load the counter can briefly show
 * `budget_cap + N` (N = concurrent overshoots in flight). All overshoots
 * decrement and throw — no extra calls leak through. The next request
 * after the burst sees `<= budget_cap` and proceeds normally.
 */
export async function assertBudgetAvailable(
  slug: string,
  meta: CapabilityCostMeta,
  ctx: InvocationContext,
): Promise<void> {
  if (meta.quota_window === null || meta.quota_window === "none") {
    throw new Error(
      `assertBudgetAvailable: ${slug} has window=${meta.quota_window} — should not budget-check`,
    );
  }
  const budgetCap = computeBudgetCap(meta);
  // Bound as an ISO STRING, never a Date instance: a Date inside
  // db.execute(sql``) queryChunks hits the postgres-js encoder as a raw
  // object and throws 'argument must be of type string... Received an
  // instance of Date' — the PR #43 bind-encoder bug class (DEC-20260504-A).
  // Surfaced live 2026-08-12 by the first free_quota smoke run.
  const windowStart = computeWindowStart(meta.quota_window, meta.quota_reset_dom).toISOString();
  const windowKind = meta.quota_window;

  const db = getDb();
  const result = await db.execute(sql`
    INSERT INTO capability_budget_counters (capability_slug, window_start, window_kind, test_count, budget_cap)
    VALUES (${slug}, ${windowStart}, ${windowKind}, 1, ${budgetCap})
    ON CONFLICT (capability_slug, window_start, window_kind)
    DO UPDATE SET test_count = capability_budget_counters.test_count + 1, updated_at = NOW()
    RETURNING test_count, budget_cap, alert_30_fired_at, alert_50_fired_at, alert_80_fired_at, hard_stop_fired_at
  `);
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows ?? [];
  const row = rows[0] as BudgetRow | undefined;
  if (!row) {
    // Shouldn't happen — RETURNING always emits the affected row.
    throw new Error(`assertBudgetAvailable: no row returned for ${slug}`);
  }

  if (row.test_count > row.budget_cap) {
    // Over budget — decrement to keep the counter honest, then refuse.
    await db.execute(sql`
      UPDATE capability_budget_counters
         SET test_count = test_count - 1
       WHERE capability_slug = ${slug}
         AND window_start = ${windowStart}
         AND window_kind = ${windowKind}
    `);
    // Fire hard-stop alert at most once per window.
    if (!row.hard_stop_fired_at) {
      void fireBudgetHardStopAlert(slug, meta, budgetCap, ctx).catch((err) =>
        logError("budget-hard-stop-alert-failed", err, { slug }),
      );
      await db.execute(sql`
        UPDATE capability_budget_counters
           SET hard_stop_fired_at = NOW()
         WHERE capability_slug = ${slug}
           AND window_start = ${windowStart}
           AND window_kind = ${windowKind}
           AND hard_stop_fired_at IS NULL
      `);
    }
    throw new BudgetExhaustedError(slug, meta, ctx);
  }

  // Fire threshold alerts (fire-and-forget, atomic single-fire via NULL check).
  void maybeFireThresholdAlerts(row, slug, meta, budgetCap, windowStart, windowKind).catch((err) =>
    logError("budget-threshold-alert-failed", err, { slug }),
  );
}

async function maybeFireThresholdAlerts(
  row: BudgetRow,
  slug: string,
  meta: CapabilityCostMeta,
  budgetCap: number,
  windowStart: string, // ISO string — see the bind-encoder note in assertBudgetAvailable
  windowKind: "daily" | "monthly",
): Promise<void> {
  const pct = row.test_count / budgetCap;
  const db = getDb();
  const tryFire = async (
    threshold: 30 | 50 | 80,
    column: "alert_30_fired_at" | "alert_50_fired_at" | "alert_80_fired_at",
    alreadyFired: Date | null,
  ): Promise<void> => {
    if (alreadyFired) return;
    if (pct < threshold / 100) return;
    // A daily budget window resets every day, so a harness that reliably
    // consumes 80% of it produces an identical WARNING every morning. Four
    // arrived overnight on 2026-08-16, for capabilities whose caps were doing
    // exactly what they exist to do. Recurrence is not news — the first one is,
    // and the ones after it teach the reader to ignore the channel. The
    // per-window database flags below are unchanged, so the full history stays
    // queryable even when the email is suppressed.
    await alertOnce(
      `budget-threshold:${slug}:${threshold}`,
      ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
      {
        subject: `[budget] ${slug} reached ${threshold}% of ${meta.quota_window} test budget`,
        body:
          // Written for Petter, who is non-technical. The raw enum values
          // (cost_class, quota_window, ctx.kind) stay out of the email; the
          // slug stays in because it is the one token he can search for.
          `Data service: ${slug}\n` +
          `Our own testing has used ${row.test_count} of the ${budgetCap} daily calls we allow ` +
          `ourselves against this supplier (${(pct * 100).toFixed(1)}%).\n\n` +
          `This is our own test harness consuming a vendor free allowance, not a\n` +
          `customer problem: the cap exists so customer traffic is never starved\n` +
          `by our testing, and it is working. Repeats within ${ALERT_COOLDOWN_DAYS} days are logged\n` +
          `but not emailed.`,
        severity: threshold === 80 ? "warning" : "info",
      },
    );
    // Mark fired so subsequent calls don't re-alert. Composite-PK UPDATE
    // is atomic; if two callers race, only the first NULL→NOW() wins.
    if (column === "alert_30_fired_at") {
      await db.execute(sql`
        UPDATE capability_budget_counters
           SET alert_30_fired_at = NOW()
         WHERE capability_slug = ${slug} AND window_start = ${windowStart}
           AND window_kind = ${windowKind} AND alert_30_fired_at IS NULL
      `);
    } else if (column === "alert_50_fired_at") {
      await db.execute(sql`
        UPDATE capability_budget_counters
           SET alert_50_fired_at = NOW()
         WHERE capability_slug = ${slug} AND window_start = ${windowStart}
           AND window_kind = ${windowKind} AND alert_50_fired_at IS NULL
      `);
    } else {
      await db.execute(sql`
        UPDATE capability_budget_counters
           SET alert_80_fired_at = NOW()
         WHERE capability_slug = ${slug} AND window_start = ${windowStart}
           AND window_kind = ${windowKind} AND alert_80_fired_at IS NULL
      `);
    }
  };
  await tryFire(30, "alert_30_fired_at", row.alert_30_fired_at);
  await tryFire(50, "alert_50_fired_at", row.alert_50_fired_at);
  await tryFire(80, "alert_80_fired_at", row.alert_80_fired_at);
}

async function fireBudgetHardStopAlert(
  slug: string,
  meta: CapabilityCostMeta,
  budgetCap: number,
  ctx: InvocationContext,
): Promise<void> {
  // Rate-limited for the same reason as the thresholds, and more so: a
  // capability whose harness exhausts a daily budget does it again tomorrow.
  // `swedish-company-data` hit its cap on three consecutive days in August.
  // The refusal still happens and is still logged every time — only the email
  // is throttled.
  await alertOnce(
    `budget-hard-stop:${slug}`,
    ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    {
    subject: `[budget-hard-stop] ${slug} exhausted ${meta.quota_window} test budget`,
    body:
      `Data service: ${slug}\n` +
      `Our own testing has used its entire ${meta.quota_window} allowance with this ` +
      `supplier (${budgetCap} calls), so further testing of it is paused until the ` +
      `allowance resets.\n\n` +
      `Customers are unaffected — this only stops Strale testing itself. ` +
      `Nothing needs doing unless you see it every week.\n\n` +
      `Repeats within ${ALERT_COOLDOWN_DAYS} days are logged but not emailed — the refusal ` +
      `still happens every time.`,
    severity: "critical",
    },
  );
}

// ─── The gate ───────────────────────────────────────────────────────────────

/**
 * The dispatcher gate. All external invocations of a capability flow
 * through here. Throws on refusal; returns the executor's result on
 * allow / budget-checked allow.
 *
 * Intra-capability calls (capability A calls capability B internally
 * via `getExecutor`) bypass this gate intentionally — the outer call
 * has already passed the ALLOW_MATRIX check.
 */
export async function guardedExecute(
  slug: string,
  input: CapabilityInput,
  ctx: InvocationContext,
): Promise<CapabilityResult> {
  await assertGuardedAllow(slug, ctx);
  const executor: CapabilityExecutor | undefined = getExecutor(slug);
  if (!executor) {
    throw new Error(`Executor not registered for ${slug}`);
  }
  return executor(input);
}

/**
 * The same ALLOW_MATRIX + budget check, but without the executor call.
 * Use this when the caller has its own retry / wrapping logic (do.ts's
 * `executeWithRetry`, the solution-executor's per-step orchestration)
 * and just needs the gate decision applied once per logical invocation.
 *
 * Throws on refusal; void on allow / budget-checked allow.
 */
export async function assertGuardedAllow(
  slug: string,
  ctx: InvocationContext,
): Promise<void> {
  const meta = await getCapabilityCostMeta(slug);
  const decision: Decision = meta.cost_class === null
    ? NULL_DECISIONS[ctx.kind]
    : ALLOW_MATRIX[meta.cost_class][ctx.kind];

  if (decision === "refuse") {
    if (meta.cost_class === null) {
      log.warn(
        {
          label: "guarded-execute-refused-unclassified",
          slug,
          ctx_kind: ctx.kind,
        },
        `guarded-execute refused: ${slug} unclassified, context ${ctx.kind}`,
      );
      throw new CapabilityNotClassifiedError(slug, ctx);
    }
    logWarn(
      "guarded-execute-refused",
      `guarded-execute refused: ${slug} (${meta.cost_class}) from ${ctx.kind}`,
      { slug, cost_class: meta.cost_class, ctx_kind: ctx.kind },
    );
    throw new CapabilityInvocationRefusedError(slug, meta.cost_class, ctx.kind);
  }

  if (decision === "budget_check") {
    await assertBudgetAvailable(slug, meta, ctx);
  }
}
