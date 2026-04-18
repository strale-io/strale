/**
 * Situation Assessment Engine
 *
 * Correlates multiple signals before deciding something is wrong.
 * Called whenever a significant event occurs (probe failure, mass test
 * failure, circuit breaker trip). Instead of immediately alerting, it
 * gathers context and produces a structured assessment.
 *
 * Key principle: require confirmation before escalating.
 * A single probe failure is NOT an outage — it might be a transient blip.
 */

import { sql, eq, desc, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { healthMonitorEvents, testResults, capabilityHealth, capabilities } from "../db/schema.js";
import { getAllUpstreamHealth, getCapabilityUpstreams } from "./upstream-health-gate.js";
import { getBrowserlessCapabilityCount } from "./chromium-health.js";
import { getProvider } from "./dependency-manifest.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CorrelatedSignal {
  source: string;
  signal: string;
  relevance: "supporting" | "contradicting" | "context";
}

export interface SituationAssessment {
  trigger: string;
  timestamp: string;
  correlatedSignals: CorrelatedSignal[];
  rootCause: {
    category: "strale_infrastructure" | "external_service" | "strale_code" | "transient_network" | "unknown";
    confidence: "high" | "medium" | "low";
    explanation: string;
    evidence: string[];
  };
  impact: {
    severity: "critical" | "warning" | "info";
    customersAffected: boolean;
    capabilitiesAffected: number;
    affectedSlugs: string[];
    sqsImpact: "none" | "decay_only" | "active_degradation";
  };
  action: {
    type: "none_needed" | "monitor" | "investigate" | "immediate_action";
    selfResolving: boolean;
    estimatedRecoveryMinutes: number | null;
    operatorSteps: string[];
    automaticActions: string[];
  };
}

// ─── Dependency context ─────────────────────────────────────────────────────

export interface DependencyMeta {
  displayName: string;
  ownership: "strale_infrastructure" | "external_api" | "external_government" | "external_nonprofit";
  ownershipExplanation: string;
  probeInterval: string;
  statusPageUrl: string | null;
  typicalRecovery: string;
  customerImpact: string;
  checkSteps: string[];
}

export const DEPENDENCY_CONTEXT: Record<string, DependencyMeta> = {
  browserless: {
    displayName: "Browserless (Chromium)",
    ownership: "strale_infrastructure",
    ownershipExplanation: "This is Strale's own Browserless container running on Railway EU West.",
    probeInterval: "30 minutes",
    statusPageUrl: null,
    typicalRecovery: "Railway auto-restarts crashed containers within 1-2 minutes. If the issue persists, check the Railway dashboard.",
    customerImpact: "Scraping capabilities (web extraction, screenshot, etc.) will return errors. Non-scraping capabilities are unaffected.",
    checkSteps: [
      "Railway dashboard > chromium service > is it running?",
      "Railway logs for the chromium container > any OOM or crash errors?",
      "If crashed: click Restart in Railway",
    ],
  },
  anthropic: {
    displayName: "Anthropic Claude API",
    ownership: "external_api",
    ownershipExplanation: "This is the external Anthropic API service used for AI-assisted capabilities.",
    probeInterval: "6 hours",
    statusPageUrl: "https://status.anthropic.com",
    typicalRecovery: "Anthropic outages typically resolve within 30 minutes to 2 hours. Nothing you can do — wait for Anthropic.",
    customerImpact: "68 AI-assisted capabilities will return errors. Non-AI capabilities are unaffected.",
    checkSteps: [
      "Check https://status.anthropic.com",
      "If Anthropic reports an incident: wait for resolution",
      "If Anthropic reports all-clear: check ANTHROPIC_API_KEY env var on Railway",
    ],
  },
  vies: {
    displayName: "VIES (EU Commission)",
    ownership: "external_government",
    ownershipExplanation: "This is the EU Commission VAT validation service. Known for periodic maintenance and outages.",
    probeInterval: "6 hours",
    statusPageUrl: "https://ec.europa.eu/taxation_customs/vies/",
    typicalRecovery: "VIES outages can last hours to days. The EU Commission does not provide SLAs.",
    customerImpact: "VAT validation capabilities across all EU countries will return errors.",
    checkSteps: [
      "Check https://ec.europa.eu/taxation_customs/vies/",
      "If VIES is down: nothing to do — wait for EU Commission",
      "Consider: publish a status note on affected capability pages",
    ],
  },
  dilisense: {
    displayName: "Dilisense API",
    ownership: "external_api",
    ownershipExplanation: "Dilisense provides AML screening (sanctions, PEP, adverse media) via consolidated global databases.",
    probeInterval: "6 hours",
    statusPageUrl: null,
    typicalRecovery: "Check if DILISENSE_API_KEY is configured. If valid, wait for the service to recover.",
    customerImpact: "Sanctions screening, PEP check, and adverse media capabilities will fall back to Claude Haiku.",
    checkSteps: [
      "Check Railway env vars: is DILISENSE_API_KEY set?",
      "If not set: add the API key to Railway environment variables",
      "If set: the Dilisense service may be experiencing issues — capabilities will use fallback",
    ],
  },
  gleif: {
    displayName: "GLEIF (Global LEI Foundation)",
    ownership: "external_nonprofit",
    ownershipExplanation: "This is the GLEIF API for Legal Entity Identifier lookups.",
    probeInterval: "6 hours",
    statusPageUrl: null,
    typicalRecovery: "GLEIF is generally reliable. Outages are rare and typically short (<1 hour).",
    customerImpact: "LEI lookup capabilities will return errors.",
    checkSteps: [
      "Try https://api.gleif.org/api/v1/lei-records?page[size]=1 in a browser",
      "If it returns data: the issue was transient",
      "If it errors: wait for GLEIF to restore",
    ],
  },
  brreg: {
    displayName: "Bronnysund Register (Norway)",
    ownership: "external_government",
    ownershipExplanation: "This is the Norwegian business registry API.",
    probeInterval: "6 hours",
    statusPageUrl: null,
    typicalRecovery: "Norwegian government APIs are generally reliable. Maintenance windows occasionally occur.",
    customerImpact: "Norwegian company data lookup will return errors.",
    checkSteps: [
      "Try https://data.brreg.no/enhetsregisteret/api/enheter?size=1 in a browser",
      "If it returns data: the issue was transient",
      "If it errors: wait for the Norwegian government to restore",
    ],
  },
};

