/**
 * Weekly Digest Compiler — HM-2
 *
 * Queries health_monitor_events and other data sources to compile
 * the full DigestData structure for the Monday 08:00 CET email.
 */

import { eq, and, gte, lt, desc, sql, inArray, notInArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  capabilities,
  healthMonitorEvents,
  failedRequests,
  testResults,
  testSuites,
} from "../db/schema.js";
import { runDependencyHealthChecks } from "./dependency-health.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DigestCapabilitySnapshot {
  active: number;
  degraded: number;
  suspended: number;
  probation: number;
  validating: number;
  draft: number;
  total: number;
}

export interface SqsDistribution {
  excellent: number; // ≥ 90
  good: number;      // 75–89
  fair: number;      // 50–74
  poor: number;      // 25–49
  degraded: number;  // < 25
  pending: number;   // null / no score
}

export interface WeekOverWeek {
  activeChange: number;
  degradedChange: number;
  suspendedChange: number;
  newInProbation: number;
}

export interface Tier3Proposal {
  number: number;
  capabilitySlug: string;
  eventId: string;
  proposal: string;
  details: Record<string, unknown>;
  proposedAt: string;
}

export interface Tier2Action {
  capabilitySlug: string | null;
  eventType: string;
  actionTaken: string;
  occurredAt: string;
}

export interface Tier1Summary {
  byEventType: Record<string, number>;
  staleDateFixes: string[];
  deadUrlFixes: string[];
  fieldRenameFixes: string[];
  circuitBreakerTrips: string[];
  upstreamExclusions: number;
}

export interface QualificationEntry {
  slug: string;
  name: string;
  state: "probation" | "validating";
  runsCompleted: number;
  currentSqs: number | null;
  trend: string | null;
}

export interface DemandSignal {
  task: string;
  count: number;
  category: string | null;
}

export interface InfraHealth {
  services: Record<string, { healthy: boolean; latencyMs: number; error?: string }>;
  testRunsThisWeek: number;
  passRateThisWeek: number;
  estimatedCostCents: number;
}

export interface DigestData {
  weekOf: string;       // ISO date string
  generatedAt: string;
  snapshot: DigestCapabilitySnapshot;
  sqsDist: SqsDistribution;
  weekOverWeek: WeekOverWeek;
  tier3Proposals: Tier3Proposal[];
  tier2Actions: Tier2Action[];
  tier1Summary: Tier1Summary;
  qualification: QualificationEntry[];
  demandSignals: DemandSignal[];
  infra: InfraHealth;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function compileWeeklyDigest(): Promise<DigestData> {
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600_000);

  const [
    snapshot,
    sqsDist,
    weekOverWeek,
    tier3Proposals,
    tier2Actions,
    tier1Summary,
    qualification,
    demandSignals,
    infra,
  ] = await Promise.all([
    buildSnapshot(db),
    buildSqsDistribution(db),
    buildWeekOverWeek(db, weekAgo, twoWeeksAgo),
    buildTier3Proposals(db),
    buildTier2Actions(db, weekAgo),
    buildTier1Summary(db, weekAgo),
    buildQualification(db),
    buildDemandSignals(db, weekAgo),
    buildInfra(db, weekAgo),
  ]);

  // Determine start of week (Monday)
  const weekOfDate = new Date(now);
  const dayOfWeek = weekOfDate.getDay(); // 0=Sun, 1=Mon...
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekOfDate.setDate(weekOfDate.getDate() + daysToMonday);

