/**
 * Weekly Digest Formatter — HM-2 (v2: design-system templates)
 *
 * Converts DigestData into a trust-safe, professionally designed HTML email.
 * Uses shared components from email-templates.ts.
 *
 * Trust-safe rules:
 * - Every data section includes a source attribution
 * - No week-over-week claims unless comparison data exists
 * - No trend claims without baseline
 * - Point-in-time data is labeled as such
 */

import type {
  DigestData,
  Tier3Proposal,
  Tier2Action,
  QualificationEntry,
  DemandSignal,
} from "./digest-compiler.js";
import {
  emailWrapper,
  COLORS,
  metricGrid,
  sectionHeader,
  sourceAttribution,
  statusBadge,
  checkItem,
  numberedStep,
  codeBlock,
  probeDataTable,
  eventLogTable,
  infrastructureTable,
  sqsGradeBadge,
} from "./email-templates.js";

// ─── Main entry ───────────────────────────────────────────────────────────────

export function formatDigestEmail(data: DigestData): { html: string; subject: string } {
  const actionCount = data.tier3Proposals.length;
  const weekLabel = formatDateRange(data.weekOf);

  const subject = actionCount > 0
    ? `Strale Weekly Report — ${actionCount} item${actionCount === 1 ? "" : "s"} need${actionCount === 1 ? "s" : ""} attention`
    : `Strale Weekly Report — Week of ${weekLabel}`;

  const html = buildHtml(data, weekLabel);
  return { html, subject };
}

// ─── HTML structure ──────────────────────────────────────────────────────────

function buildHtml(data: DigestData, weekLabel: string): string {
  const sections = [
    // Action items FIRST (the reason someone opens the email)
    data.tier3Proposals.length > 0 ? sectionActionItems(data.tier3Proposals) : null,

    // Capability status
    sectionCapabilityStatus(data),

    // SQS distribution
    sectionSqsDistribution(data),

    // Test activity
    sectionTestActivity(data),

    // Automated actions
    sectionAutomatedActions(data),

    // Infrastructure
    sectionInfrastructure(data),

    // Qualification progress
    data.qualification.length > 0 ? sectionQualification(data.qualification) : null,

    // Demand signals
    sectionDemandSignals(data.demandSignals),
  ].filter(Boolean).join("\n");

  return emailWrapper(
    COLORS.digest,
    "&#128202;",
    "WEEKLY PLATFORM REPORT",
    `Week of ${weekLabel}`,
    sections,
  );
}

// ─── 1. Action Items ────────────────────────────────────────────────────────

