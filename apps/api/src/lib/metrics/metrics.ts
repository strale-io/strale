/**
 * Business metrics, defined once each.
 *
 * Rule: no business number is computed anywhere else. A metric that lives in a
 * script gets its window, population and instrument guard re-decided by
 * whoever writes the script next — which is how the same afternoon produced
 * five different wrong answers.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import type { Measurement, Window } from "./types.js";
import { coversWindow, commonWindowStart, evidenceFor } from "./instruments.js";
import {
  externalCustomers, isAutomatedTooling, isCustomerCandidate, VISIT_DAY_CAVEAT,
} from "./populations.js";
import { ACTOR_KEY_SQL, ACTOR_KIND_SQL } from "./actor-identity.js";

export function windowOf(days: number, label?: string): Window {
  const to = new Date();
  return { from: new Date(to.getTime() - days * 86_400_000), to, label: label ?? `last ${days} days` };
}

/**
 * Window bounds as ISO strings, never as Date objects.
 *
 * postgres-js cannot encode a Date instance reaching a `sql` template through
 * db.execute — it throws ERR_INVALID_ARG_TYPE at bind time. This is the exact
 * defect from the PR-43 incident (DEC-20260504-A), which silently 500-ed paid
 * calls for four days. Every query below binds through this helper so no Date
 * can reach the driver, and a test asserts the source contains no raw Date
 * interpolation.
 */
function bounds(w: Window): { from: string; to: string } {
  return { from: w.from.toISOString(), to: w.to.toISOString() };
}

async function rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  return (await getDb().execute(q)) as unknown as T[];
}

/** Revenue from external customers. In cents; the caller formats. */
export async function revenueCents(w: Window): Promise<Measurement<number>> {
  const guard = coversWindow("transaction_revenue", w.from);
  if (!guard.ok) {
    return {
      status: "unavailable", population: "external_customers", requestedWindow: w,
      reason: guard.absent
        ? { kind: "instrument_absent", instrument: "transaction_revenue" }
        : { kind: "instrument_too_young", instrument: "transaction_revenue", enabledAt: guard.enabledAt },
    };
  }
  const r = await rows<{ cents: string }>(sql`
    SELECT COALESCE(SUM(t.price_cents), 0)::int AS cents FROM transactions t
    WHERE t.status = 'completed' AND t.created_at >= ${bounds(w).from} AND t.created_at <= ${bounds(w).to}
      AND ${externalCustomers("t")}`);
  return {
    status: "observed", value: Number(r[0]?.cents ?? 0), window: w,
    population: "external_customers", instruments: evidenceFor(["transaction_revenue"]),
  };
}

/**
 * Distinct paying identities. Rolling 28 days by default, per review: a weekly
 * count at this volume is dominated by one buyer's schedule rather than by
 * anything we did. Called "payer identities" and not "customers" deliberately —
 * one wallet is not provably one person, and we should not imply resolution we
 * do not have.
 */
export async function payerIdentities(
  w: Window,
): Promise<Measurement<{ total: number; returning: number; topShare: number }>> {
  const guard = coversWindow("x402_payer_identity", w.from);
  if (!guard.ok) {
    const enabledAt = guard.enabledAt;
    return {
      status: "unavailable", population: "external_customers", requestedWindow: w,
      availableWindow: enabledAt
        ? { from: enabledAt, to: w.to, label: `since ${enabledAt.toISOString().slice(0, 10)}` }
        : undefined,
      reason: guard.absent
        ? { kind: "instrument_absent", instrument: "x402_payer_identity" }
        : { kind: "instrument_too_young", instrument: "x402_payer_identity", enabledAt },
    };
  }
  const r = await rows<{ hash: string; n: string; cents: string; first_seen: string }>(sql`
    SELECT t.x402_payer_hash AS hash, COUNT(*)::int AS n,
           COALESCE(SUM(t.price_cents),0)::int AS cents, MIN(t.created_at) AS first_seen
    FROM transactions t
    WHERE t.x402_payer_hash IS NOT NULL AND t.status = 'completed'
      AND t.created_at >= ${bounds(w).from} AND t.created_at <= ${bounds(w).to} AND ${externalCustomers("t")}
    GROUP BY 1`);
  if (r.length === 0) {
    return {
      status: "unavailable", population: "external_customers", requestedWindow: w,
      reason: { kind: "no_data" },
    };
  }
  const totalCents = r.reduce((a, x) => a + Number(x.cents), 0);
  const returning = r.filter((x) => new Date(x.first_seen) < w.from).length;
  const topShare = totalCents === 0 ? 0
    : Math.max(...r.map((x) => Number(x.cents))) / totalCents;
  return {
    status: "observed",
    value: { total: r.length, returning, topShare },
    window: w, population: "external_customers",
    instruments: evidenceFor(["x402_payer_identity"]),
    caveat: r.length === 1 ? "All of it from a single wallet." : undefined,
  };
}