// ─── Helper: query recent probe history ─────────────────────────────────────

async function getRecentProbes(dependency: string, hours: number): Promise<Array<{ healthy: boolean; createdAt: Date }>> {
  const db = getDb();
  const cutoff = new Date(Date.now() - hours * 3600_000);
  const rows = await db
    .select({ details: healthMonitorEvents.details, createdAt: healthMonitorEvents.createdAt })
    .from(healthMonitorEvents)
    .where(and(
      eq(healthMonitorEvents.eventType, "dependency_probe"),
      sql`${healthMonitorEvents.details}->>'dependency' = ${dependency}`,
      sql`${healthMonitorEvents.createdAt} >= ${cutoff.toISOString()}::timestamptz`,
    ))
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(10);

  return rows.map((r) => ({
    healthy: (r.details as any)?.healthy === true,
    createdAt: r.createdAt,
  }));
}

async function getRecentFailuresForUpstream(dependency: string, hours: number): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - hours * 3600_000);

  // Get capabilities that depend on this upstream
  let capTypeFilter: string;
  if (dependency === "browserless") capTypeFilter = "scraping";
  else if (dependency === "anthropic") capTypeFilter = "ai_assisted";
  else return 0; // VIES/GLEIF/BRREG have too few caps to be useful as correlation signal

  const rows = await db.execute(sql`
    SELECT COUNT(*)::integer AS cnt
    FROM test_results tr
    JOIN capabilities c ON c.slug = tr.capability_slug
    WHERE c.capability_type = ${capTypeFilter}
      AND tr.passed = false
      AND tr.executed_at >= ${cutoff.toISOString()}::timestamptz
  `);
  return ((Array.isArray(rows) ? rows : (rows as any)?.rows ?? [])[0] as any)?.cnt ?? 0;
}

async function getRecentCustomerFailures(dependency: string, minutes: number): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - minutes * 60_000);

  let capTypeFilter: string;
  if (dependency === "browserless") capTypeFilter = "scraping";
  else if (dependency === "anthropic") capTypeFilter = "ai_assisted";
  else return 0;

  // Check piggyback (customer traffic) failures
  const rows = await db.execute(sql`
    SELECT COUNT(*)::integer AS cnt
    FROM test_results tr
    JOIN test_suites ts ON ts.id = tr.test_suite_id
    JOIN capabilities c ON c.slug = tr.capability_slug
    WHERE ts.test_type = 'piggyback'
      AND c.capability_type = ${capTypeFilter}
      AND tr.passed = false
      AND tr.executed_at >= ${cutoff.toISOString()}::timestamptz
  `);
  return ((Array.isArray(rows) ? rows : (rows as any)?.rows ?? [])[0] as any)?.cnt ?? 0;
}

