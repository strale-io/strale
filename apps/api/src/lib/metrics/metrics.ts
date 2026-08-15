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

export function windowOf(days: number, label?: string): Window {
  const to = new Date();
  return { from: new Date(to.getTime() - days * 86_400_000), to, label: label ?? `last ${days} days` };
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
    WHERE t.status = 'completed' AND t.created_at >= ${w.from} AND t.created_at <= ${w.to}
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
      AND t.created_at >= ${w.from} AND t.created_at <= ${w.to} AND ${externalCustomers("t")}
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
    WHERE dh.created_at >= ${from} AND dh.created_at <= ${w.to} AND dh.endpoint LIKE '/mcp:%'
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
    WHERE dh.endpoint = '/mcp:initialize' AND dh.created_at >= ${from}
      AND dh.created_at <= ${w.to} AND ${isAutomatedTooling("dh")}`);
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
    FROM transactions t WHERE t.created_at >= ${w.from} AND t.created_at <= ${w.to}
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