export interface FunnelStep { id: string; label: string; visitDays: number; events: number }

/**
 * MCP funnel. Every step shares one window — the latest activation across all
 * of them, floored at the requested start so it cannot silently drift to
 * all-time. Comparing steps over different periods is what manufactured the
 * "92% of agents never look at the catalogue" finding.
 */
export async function mcpFunnel(w: Window): Promise<Measurement<FunnelStep[]>> {
  const need = ["mcp_initialize", "mcp_tools"];
  const common = commonWindowStart(need);
  if (!common) {
    return {
      status: "unavailable", population: "agent_visit_days", requestedWindow: w,
      reason: { kind: "steps_disagree", detail: "one of the funnel steps has no known start date" },
    };
  }
  const from = new Date(Math.max(common.getTime(), w.from.getTime()));
  const effective: Window = {
    from, to: w.to,
    label: from > w.from ? `since ${from.toISOString().slice(0, 16).replace("T", " ")} UTC` : w.label,
  };
  const r = await rows<{ endpoint: string; events: string; visit_days: string }>(sql`
    SELECT dh.endpoint,
           COUNT(*) FILTER (WHERE ${isCustomerCandidate("dh")})::int AS events,
           COUNT(DISTINCT dh.ip_hash) FILTER (WHERE ${isCustomerCandidate("dh")})::int AS visit_days
    FROM discovery_hits dh
    WHERE dh.created_at >= ${from.toISOString()} AND dh.created_at <= ${bounds(w).to} AND dh.endpoint LIKE '/mcp:%'
    GROUP BY 1`);
  const pick = (prefix: string, label: string): FunnelStep => {
    const m = r.filter((x) => x.endpoint.startsWith(prefix));
    return {
      id: prefix, label,
      events: m.reduce((a, x) => a + Number(x.events), 0),
      visitDays: m.reduce((a, x) => a + Number(x.visit_days), 0),
    };
  };
  return {
    status: "observed",
    value: [
      pick("/mcp:initialize", "Found us"),
      pick("/mcp:tools/list", "Looked around"),
      pick("/mcp:tools/call", "Tried something"),
    ],
    window: effective, population: "agent_visit_days",
    instruments: evidenceFor(need), caveat: VISIT_DAY_CAVEAT,
  };
}

/** Automated tooling that checks on us — reported separately, never as demand. */
export async function monitorVisitDays(w: Window): Promise<Measurement<number>> {
  const guard = coversWindow("mcp_initialize", w.from);
  const from = guard.ok ? w.from : (guard.enabledAt ?? w.from);
  const r = await rows<{ n: string }>(sql`
    SELECT COUNT(DISTINCT dh.ip_hash)::int AS n FROM discovery_hits dh
    WHERE dh.endpoint = '/mcp:initialize' AND dh.created_at >= ${from.toISOString()}
      AND dh.created_at <= ${bounds(w).to} AND ${isAutomatedTooling("dh")}`);
  return {
    status: "observed", value: Number(r[0]?.n ?? 0),
    window: { ...w, from }, population: "monitor_visit_days",
    instruments: evidenceFor(["mcp_initialize"]), caveat: VISIT_DAY_CAVEAT,
  };
}

/**
 * How much of our traffic we can attribute to anyone at all. Reported next to
 * the metrics that depend on it: on 2026-08-15 this was ~0.2%, which is why
 * "is our revenue one customer or twenty" was unanswerable.
 */