async function getSimultaneousProbeFailures(): Promise<string[]> {
  const health = getAllUpstreamHealth();
  return Object.entries(health).filter(([, h]) => !h).map(([name]) => name);
}

async function getRecentRailwayEvents(hours: number): Promise<string[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - hours * 3600_000);
  const rows = await db
    .select({ actionTaken: healthMonitorEvents.actionTaken })
    .from(healthMonitorEvents)
    .where(and(
      sql`${healthMonitorEvents.eventType} IN ('infrastructure_alert', 'situation_assessment')`,
      sql`${healthMonitorEvents.createdAt} >= ${cutoff.toISOString()}::timestamptz`,
    ))
    .orderBy(desc(healthMonitorEvents.createdAt))
    .limit(5);
  return rows.map((r) => r.actionTaken);
}

function getAffectedCapabilityCount(dependency: string): number {
  // browserless is special-cased — its capability list is derived dynamically
  // from caps using Browserless-backed executors, not the manifest.
  if (dependency === "browserless") return getBrowserlessCapabilityCount();
  // anthropic likewise — used by every ai_assisted capability, tracked
  // separately from the manifest's explicit list.
  if (dependency === "anthropic") return 68;
  // Every other provider: read from the dependency manifest directly.
  // Hardcoding counts here historically caused alerts to report "0
  // capabilities affected" whenever a new provider was added.
  const provider = getProvider(dependency);
  return provider?.capabilities.length ?? 0;
}

// ─── Assessment functions ───────────────────────────────────────────────────

