/**
 * Weekly Digest Formatter — HM-2
 *
 * Converts DigestData into a clean, mobile-friendly HTML email.
 * Inline CSS only — no external stylesheets.
 */

import type { DigestData, Tier3Proposal, Tier2Action, QualificationEntry, DemandSignal } from "./digest-compiler.js";

// ─── Main entry ───────────────────────────────────────────────────────────────

export function formatDigestEmail(data: DigestData): { html: string; subject: string } {
  const subject = `STRALE PLATFORM HEALTH — Week of ${formatDate(data.weekOf)}`;
  const html = buildHtml(data);
  return { html, subject };
}

// ─── HTML structure ──────────────────────────────────────────────────────────

function buildHtml(data: DigestData): string {
  const sections = [
    sectionHealthSnapshot(data),
    data.tier3Proposals.length > 0 ? sectionTier3Proposals(data.tier3Proposals) : null,
    data.tier2Actions.length > 0 ? sectionTier2Actions(data.tier2Actions) : null,
    sectionTier1Summary(data),
    data.qualification.length > 0 ? sectionQualification(data.qualification) : null,
    data.demandSignals.length > 0 ? sectionDemandSignals(data.demandSignals) : null,
    sectionInfra(data),
    sectionFooter(data),
  ].filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Strale Platform Health</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#0f172a;padding:24px 32px;">
    <p style="margin:0;color:#94a3b8;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">STRALE PLATFORM HEALTH</p>
    <h1 style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700;">Week of ${formatDate(data.weekOf)}</h1>
    <p style="margin:6px 0 0;color:#64748b;font-size:12px;">Generated ${formatDateTime(data.generatedAt)}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:0 32px 32px;">
    ${sections}
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Sections ────────────────────────────────────────────────────────────────

function sectionHealthSnapshot(data: DigestData): string {
  const s = data.snapshot;
  const d = data.sqsDist;
  const w = data.weekOverWeek;

  const activeSign = w.activeChange >= 0 ? "+" : "";
  const degradedSign = w.degradedChange >= 0 ? "+" : "";

  const stateCards = [
    stateCard("✅", s.active, "active", "#16a34a"),
    stateCard("⚠️", s.degraded, "degraded", "#d97706"),
    stateCard("🔴", s.suspended, "suspended", "#dc2626"),
    stateCard("🔵", s.probation, "in probation", "#2563eb"),
    s.validating > 0 ? stateCard("⏳", s.validating, "validating", "#7c3aed") : null,
    s.draft > 0 ? stateCard("📋", s.draft, "draft", "#6b7280") : null,
  ].filter(Boolean).join("\n");

  return sectionWrap("━━━ HEALTH SNAPSHOT ━━━", `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        ${stateCards}
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:13px;color:#374151;font-weight:600;">SQS Distribution (active capabilities)</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        ${sqsBar("Excellent", d.excellent, "#16a34a")}
        ${sqsBar("Good", d.good, "#65a30d")}
        ${sqsBar("Fair", d.fair, "#d97706")}
        ${sqsBar("Poor", d.poor, "#ea580c")}
        ${sqsBar("Degraded", d.degraded, "#dc2626")}
        ${d.pending > 0 ? sqsBar("Pending", d.pending, "#9ca3af") : ""}
      </tr>
    </table>

    <p style="margin:0;font-size:12px;color:#6b7280;">
      Week-over-week: ${activeSign}${w.activeChange} active · ${degradedSign}${w.degradedChange} degraded
      ${w.newInProbation > 0 ? ` · +${w.newInProbation} new in probation` : ""}
    </p>
  `);
}

function stateCard(emoji: string, count: number, label: string, color: string): string {
  return `<td style="text-align:center;padding:8px 4px;">
    <p style="margin:0;font-size:22px;">${emoji}</p>
    <p style="margin:2px 0 0;font-size:18px;font-weight:700;color:${color};">${count}</p>
    <p style="margin:0;font-size:11px;color:#6b7280;">${label}</p>
  </td>`;
}

function sqsBar(label: string, count: number, color: string): string {
  return `<td style="text-align:center;padding:4px;">
    <p style="margin:0;font-size:18px;font-weight:700;color:${color};">${count}</p>
    <p style="margin:0;font-size:10px;color:#6b7280;">${label}</p>
  </td>`;
}

function sectionTier3Proposals(proposals: Tier3Proposal[]): string {
  const items = proposals.map((p) => {
    const details = p.details;
    const diffHtml = details.diff ? `<p style="margin:4px 0 0;font-size:12px;font-family:monospace;color:#374151;background:#f8fafc;padding:6px;border-radius:4px;white-space:pre-wrap;">${escapeHtml(String(details.diff))}</p>` : "";

    return `<tr><td style="padding:12px;background:#fffbeb;border-radius:6px;margin-bottom:8px;display:block;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#92400e;">📋 [${p.number}] ${escapeHtml(p.capabilitySlug)}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#374151;">${escapeHtml(p.proposal)}</p>
      ${diffHtml}
      <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">Proposed: ${formatDateTime(p.proposedAt)}</p>
      <p style="margin:6px 0 0;font-size:12px;">
        <code style="background:#dcfce7;padding:2px 6px;border-radius:3px;color:#166534;">Reply APPROVE-${p.number}</code>
        &nbsp;or&nbsp;
        <code style="background:#fee2e2;padding:2px 6px;border-radius:3px;color:#991b1b;">Reply REJECT-${p.number}</code>
      </p>
      <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">
        curl -X POST ${baseUrl()}/v1/internal/health-monitor/proposals/${escapeHtml(p.eventId)}/approve -H "Authorization: Bearer $ADMIN_SECRET"
      </p>
    </td></tr>`;
  }).join("<tr><td style='height:8px;'></td></tr>");

  return sectionWrap("━━━ ACTIONS NEEDED (Tier 3 proposals) ━━━", `
    <table width="100%" cellpadding="0" cellspacing="0">${items}</table>
  `);
}

function sectionTier2Actions(actions: Tier2Action[]): string {
  const items = actions.map((a) => {
    const slug = a.capabilitySlug ? `<strong>${escapeHtml(a.capabilitySlug)}</strong>: ` : "";
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0;font-size:13px;color:#374151;">⚠️ ${slug}${escapeHtml(a.actionTaken)}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">${formatDateTime(a.occurredAt)}</p>
    </td></tr>`;
  }).join("");

  return sectionWrap("━━━ TIER 2 ACTIONS TAKEN THIS WEEK ━━━", `
    <table width="100%" cellpadding="0" cellspacing="0">${items}</table>
  `);
}

function sectionTier1Summary(data: DigestData): string {
  const t = data.tier1Summary;
  const totalActions = Object.values(t.byEventType).reduce((s, n) => s + n, 0);

  if (totalActions === 0) {
    return sectionWrap("━━━ TIER 1 AUTONOMOUS ACTIONS (audit trail) ━━━", `
      <p style="margin:0;font-size:13px;color:#6b7280;font-style:italic;">No autonomous actions this week.</p>
    `);
  }

  const lines: string[] = [];

  if (t.staleDateFixes.length > 0) {
    lines.push(auditLine("🔧", `${t.staleDateFixes.length} stale date input${t.staleDateFixes.length === 1 ? "" : "s"} updated`, t.staleDateFixes.slice(0, 5)));
  }
  if (t.deadUrlFixes.length > 0) {
    lines.push(auditLine("🔧", `${t.deadUrlFixes.length} dead URL${t.deadUrlFixes.length === 1 ? "" : "s"} replaced`, t.deadUrlFixes.slice(0, 5)));
  }
  if (t.fieldRenameFixes.length > 0) {
    lines.push(auditLine("🔧", `${t.fieldRenameFixes.length} field rename${t.fieldRenameFixes.length === 1 ? "" : "s"} auto-fixed`, t.fieldRenameFixes.slice(0, 5)));
  }
  if (t.circuitBreakerTrips.length > 0) {
    lines.push(auditLine("🔄", `${t.circuitBreakerTrips.length} circuit breaker trip${t.circuitBreakerTrips.length === 1 ? "" : "s"}`, t.circuitBreakerTrips.slice(0, 5)));
  }
  if (t.upstreamExclusions > 0) {
    lines.push(auditLine("🛡️", `${t.upstreamExclusions} upstream transient failure${t.upstreamExclusions === 1 ? "" : "s"} excluded from SQS`, []));
  }

  // Any other event types not specifically handled
  for (const [type, count] of Object.entries(t.byEventType)) {
    if (!["auto_fix", "circuit_breaker", "sqs_exclusion", "lifecycle_transition"].includes(type)) {
      lines.push(auditLine("ℹ️", `${count} ${type.replace(/_/g, " ")} event${count === 1 ? "" : "s"}`, []));
    }
  }

  if (t.byEventType["lifecycle_transition"]) {
    lines.push(auditLine("🔄", `${t.byEventType["lifecycle_transition"]} lifecycle transition${t.byEventType["lifecycle_transition"] === 1 ? "" : "s"}`, []));
  }

  return sectionWrap("━━━ TIER 1 AUTONOMOUS ACTIONS (audit trail) ━━━", lines.join(""));
}

function auditLine(emoji: string, text: string, slugs: string[]): string {
  const slugNote = slugs.length > 0
    ? `<p style="margin:2px 0 0;font-size:11px;color:#9ca3af;">${slugs.map(escapeHtml).join(", ")}${slugs.length === 5 ? "…" : ""}</p>`
    : "";
  return `<p style="margin:0 0 8px;font-size:13px;color:#374151;">${emoji} ${escapeHtml(text)}</p>${slugNote}`;
}

function sectionQualification(entries: QualificationEntry[]): string {
  const items = entries.map((e) => {
    const sqsText = e.currentSqs !== null ? `SQS ${e.currentSqs.toFixed(0)}` : "no score yet";
    const stateEmoji = e.state === "probation" ? "🔵" : "⏳";
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0;font-size:13px;color:#374151;">${stateEmoji} <strong>${escapeHtml(e.slug)}</strong></p>
      <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${e.runsCompleted}/5 runs · ${sqsText} · ${e.state}</p>
    </td></tr>`;
  }).join("");

  return sectionWrap("━━━ QUALIFICATION PROGRESS ━━━", `
    <table width="100%" cellpadding="0" cellspacing="0">${items}</table>
  `);
}

function sectionDemandSignals(signals: DemandSignal[]): string {
  const items = signals.map((s) => {
    const cat = s.category ? ` <span style="color:#9ca3af;">[${escapeHtml(s.category)}]</span>` : "";
    return `<p style="margin:0 0 8px;font-size:13px;color:#374151;">💡 <strong>"${escapeHtml(s.task)}"</strong> requested ${s.count}×${cat}</p>`;
  }).join("");

  return sectionWrap("━━━ DEMAND SIGNALS (from unmatched requests) ━━━", items);
}

function sectionInfra(data: DigestData): string {
  const infra = data.infra;

  const serviceLines = Object.entries(infra.services).map(([name, r]) => {
    const status = r.healthy
      ? `<span style="color:#16a34a;">healthy</span> (${r.latencyMs}ms)`
      : `<span style="color:#dc2626;">down</span>${r.error ? ` — ${escapeHtml(r.error)}` : ""}`;
    return `<span style="font-size:12px;color:#374151;">${escapeHtml(name)}: ${status}</span>`;
  });

  const passRate = infra.passRateThisWeek.toFixed(1);
  const costEur = (infra.estimatedCostCents / 100).toFixed(2);

  return sectionWrap("━━━ INFRASTRUCTURE ━━━", `
    <p style="margin:0 0 8px;">${serviceLines.join(" &nbsp;|&nbsp; ")}</p>
    <p style="margin:0;font-size:12px;color:#6b7280;">
      Test budget this week: €${costEur} &nbsp;·&nbsp;
      Total runs: ${infra.testRunsThisWeek.toLocaleString()} &nbsp;·&nbsp;
      Pass rate: ${passRate}%
    </p>
  `);
}

function sectionFooter(data: DigestData): string {
  const hasTier3 = data.tier3Proposals.length > 0;
  const approveCommands = hasTier3
    ? data.tier3Proposals.map((p) =>
        `<p style="margin:0 0 4px;font-size:11px;font-family:monospace;color:#374151;">
          # Approve proposal ${p.number} (${escapeHtml(p.capabilitySlug)})<br>
          curl -X POST ${baseUrl()}/v1/internal/health-monitor/proposals/${escapeHtml(p.eventId)}/approve -H "Authorization: Bearer $ADMIN_SECRET"
        </p>`
      ).join("")
    : "";

  return `
  <tr><td style="padding:24px 0 0;border-top:1px solid #e5e7eb;margin-top:24px;">
    <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
      This digest was generated automatically. Reply to this email or use the curl commands below to take action.
    </p>
    ${hasTier3 ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#374151;">Action commands:</p>${approveCommands}` : ""}
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
      Strale Platform Health Monitor · ${formatDateTime(data.generatedAt)}
    </p>
  </td></tr>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sectionWrap(title: string, content: string): string {
  return `
  <tr><td style="padding-top:28px;">
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:1px;color:#94a3b8;font-weight:700;text-transform:uppercase;">${escapeHtml(title)}</p>
    ${content}
  </td></tr>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch {
    return isoDate;
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

function baseUrl(): string {
  return process.env.API_BASE_URL ?? "https://strale-production.up.railway.app";
}