export async function identityCoverage(w: Window): Promise<Measurement<number>> {
  const r = await rows<{ total: string; identified: string }>(sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE t.client_meta IS NOT NULL OR t.x402_payer_hash IS NOT NULL
                              OR t.user_id IS NOT NULL)::int AS identified
    FROM transactions t WHERE t.created_at >= ${bounds(w).from} AND t.created_at <= ${bounds(w).to}
      AND ${externalCustomers("t")}`);
  const total = Number(r[0]?.total ?? 0);
  if (total === 0) {
    return {
      status: "unavailable", population: "all_transactions", requestedWindow: w,
      reason: { kind: "no_data" },
    };
  }
  const ratio = Number(r[0]!.identified) / total;
  return {
    status: "observed", value: ratio, window: w, population: "all_transactions",
    instruments: evidenceFor(["client_meta", "x402_payer_identity"]),
    caveat: ratio < 0.5
      ? `We can only tell who made ${(ratio * 100).toFixed(1)}% of calls, so customer counts are a floor.`
      : undefined,
  };
}

// ─── remaining metrics, so the dashboard computes nothing itself ───────────

/**
 * Paying actors, across every rail — the metric the whole identity spine
 * exists to make answerable. Uses the same expression as the
 * `transaction_actors` view rather than the view itself, so this works before
 * migration 0085 reaches production and cannot disagree with it afterwards.
 *
 * Rolling 28 days by default: at this volume a weekly count is dominated by
 * one buyer's schedule rather than by anything we did.
 *
 * **Instrument age is handled, not ignored.** Half the actor key comes from
 * `user_id`, which is as old as the table; the other half from
 * `x402_payer_hash`, enabled 2026-08-15. While that half is younger than the
 * window the wallet side is truncated — some x402 revenue is unattributable
 * only because the column did not exist yet, and *no* actor can have been
 * first seen before the window opened, so `returning` would be a structural
 * zero rather than a measurement.
 *
 * So: `estimated` (not `observed`) with the truncation stated, and `returning`
 * is `null` — "we cannot tell yet" — rather than 0. Reporting a one-day-old
 * instrument as a 28-day fact is the 2026-08-15 "1 paying customer" error, and
 * this metric is the one the dashboard actually calls.
 */
export async function payingActors(
  w: Window,
): Promise<Measurement<{ total: number; returning: number | null; topShare: number; unattributedCents: number; byKind: Record<string, number> }>> {
  const guard = coversWindow("x402_payer_identity", w.from);
  const r = await rows<{ actor_key: string; actor_kind: string; cents: string; first_seen: string }>(sql`
    SELECT ${sql.raw(ACTOR_KEY_SQL)} AS actor_key,
           ${sql.raw(ACTOR_KIND_SQL)} AS actor_kind,
           COALESCE(SUM(t.price_cents), 0)::int AS cents,
           MIN(t.created_at) AS first_seen
    FROM transactions t
    WHERE t.status = 'completed' AND t.price_cents > 0
      AND t.created_at >= ${bounds(w).from} AND t.created_at <= ${bounds(w).to}
      AND ${externalCustomers("t")}
    GROUP BY 1, 2`);
  const identified = r.filter((x) => x.actor_key !== null);
  if (identified.length === 0) {
    return { status: "unavailable", population: "external_customers", requestedWindow: w,
             reason: { kind: "no_data" } };
  }
  const identifiedCents = identified.reduce((a, x) => a + Number(x.cents), 0);
  // Revenue we could not attribute to anyone. `topShare` MUST be a share of
  // all external revenue, not of the attributed slice: dividing by the slice
  // turns "one wallet, plus a lot we cannot see" into a confident 100%.
  const unattributedCents = r
    .filter((x) => x.actor_key === null)
    .reduce((a, x) => a + Number(x.cents), 0);
  const totalCents = identifiedCents + unattributedCents;
  const byKind: Record<string, number> = {};
  for (const x of identified) byKind[x.actor_kind] = (byKind[x.actor_kind] ?? 0) + 1;
  const topShare = totalCents === 0 ? 0
    : Math.max(...identified.map((x) => Number(x.cents))) / totalCents;
  const caveat = identified.length === 1
    ? (unattributedCents > 0
        ? "One identified buyer, and money we cannot yet trace to anyone."
        : "All of it from a single buyer.")
    : undefined;
  const value = {
    total: identified.length,
    // "Returning" = first seen before this window opened, which is only
    // answerable once the identity instrument is older than the window.
    returning: guard.ok
      ? identified.filter((x) => new Date(x.first_seen) < w.from).length
      : null,
    topShare,
    unattributedCents,
    byKind,
  };
  if (!guard.ok) {
    return {
      status: "estimated", value, window: w, population: "external_customers",
      methodology:
        "A lower bound. Wallet identity has only been recorded since " +
        (guard.enabledAt ? guard.enabledAt.toISOString().slice(0, 10) : "recently") +
        ", so buyers active earlier in this window are not counted, and whether " +
        "anyone came back cannot be answered yet",
      instruments: evidenceFor(["x402_payer_identity"]),
      caveat,
    };
  }
  return {
    status: "observed", value, window: w, population: "external_customers",
    instruments: evidenceFor(["x402_payer_identity"]), caveat,
  };
}

export interface TopSeller { slug: string; category: string | null; calls: number; cents: number }

/** Best sellers by revenue. Paid calls only — free-tier use is not a sale. */
export async function topSellers(w: Window, limit = 6): Promise<Measurement<TopSeller[]>> {
  const r = await rows<{ slug: string; category: string | null; calls: string; cents: string }>(sql`
    SELECT c.slug, c.category, COUNT(*)::int AS calls,
           COALESCE(SUM(t.price_cents), 0)::int AS cents
    FROM transactions t JOIN capabilities c ON c.id = t.capability_id
    WHERE t.status = 'completed' AND t.price_cents > 0
      AND t.created_at >= ${bounds(w).from} AND t.created_at <= ${bounds(w).to} AND ${externalCustomers("t")}
    GROUP BY 1, 2 ORDER BY 4 DESC LIMIT ${limit}`);
  if (r.length === 0) {
    return { status: "unavailable", population: "external_customers", requestedWindow: w,
             reason: { kind: "no_data" } };
  }
  return {
    status: "observed",
    value: r.map((x) => ({
      slug: x.slug, category: x.category,
      calls: Number(x.calls), cents: Number(x.cents),
    })),
    window: w, population: "external_customers",
    instruments: evidenceFor(["transaction_revenue"]),
  };
}

export interface PlatformHealth { breakersOpen: number; active: number; withheldFromCatalog: number }

/** Operational state. A point-in-time reading, so its window is "now". */
/**
 * WP8: named for what it MEASURES.
 *
 * It read `lifecycle_state = 'quarantined'`, and that value does not exist —
 * the states in production are active, deactivated, degraded, probation and
 * validating. The quality floor quarantines by clearing `visible` and
 * `x402_enabled` (jobs/quality-floor.ts), so this gauge reported 0 no matter
 * how many capabilities the armed floor had quarantined.
 *
 * It was renamed rather than left as `quarantined`, because it counts WITHHELD
 * FROM THE CATALOGUE — nine rows today, of which
 * only one (page-speed-test) is a floor quarantine; the rest are pre-launch
 * capabilities hidden by the onboarding pipeline. That conflation is deliberate
 * and disclosed rather than silently precise-looking: both groups are "not
 * currently offered", which is what an operator reading this number wants to
 * know. A quarantine-only count needs health_monitor_events minus subsequent
 * promotions, which is a different measurement and belongs with the floor.
 */
export async function platformHealth(): Promise<Measurement<PlatformHealth>> {
  const r = await rows<{ breakers: string; active: string; withheld_from_catalog: string }>(sql`
    SELECT (SELECT COUNT(*)::int FROM capability_health WHERE state <> 'closed') AS breakers,
           (SELECT COUNT(*)::int FROM capabilities WHERE is_active) AS active,
           (SELECT COUNT(*)::int FROM capabilities
             WHERE is_active AND NOT visible) AS withheld_from_catalog`);
  const now = new Date();
  return {
    status: "observed",
    value: {
      breakersOpen: Number(r[0]?.breakers ?? 0),
      active: Number(r[0]?.active ?? 0),
      withheldFromCatalog: Number(r[0]?.withheld_from_catalog ?? 0),
    },
    window: { from: now, to: now, label: "right now" },
    population: "all_transactions", instruments: [],
  };
}

/**
 * External spend. Returns `estimated`, never `observed` — there is no invoice
 * feed, so this is derived from each suite's declared cost times its runs plus
 * a standard settlement fee. The contract makes that visible to every consumer
 * instead of relying on a footnote nobody reads.
 */
export async function externalSpend(
  w: Window,
): Promise<Measurement<{ harnessCents: number; settlementCents: number; totalCents: number }>> {
  const r = await rows<{ harness: string; settlements: string }>(sql`
    SELECT
      (SELECT COALESCE(SUM(ts.external_cost_cents), 0)::int
         FROM test_results tr JOIN test_suites ts ON ts.id = tr.test_suite_id
        WHERE tr.executed_at >= ${bounds(w).from} AND tr.executed_at <= ${bounds(w).to}) AS harness,
      (SELECT COUNT(*)::int FROM transactions
        WHERE x402_settlement_id IS NOT NULL
          AND created_at >= ${bounds(w).from} AND created_at <= ${bounds(w).to}) AS settlements`);
  const harnessCents = Number(r[0]?.harness ?? 0);
  // $0.001 per settlement past the free tier, converted at a fixed rate. Both
  // are approximations and that is why this measurement is never "observed".
  const settlementCents = Math.round((Number(r[0]?.settlements ?? 0) * 0.001 / 1.09) * 100);
  return {
    status: "estimated",
    value: { harnessCents, settlementCents, totalCents: harnessCents + settlementCents },
    window: w, population: "all_transactions",
    methodology: "Estimated from each test's known cost and the standard payment fee, not from invoices",
    instruments: [],
    caveat: "Worth checking against the real bills once a month.",
  };
}