export async function assessDependencyProbeFailure(
  dependency: string,
  probeResult: { healthy: boolean; latency_ms: number; error?: string },
): Promise<SituationAssessment> {
  const meta = DEPENDENCY_CONTEXT[dependency];
  const signals: CorrelatedSignal[] = [];
  const evidence: string[] = [];
  const now = new Date();

  // 1. Probe history — was the previous probe healthy?
  const recentProbes = await getRecentProbes(dependency, 2);
  const previousProbe = recentProbes.length > 1 ? recentProbes[1] : null;
  const lastHealthyProbe = recentProbes.find((p) => p.healthy);
  const consecutiveFailures = recentProbes.findIndex((p) => p.healthy);
  const failCount = consecutiveFailures === -1 ? recentProbes.length : consecutiveFailures;

  if (previousProbe?.healthy) {
    signals.push({
      source: "probe_history",
      signal: `Previous probe was healthy (${Math.round((now.getTime() - previousProbe.createdAt.getTime()) / 60_000)}min ago)`,
      relevance: "contradicting",
    });
    evidence.push("Previous probe was healthy — this may be a transient blip");
  }

  if (lastHealthyProbe && (now.getTime() - lastHealthyProbe.createdAt.getTime()) < 3600_000) {
    signals.push({
      source: "probe_history",
      signal: `Last healthy probe was ${Math.round((now.getTime() - lastHealthyProbe.createdAt.getTime()) / 60_000)}min ago`,
      relevance: "contradicting",
    });
  }

  // 2. Correlated test failures
  const testFailures = await getRecentFailuresForUpstream(dependency, 1);
  if (testFailures > 0) {
    signals.push({
      source: "test_results",
      signal: `${testFailures} test failures for ${dependency}-dependent capabilities in the last hour`,
      relevance: "supporting",
    });
    evidence.push(`${testFailures} correlated test failures confirm the issue`);
  } else {
    signals.push({
      source: "test_results",
      signal: "No correlated test failures in the last hour",
      relevance: "contradicting",
    });
  }

  // 3. Customer traffic impact
  const customerFailures = await getRecentCustomerFailures(dependency, 30);
  const customersAffected = customerFailures > 0;
  if (customersAffected) {
    signals.push({
      source: "customer_traffic",
      signal: `${customerFailures} customer call failures in the last 30 minutes`,
      relevance: "supporting",
    });
    evidence.push(`Customer traffic is failing — ${customerFailures} errors in 30 minutes`);
  }

  // 4. Simultaneous probe failures (network issue?)
  const otherFailed = await getSimultaneousProbeFailures();
  const otherFailedExcludingSelf = otherFailed.filter((d) => d !== dependency);
  if (otherFailedExcludingSelf.length > 0) {
    signals.push({
      source: "multi_dependency",
      signal: `Other dependencies also unhealthy: ${otherFailedExcludingSelf.join(", ")}`,
      relevance: "context",
    });
    evidence.push(`Multiple dependencies failing simultaneously suggests network/infrastructure issue`);
  }

  // 5. Recent platform events
  const recentEvents = await getRecentRailwayEvents(4);
  if (recentEvents.length > 0) {
    signals.push({
      source: "platform_events",
      signal: `Recent platform events: ${recentEvents[0]}`,
      relevance: "context",
    });
  }

  // ── Root cause determination ──────────────────────────────────────────
  let category: SituationAssessment["rootCause"]["category"];
  let confidence: SituationAssessment["rootCause"]["confidence"];
  let explanation: string;

  if (otherFailedExcludingSelf.length >= 2) {
    category = "transient_network";
    confidence = "medium";
    explanation = `Multiple dependencies failing simultaneously (${[dependency, ...otherFailedExcludingSelf].join(", ")}). This suggests a network or infrastructure issue rather than individual service failures.`;
  } else if (failCount <= 1 && testFailures === 0) {
    category = "transient_network";
    confidence = "low";
    explanation = `Single probe failure for ${meta?.displayName ?? dependency} with no correlated test failures. Most likely a transient network blip.`;
  } else if (meta?.ownership === "strale_infrastructure") {
    category = "strale_infrastructure";
    confidence = failCount >= 2 ? "high" : "medium";
    explanation = `${meta.displayName} is not responding. ${meta.ownershipExplanation}`;
  } else {
    category = "external_service";
    confidence = failCount >= 2 ? "high" : "medium";
    explanation = `${meta?.displayName ?? dependency} is not responding. ${meta?.ownershipExplanation ?? "External service."}`;
  }

  evidence.push(`Probe error: ${probeResult.error ?? "unknown"}`);
  evidence.push(`Consecutive failures: ${failCount}`);

  // ── Impact ────────────────────────────────────────────────────────────
  const capCount = getAffectedCapabilityCount(dependency);
  const severity: SituationAssessment["impact"]["severity"] =
    customersAffected ? "critical" : failCount >= 2 ? "warning" : "info";

  const sqsImpact: SituationAssessment["impact"]["sqsImpact"] =
    failCount >= 2 ? "active_degradation" : failCount >= 1 ? "none" : "none";

  // ── Action ────────────────────────────────────────────────────────────
  const isFirstFailure = failCount <= 1;
  const selfResolving = isFirstFailure || category === "transient_network";

  let actionType: SituationAssessment["action"]["type"];
  if (customersAffected) actionType = "immediate_action";
  else if (failCount >= 2) actionType = "investigate";
  else if (isFirstFailure && testFailures === 0) actionType = "none_needed";
  else actionType = "monitor";

  const automaticActions: string[] = [];
  if (failCount >= 1) {
    automaticActions.push(`Tests for ${capCount} ${dependency}-dependent capabilities are being skipped to prevent SQS pollution`);
  }
  if (failCount >= 2) {
    automaticActions.push("Freshness decay will gradually reduce SQS scores until testing resumes");
  }

  return {
    trigger: `${dependency}_probe_failed`,
    timestamp: now.toISOString(),
    correlatedSignals: signals,
    rootCause: { category, confidence, explanation, evidence },
    impact: {
      severity,
      customersAffected,
      capabilitiesAffected: capCount,
      affectedSlugs: [], // Too expensive to list all here
      sqsImpact,
    },
    action: {
      type: actionType,
      selfResolving,
      estimatedRecoveryMinutes: meta?.ownership === "strale_infrastructure" ? 5 : null,
      operatorSteps: actionType === "none_needed" ? [] : (meta?.checkSteps ?? []),
      automaticActions,
    },
  };
}