  return {
    weekOf: weekOfDate.toISOString().split("T")[0],
    generatedAt: now.toISOString(),
    snapshot,
    sqsDist,
    weekOverWeek,
    tier3Proposals,
    tier2Actions,
    tier1Summary,
    qualification,
    demandSignals,
    infra,
  };
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

async function buildSnapshot(db: ReturnType<typeof getDb>): Promise<DigestCapabilitySnapshot> {
  const rows = await db
    .select({
      lifecycleState: capabilities.lifecycleState,
      count: sql<string>`COUNT(*)`,
    })
    .from(capabilities)
    .where(eq(capabilities.isActive, true))
    .groupBy(capabilities.lifecycleState);

  const snapshot: DigestCapabilitySnapshot = {
    active: 0, degraded: 0, suspended: 0,
    probation: 0, validating: 0, draft: 0, total: 0,
  };

  for (const row of rows) {
    const count = Number(row.count);
    snapshot.total += count;
    switch (row.lifecycleState) {
      case "active":     snapshot.active += count; break;
      case "degraded":   snapshot.degraded += count; break;
      case "suspended":  snapshot.suspended += count; break;
      case "probation":  snapshot.probation += count; break;
      case "validating": snapshot.validating += count; break;
      case "draft":      snapshot.draft += count; break;
    }
  }

  return snapshot;
}

// ─── SQS Distribution ────────────────────────────────────────────────────────

async function buildSqsDistribution(db: ReturnType<typeof getDb>): Promise<SqsDistribution> {
  const rows = await db
    .select({ matrixSqs: capabilities.matrixSqs })
    .from(capabilities)
    .where(and(
      eq(capabilities.isActive, true),
      eq(capabilities.lifecycleState, "active"),
    ));

  const dist: SqsDistribution = { excellent: 0, good: 0, fair: 0, poor: 0, degraded: 0, pending: 0 };

  for (const row of rows) {
    if (row.matrixSqs === null) { dist.pending++; continue; }
    const s = Number(row.matrixSqs);
    if (s >= 90) dist.excellent++;
    else if (s >= 75) dist.good++;
    else if (s >= 50) dist.fair++;
    else if (s >= 25) dist.poor++;
    else dist.degraded++;
  }

  return dist;
}

// ─── Week-over-week ──────────────────────────────────────────────────────────

async function buildWeekOverWeek(
  db: ReturnType<typeof getDb>,
  weekAgo: Date,
  twoWeeksAgo: Date,
): Promise<WeekOverWeek> {
  // Count lifecycle_transition events in each window to estimate changes.
  // We look at transitions into 'active', 'degraded', 'suspended', 'probation'.

  const recentTransitions = await db.execute(sql`
    SELECT
      details->>'to' AS to_state,
      COUNT(*) AS cnt
    FROM health_monitor_events
    WHERE event_type = 'lifecycle_transition'
      AND created_at >= ${weekAgo.toISOString()}::timestamptz
    GROUP BY details->>'to'
  `);

  const prevTransitions = await db.execute(sql`
    SELECT
      details->>'to' AS to_state,
      COUNT(*) AS cnt
    FROM health_monitor_events
    WHERE event_type = 'lifecycle_transition'
      AND created_at >= ${twoWeeksAgo.toISOString()}::timestamptz
      AND created_at < ${weekAgo.toISOString()}::timestamptz
    GROUP BY details->>'to'
  `);

  function countByState(rows: any[], state: string): number {
    const r = rows.find((r: any) => r.to_state === state);
    return r ? Number(r.cnt) : 0;
  }

  const recentRows = (Array.isArray(recentTransitions) ? recentTransitions : (recentTransitions as any)?.rows ?? []) as any[];
  const prevRows = (Array.isArray(prevTransitions) ? prevTransitions : (prevTransitions as any)?.rows ?? []) as any[];

  return {
    activeChange: countByState(recentRows, "active") - countByState(prevRows, "active"),
    degradedChange: countByState(recentRows, "degraded") - countByState(prevRows, "degraded"),
    suspendedChange: countByState(recentRows, "suspended") - countByState(prevRows, "suspended"),
    newInProbation: countByState(recentRows, "probation"),
  };
}

// ─── Tier 3 Proposals ────────────────────────────────────────────────────────

async function buildTier3Proposals(db: ReturnType<typeof getDb>): Promise<Tier3Proposal[]> {
  // Find proposal_created events that have no corresponding approval/rejection
  const allProposals = await db
    .select()
    .from(healthMonitorEvents)
    .where(eq(healthMonitorEvents.eventType, "proposal_created"))
    .orderBy(healthMonitorEvents.createdAt);

  if (allProposals.length === 0) return [];

  const proposalIds = allProposals.map((p) => p.id);

  // Find resolved proposals (approved or rejected referencing the proposal id)
  const resolved = await db.execute(sql`
    SELECT details->>'proposal_id' AS proposal_id
    FROM health_monitor_events
    WHERE event_type IN ('proposal_approved', 'proposal_rejected')
      AND details->>'proposal_id' = ANY(${proposalIds})
  `);
  const resolvedRows = (Array.isArray(resolved) ? resolved : (resolved as any)?.rows ?? []) as any[];
  const resolvedIds = new Set(resolvedRows.map((r: any) => r.proposal_id));

  const pending = allProposals.filter((p) => !resolvedIds.has(p.id));

  return pending.map((p, idx) => ({
    number: idx + 1,
    capabilitySlug: p.capabilitySlug ?? "platform",
    eventId: p.id,
    proposal: p.actionTaken,
    details: (p.details as Record<string, unknown>) ?? {},
    proposedAt: new Date(p.createdAt).toISOString(),
  }));
}

// ─── Tier 2 Actions ──────────────────────────────────────────────────────────

async function buildTier2Actions(db: ReturnType<typeof getDb>, since: Date): Promise<Tier2Action[]> {
  const rows = await db
    .select()
    .from(healthMonitorEvents)
    .where(and(
      eq(healthMonitorEvents.tier, 2),
      gte(healthMonitorEvents.createdAt, since),
    ))
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(50);

  return rows.map((r) => ({
    capabilitySlug: r.capabilitySlug,
    eventType: r.eventType,
    actionTaken: r.actionTaken,
    occurredAt: new Date(r.createdAt).toISOString(),
  }));
}

// ─── Tier 1 Summary ──────────────────────────────────────────────────────────

async function buildTier1Summary(db: ReturnType<typeof getDb>, since: Date): Promise<Tier1Summary> {
  const rows = await db
    .select()
    .from(healthMonitorEvents)
    .where(and(
      eq(healthMonitorEvents.tier, 1),
      gte(healthMonitorEvents.createdAt, since),
    ))
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(500);

  const byEventType: Record<string, number> = {};
  const staleDateFixes: string[] = [];
  const deadUrlFixes: string[] = [];
  const fieldRenameFixes: string[] = [];
  const circuitBreakerTrips: string[] = [];
  let upstreamExclusions = 0;

  for (const row of rows) {
    byEventType[row.eventType] = (byEventType[row.eventType] ?? 0) + 1;

    const d = (row.details as Record<string, unknown>) ?? {};
    const slug = row.capabilitySlug ?? "";

    switch (row.eventType) {
      case "auto_fix": {
        const rule = String(d.rule ?? "");
        if (rule === "stale_date" && slug) staleDateFixes.push(slug);
        else if (rule === "dead_url" && slug) deadUrlFixes.push(slug);
        else if (rule === "field_rename" && slug) fieldRenameFixes.push(slug);
        break;
      }
      case "circuit_breaker": {
        const state = String(d.state ?? "");
        if (state === "open" && slug) circuitBreakerTrips.push(slug);
        break;
      }
      case "sqs_exclusion": {
        const verdict = String(d.verdict ?? "");
        if (verdict === "upstream_transient") upstreamExclusions++;
        break;
      }
    }
  }

  return {
    byEventType,
    staleDateFixes: [...new Set(staleDateFixes)],
    deadUrlFixes: [...new Set(deadUrlFixes)],
    fieldRenameFixes: [...new Set(fieldRenameFixes)],
    circuitBreakerTrips: [...new Set(circuitBreakerTrips)],
    upstreamExclusions,
  };
}

// ─── Qualification Progress ───────────────────────────────────────────────────

async function buildQualification(db: ReturnType<typeof getDb>): Promise<QualificationEntry[]> {
  const caps = await db
    .select({
      slug: capabilities.slug,
      name: capabilities.name,
      lifecycleState: capabilities.lifecycleState,
      matrixSqs: capabilities.matrixSqs,
    })
    .from(capabilities)
    .where(and(
      eq(capabilities.isActive, true),
      inArray(capabilities.lifecycleState, ["probation", "validating"]),
    ))
    .orderBy(capabilities.slug);

  if (caps.length === 0) return [];

  const entries: QualificationEntry[] = [];

  for (const cap of caps) {
    // Count qualifying test runs (known_answer + schema_check, passed)
    const runCountResult = await db.execute(sql`
      SELECT COUNT(DISTINCT tr.id) AS run_count
      FROM test_results tr
      INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
      WHERE tr.capability_slug = ${cap.slug}
        AND ts.test_type IN ('known_answer', 'schema_check')
        AND ts.active = true
    `);
    const runRows = (Array.isArray(runCountResult) ? runCountResult : (runCountResult as any)?.rows ?? []) as any[];
    const runsCompleted = Number(runRows[0]?.run_count ?? 0);

    entries.push({
      slug: cap.slug,
      name: cap.name,
      state: cap.lifecycleState as "probation" | "validating",
      runsCompleted,
      currentSqs: cap.matrixSqs !== null ? Number(cap.matrixSqs) : null,
      trend: null, // trend not stored directly on capabilities; omit for now
    });
  }

  return entries;
}

// ─── Demand Signals ───────────────────────────────────────────────────────────

async function buildDemandSignals(db: ReturnType<typeof getDb>, since: Date): Promise<DemandSignal[]> {
  const rows = await db.execute(sql`
    SELECT
      task,
      category,
      COUNT(*) AS cnt
    FROM failed_requests
    WHERE created_at >= ${since.toISOString()}::timestamptz
    GROUP BY task, category
    ORDER BY cnt DESC
    LIMIT 5
  `);

  const demandRows = (Array.isArray(rows) ? rows : (rows as any)?.rows ?? []) as any[];

  return demandRows.map((r: any) => ({
    task: String(r.task),
    count: Number(r.cnt),
    category: r.category ?? null,
  }));
}

// ─── Infrastructure ───────────────────────────────────────────────────────────

async function buildInfra(db: ReturnType<typeof getDb>, since: Date): Promise<InfraHealth> {
  const [depResults, testStats] = await Promise.all([
    runDependencyHealthChecks().catch(() => ({} as Record<string, any>)),
    getTestStats(db, since),
  ]);

  const services: Record<string, { healthy: boolean; latencyMs: number; error?: string }> = {};
  for (const [name, result] of Object.entries(depResults)) {
    services[name] = {
      healthy: result.healthy,
      latencyMs: result.latency_ms,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  return { services, ...testStats };
}

async function getTestStats(db: ReturnType<typeof getDb>, since: Date) {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) AS total_runs,
      SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS passed_runs,
      SUM(ts.estimated_cost_cents) AS total_cost_cents
    FROM test_results tr
    INNER JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.executed_at >= ${since.toISOString()}::timestamptz
  `);

  const rows = (Array.isArray(result) ? result : (result as any)?.rows ?? []) as any[];
  const row = rows[0] ?? {};

  const totalRuns = Number(row.total_runs ?? 0);
  const passedRuns = Number(row.passed_runs ?? 0);
  const costCents = Number(row.total_cost_cents ?? 0);

  return {
    testRunsThisWeek: totalRuns,
    passRateThisWeek: totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 1000) / 10 : 0,
    estimatedCostCents: costCents,
  };
}