function sectionActionItems(proposals: Tier3Proposal[]): string {
  const items = proposals.map((p) => {
    const diffHtml = p.details.diff
      ? codeBlock(String(p.details.diff))
      : "";

    return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:10px;">
<tr><td style="padding:14px 16px;background:${COLORS.bgWarning};border-left:3px solid ${COLORS.warning};border-radius:0 6px 6px 0;">
  <p style="margin:0;font-size:13px;font-weight:700;color:${COLORS.textWarning};">[${p.number}] ${esc(p.capabilitySlug)}</p>
  <p style="margin:4px 0 0;font-size:13px;color:${COLORS.textPrimary};line-height:1.5;">${esc(p.proposal)}</p>
  ${diffHtml}
  <p style="margin:8px 0 0;font-size:12px;color:${COLORS.textSecondary};">Proposed: ${formatDateTime(p.proposedAt)}</p>
  <p style="margin:6px 0 0;font-size:12px;">
    <span style="background:${COLORS.bgSuccess};padding:2px 8px;border-radius:3px;color:${COLORS.textSuccess};font-weight:700;">Reply APPROVE-${p.number}</span>
    &nbsp;or&nbsp;
    <span style="background:${COLORS.bgDanger};padding:2px 8px;border-radius:3px;color:${COLORS.textDanger};font-weight:700;">Reply REJECT-${p.number}</span>
  </p>
  <p style="margin:4px 0 0;font-size:10px;color:${COLORS.textTertiary};">Source: health_monitor_events (proposal_created, pending approval)</p>
</td></tr>
</table>`;
  }).join("\n");

  return sectionHeader("ACTION ITEMS — NEED YOUR RESPONSE") + items;
}

// ─── 2. Capability Status ───────────────────────────────────────────────────

function sectionCapabilityStatus(data: DigestData): string {
  const s = data.snapshot;

  return sectionHeader("CAPABILITY STATUS") +
    metricGrid([
      { label: "Active", value: String(s.active) },
      { label: "Degraded", value: String(s.degraded) },
      { label: "Validating", value: String(s.validating + s.probation), subtitle: `${s.probation} in probation` },
      { label: "Draft", value: String(s.draft) },
    ]) +
    sourceAttribution("Source: capabilities table (lifecycle_state column), queried at digest time.");
}

// ─── 3. SQS Distribution ───────────────────────────────────────────────────

function sectionSqsDistribution(data: DigestData): string {
  const d = data.sqsDist;
  const total = d.excellent + d.good + d.fair + d.poor + d.degraded + d.pending;

  if (total === 0) {
    return sectionHeader("TRUST SCORE DISTRIBUTION") +
      `<p style="margin:0;font-size:13px;color:${COLORS.textSecondary};font-style:italic;">No active capabilities with SQS scores.</p>` +
      sourceAttribution("Source: capabilities table (matrix_sqs column).");
  }

  // Stacked bar as a table row with colored cells
  const segments: Array<{ label: string; count: number; bg: string; text: string }> = [
    { label: "A", count: d.excellent, bg: "#16a34a", text: "#ffffff" },
    { label: "B", count: d.good, bg: "#65a30d", text: "#ffffff" },
    { label: "C", count: d.fair, bg: "#d97706", text: "#ffffff" },
    { label: "D", count: d.poor, bg: "#ea580c", text: "#ffffff" },
    { label: "E", count: d.degraded, bg: "#dc2626", text: "#ffffff" },
  ].filter((s) => s.count > 0);

  const barCells = segments.map((s) => {
    const widthPct = Math.max(Math.round((s.count / total) * 100), 8);
    return `<td style="width:${widthPct}%;background:${s.bg};text-align:center;padding:8px 2px;color:${s.text};font-size:12px;font-weight:700;">${s.label}: ${s.count}</td>`;
  }).join("\n");

  const pendingNote = d.pending > 0
    ? `<p style="margin:4px 0 0;font-size:11px;color:${COLORS.textTertiary};">${d.pending} capabilities pending (no score yet)</p>`
    : "";

  return sectionHeader("TRUST SCORE DISTRIBUTION") +
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:6px;overflow:hidden;margin-bottom:4px;">
<tr>${barCells}</tr>
</table>` +
    pendingNote +
    sourceAttribution("Source: capabilities table (matrix_sqs column). Grades: A >= 90, B >= 75, C >= 50, D >= 25, E < 25.");
}

// ─── 4. Test Activity ───────────────────────────────────────────────────────

function sectionTestActivity(data: DigestData): string {
  const infra = data.infra;
  const passRate = infra.passRateThisWeek.toFixed(1);
  const totalRuns = infra.testRunsThisWeek;
  const costEur = (infra.estimatedCostCents / 100).toFixed(2);

  // Compute passed/failed from pass rate and total
  const passedRuns = Math.round(totalRuns * (infra.passRateThisWeek / 100));
  const failedRuns = totalRuns - passedRuns;

  return sectionHeader("TEST ACTIVITY (LAST 7 DAYS)") +
    metricGrid([
      { label: "Total runs", value: totalRuns.toLocaleString() },
      { label: "Pass rate", value: `${passRate}%`, subtitle: `${passedRuns.toLocaleString()} passed` },
      { label: "Failures", value: String(failedRuns), subtitle: `€${costEur} estimated cost` },
    ]) +
    sourceAttribution("Source: test_results table, last 7 days. Pass rate = passed / total (skipped tests are excluded from the count).");
}

// ─── 5. Automated Actions ───────────────────────────────────────────────────

function sectionAutomatedActions(data: DigestData): string {
  const t = data.tier1Summary;
  const totalActions = Object.values(t.byEventType).reduce((s, n) => s + n, 0);

  // Also include Tier 2 actions
  const tier2 = data.tier2Actions;

  if (totalActions === 0 && tier2.length === 0) {
    return sectionHeader("AUTOMATED ACTIONS THIS WEEK") +
      `<p style="margin:0;font-size:13px;color:${COLORS.textSecondary};font-style:italic;">No automated actions recorded this week.</p>` +
      sourceAttribution("Source: health_monitor_events table, last 7 days.");
  }

  const events: Array<{ time: string; event: string; badge?: string }> = [];

  // Tier 2 actions (human-visible, more important)
  for (const a of tier2) {
    events.push({
      time: formatTime(a.occurredAt),
      event: `${a.capabilitySlug ? `${a.capabilitySlug}: ` : ""}${a.actionTaken}`,
      badge: statusBadge("warning", "Tier 2"),
    });
  }

  // Tier 1 summary lines
  if (t.staleDateFixes.length > 0) {
    events.push({
      time: "",
      event: `${t.staleDateFixes.length} stale date input${t.staleDateFixes.length === 1 ? "" : "s"} auto-updated`,
      badge: statusBadge("auto"),
    });
  }
  if (t.deadUrlFixes.length > 0) {
    events.push({
      time: "",
      event: `${t.deadUrlFixes.length} dead URL${t.deadUrlFixes.length === 1 ? "" : "s"} replaced in test fixtures`,
      badge: statusBadge("auto"),
    });
  }
  if (t.fieldRenameFixes.length > 0) {
    events.push({
      time: "",
      event: `${t.fieldRenameFixes.length} field rename${t.fieldRenameFixes.length === 1 ? "" : "s"} auto-fixed`,
      badge: statusBadge("auto"),
    });
  }
  if (t.circuitBreakerTrips.length > 0) {
    events.push({
      time: "",
      event: `${t.circuitBreakerTrips.length} circuit breaker${t.circuitBreakerTrips.length === 1 ? "" : "s"} tripped`,
      badge: statusBadge("warning", "CB"),
    });
  }
  if (t.upstreamExclusions > 0) {
    events.push({
      time: "",
      event: `${t.upstreamExclusions} upstream transient failure${t.upstreamExclusions === 1 ? "" : "s"} excluded from SQS`,
      badge: statusBadge("upstream"),
    });
  }
  if (t.byEventType["lifecycle_transition"]) {
    const count = t.byEventType["lifecycle_transition"];
    events.push({
      time: "",
      event: `${count} lifecycle transition${count === 1 ? "" : "s"}`,
      badge: statusBadge("info"),
    });
  }

  // Other event types
  for (const [type, count] of Object.entries(t.byEventType)) {
    if (["auto_fix", "circuit_breaker", "sqs_exclusion", "lifecycle_transition", "auto_remediation", "classification", "interrupt_sent", "proposal_created"].includes(type)) continue;
    events.push({
      time: "",
      event: `${count} ${type.replace(/_/g, " ")} event${count === 1 ? "" : "s"}`,
    });
  }

  return sectionHeader("AUTOMATED ACTIONS THIS WEEK") +
    eventLogTable(events) +
    sourceAttribution("Source: health_monitor_events table, last 7 days.");
}

// ─── 6. Infrastructure ──────────────────────────────────────────────────────

function sectionInfrastructure(data: DigestData): string {
  const services = data.infra.services;
  const deps = Object.entries(services).map(([name, r]) => ({
    name,
    healthy: r.healthy,
    latency_ms: r.latencyMs,
    error: r.error,
  }));

  return sectionHeader("INFRASTRUCTURE STATUS") +
    infrastructureTable(deps) +
    sourceAttribution(`Source: runDependencyHealthChecks() executed at digest compile time (${formatDateTime(data.generatedAt)}). This is a point-in-time snapshot.`);
}

// ─── 7. Qualification Progress ──────────────────────────────────────────────

function sectionQualification(entries: QualificationEntry[]): string {
  const rows = entries.map((e) => {
    const sqsText = e.currentSqs !== null ? `SQS ${Math.round(e.currentSqs)}` : "no score yet";
    return {
      label: e.slug,
      value: `${e.runsCompleted}/5 runs · ${sqsText} · ${statusBadge(e.state === "probation" ? "info" : "warning", e.state)}`,
    };
  });

  return sectionHeader("QUALIFICATION PROGRESS") +
    probeDataTable(rows.map((r) => ({ label: r.label, value: { badge: r.value } }))) +
    sourceAttribution("Source: capabilities table (lifecycle_state in probation/validating), test_results count.");
}

// ─── 8. Demand Signals ──────────────────────────────────────────────────────

function sectionDemandSignals(signals: DemandSignal[]): string {
  if (signals.length === 0) {
    return sectionHeader("UNMATCHED CAPABILITY REQUESTS") +
      `<p style="margin:0;font-size:13px;color:${COLORS.textSecondary};font-style:italic;">No unmatched requests recorded in the failed_requests table this week.</p>` +
      sourceAttribution("Source: failed_requests table, last 7 days.");
  }

  const rows = signals.slice(0, 10).map((s) => ({
    label: `"${s.task}"`,
    value: `${s.count}x${s.category ? ` [${s.category}]` : ""}`,
  }));

  return sectionHeader("UNMATCHED CAPABILITY REQUESTS") +
    probeDataTable(rows) +
    sourceAttribution("Source: failed_requests table, last 7 days. Shows top requests by count.");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateRange(weekOfIso: string): string {
  try {
    const start = new Date(weekOfIso);
    const end = new Date(start.getTime() + 6 * 24 * 3600_000);
    const startStr = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const endStr = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `${startStr} – ${endStr}`;
  } catch {
    return weekOfIso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm",
    }) + " CET";
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm",
    });
  } catch {
    return iso;
  }
}