export async function assessMassTestFailure(
  failedSlugs: string[],
  totalTested: number,
  commonClassification: string | null,
): Promise<SituationAssessment> {
  const signals: CorrelatedSignal[] = [];
  const evidence: string[] = [];
  const now = new Date();
  const failRate = failedSlugs.length / totalTested;

  // Group by upstream dependency
  const upstreamCounts: Record<string, number> = {};
  for (const slug of failedSlugs) {
    const upstreams = getCapabilityUpstreams(slug);
    for (const u of upstreams) {
      upstreamCounts[u] = (upstreamCounts[u] ?? 0) + 1;
    }
  }
  const dominantUpstream = Object.entries(upstreamCounts).sort((a, b) => b[1] - a[1])[0];

  if (dominantUpstream && dominantUpstream[1] > failedSlugs.length * 0.5) {
    signals.push({
      source: "upstream_correlation",
      signal: `${dominantUpstream[1]}/${failedSlugs.length} failures are ${dominantUpstream[0]}-dependent`,
      relevance: "supporting",
    });
    evidence.push(`Dominant upstream: ${dominantUpstream[0]} (${dominantUpstream[1]} of ${failedSlugs.length} failures)`);
  }

  if (commonClassification) {
    signals.push({
      source: "classification",
      signal: `Common failure classification: ${commonClassification}`,
      relevance: "supporting",
    });
  }

  // Check for recent dependency probe failures
  const unhealthy = await getSimultaneousProbeFailures();
  if (unhealthy.length > 0) {
    signals.push({
      source: "dependency_probes",
      signal: `Unhealthy dependencies: ${unhealthy.join(", ")}`,
      relevance: "supporting",
    });
    evidence.push(`Dependency probe confirms: ${unhealthy.join(", ")} unhealthy`);
  }

  const category: SituationAssessment["rootCause"]["category"] =
    dominantUpstream ? "external_service" : commonClassification === "test_infrastructure" ? "strale_infrastructure" : "unknown";
  const severity: SituationAssessment["impact"]["severity"] =
    failRate > 0.3 ? "critical" : failRate > 0.1 ? "warning" : "info";

  return {
    trigger: "mass_test_failure",
    timestamp: now.toISOString(),
    correlatedSignals: signals,
    rootCause: {
      category,
      confidence: dominantUpstream ? "high" : "medium",
      explanation: dominantUpstream
        ? `${failedSlugs.length} capabilities failed, ${dominantUpstream[1]} depend on ${DEPENDENCY_CONTEXT[dominantUpstream[0]]?.displayName ?? dominantUpstream[0]}. This is likely an upstream service issue, not individual capability failures.`
        : `${failedSlugs.length} of ${totalTested} capabilities failed (${(failRate * 100).toFixed(0)}%). Classification: ${commonClassification ?? "mixed"}.`,
      evidence,
    },
    impact: {
      severity,
      customersAffected: false, // Mass test failures don't directly mean customer impact
      capabilitiesAffected: failedSlugs.length,
      affectedSlugs: failedSlugs.slice(0, 10),
      sqsImpact: failRate > 0.1 ? "active_degradation" : "decay_only",
    },
    action: {
      type: dominantUpstream ? "monitor" : "investigate",
      selfResolving: !!dominantUpstream,
      estimatedRecoveryMinutes: dominantUpstream ? 60 : null,
      operatorSteps: dominantUpstream
        ? (DEPENDENCY_CONTEXT[dominantUpstream[0]]?.checkSteps ?? [])
        : ["Check Railway logs for error patterns", "Review the common failure classification"],
      automaticActions: [
        "Affected capability tests will retry on next scheduled sweep",
        "Circuit breakers will trip after 3 consecutive failures per capability",
        "SQS scores will degrade gradually if failures persist",
      ],
    },
  };
}

export async function assessSchedulerStale(lastHeartbeat: Date | null): Promise<SituationAssessment> {
  const now = new Date();
  const hoursSince = lastHeartbeat ? (now.getTime() - lastHeartbeat.getTime()) / 3600_000 : Infinity;

  return {
    trigger: "scheduler_stale",
    timestamp: now.toISOString(),
    correlatedSignals: [],
    rootCause: {
      category: "strale_infrastructure",
      confidence: "high",
      explanation: lastHeartbeat
        ? `The test scheduler has not run in ${hoursSince.toFixed(1)} hours. Tests may not be executing.`
        : "No scheduler heartbeat has ever been recorded. The scheduler may not have started.",
      evidence: [
        lastHeartbeat ? `Last heartbeat: ${lastHeartbeat.toISOString()}` : "No heartbeat found",
      ],
    },
    impact: {
      severity: "critical",
      customersAffected: false,
      capabilitiesAffected: 0,
      affectedSlugs: [],
      sqsImpact: "decay_only",
    },
    action: {
      type: "immediate_action",
      selfResolving: false,
      estimatedRecoveryMinutes: null,
      operatorSteps: [
        "Check Railway dashboard — is the strale service running?",
        "Check Railway logs for crash errors or OOM",
        "If the service is running: restart it to re-initialize the scheduler",
        "If crashed: check recent deployments for breaking changes",
      ],
      automaticActions: [
        "Freshness decay is gradually reducing SQS scores for all capabilities",
        "This alert will re-fire on each meta-monitoring check until resolved",
      ],
    },
  };
}
