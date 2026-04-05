import type { DigestData } from "./types.js";
import type { DigestAnalysis } from "./analyze.js";

const BG = "#ffffff";
const TEXT = "#1a1a1a";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const HEADER_COLOR = "#111827";
const GREEN = "#16a34a";
const RED = "#dc2626";
const NEUTRAL = "#9ca3af";
const LINK = "#2563eb";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function eur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function delta(value: number, prefix = ""): string {
  if (value > 0) return `<span style="color:${GREEN}">▲${prefix}${fmt(value)}</span>`;
  if (value < 0) return `<span style="color:${RED}">▼${prefix}${fmt(Math.abs(value))}</span>`;
  return `<span style="color:${NEUTRAL}">─</span>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sectionHeader(emoji: string, title: string): string {
  return `
    <tr><td style="padding: 24px 0 8px 0;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-top: 1px solid ${BORDER}; padding-top: 16px; font-size: 13px; font-weight: 700; color: ${HEADER_COLOR}; text-transform: uppercase; letter-spacing: 0.05em;">
          ${emoji}&nbsp; ${title}
        </td>
      </tr></table>
    </td></tr>`;
}

function metricRow(label: string, value: string | number, deltaVal?: number, deltaPrefix?: string): string {
  const d = deltaVal !== undefined ? `&nbsp;&nbsp;${delta(deltaVal, deltaPrefix)}` : "";
  return `<tr><td style="padding: 3px 0; font-size: 14px; color: ${MUTED};">${label}</td><td style="padding: 3px 0; font-size: 14px; font-weight: 600; color: ${TEXT}; text-align: right;">${typeof value === "number" ? fmt(value) : value}${d}</td></tr>`;
}

function link(text: string, url: string): string {
  return `<a href="${url}" style="color: ${LINK}; text-decoration: none;">${escHtml(text)}</a>`;
}

function warningBanner(text: string): string {
  return `<tr><td style="padding: 8px 0;"><div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; font-size: 14px; color: #92400e; border-radius: 4px;">${text}</div></td></tr>`;
}

function anomalyItem(text: string): string {
  return `<div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 8px 12px; font-size: 13px; color: #991b1b; border-radius: 4px; margin-bottom: 6px;">${escHtml(text)}</div>`;
}

export function renderDigestEmail(data: DigestData, analysis: DigestAnalysis): string {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(now);

  const pa = data.platformActivity;
  const ph = data.platformHealth;
  const sl = data.shipLog;
  const ba = data.beaconActivity;
  const eco = data.ecosystem;
  const sb = data.scoreboard;

  // ── Timespan label ───────────────────────────────────────────────────────
  const sinceTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sinceStr = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(sinceTime) + " UTC";

  // ── Sections ────────────────────────────────────────────────────────────

  // Situation assessment
  const situationHtml = `
    ${sectionHeader("📊", "Situation Assessment")}
    <tr><td style="padding: 4px 0 0 0; font-size: 15px; line-height: 1.6; color: ${TEXT};">${escHtml(analysis.situationAssessment)}</td></tr>`;

  // Strategic focus
  const strategicHtml = analysis.strategicFocus ? `
    ${sectionHeader("🧭", "Strategic Focus")}
    <tr><td style="padding: 4px 0 0 0;">
      <div style="background: #f0f4f8; padding: 14px 16px; border-radius: 6px; font-size: 14px; line-height: 1.6; color: #334155;">${escHtml(analysis.strategicFocus)}</div>
    </td></tr>` : "";

  // Ship log
  const journalItems = sl.journalEntries.length > 0
    ? sl.journalEntries.map((e) => `<li style="margin-bottom: 4px;">${escHtml(e.title)}${e.type ? ` <span style="color:${MUTED};">(${escHtml(e.type)})</span>` : ""}</li>`).join("")
    : `<li style="color:${MUTED};">None</li>`;
  const commitCount = sl.githubCommits.length;
  const commitRepos = [...new Set(sl.githubCommits.map((c) => c.repo))];
  const socialItems = sl.socialPosts.length > 0
    ? sl.socialPosts.map((p) => `${escHtml(p.title)} (${escHtml(p.platform)})`).join(", ")
    : "None";

  // Notion workspace activity (beyond journal/social)
  const notionItems = (sl.notionActivity ?? []).slice(0, 10);
  const notionExtraCount = Math.max(0, (sl.notionActivity ?? []).length - 10);
  const notionActivityHtml = notionItems.length > 0 ? `
      <br><strong>Other Notion activity:</strong>
      <ul style="margin: 4px 0 4px 20px; padding: 0;">
        ${notionItems.map((a) => {
          const tag = a.isNew ? `<span style="color:${GREEN};">NEW</span>` : `<span style="color:${NEUTRAL};">EDITED</span>`;
          const parent = a.parentName ? ` <span style="color:${NEUTRAL};">in ${escHtml(a.parentName)}</span>` : "";
          return `<li style="margin-bottom: 3px;">${tag} ${escHtml(a.title)}${parent}</li>`;
        }).join("")}
        ${notionExtraCount > 0 ? `<li style="color:${NEUTRAL};">...and ${notionExtraCount} more changes</li>` : ""}
      </ul>` : "";

  const shipLogHtml = `
    ${sectionHeader("🚀", "Yesterday's Shiplog")}
    <tr><td style="padding: 4px 0; font-size: 14px; line-height: 1.6; color: ${TEXT};">
      ${analysis.shipLogSummary ? escHtml(analysis.shipLogSummary) : `<span style="color:${MUTED};">No recorded activity yesterday.</span>`}
    </td></tr>
    <tr><td style="padding: 8px 0; font-size: 13px; color: ${MUTED};">
      <strong>Journal:</strong><ul style="margin: 4px 0 8px 20px; padding: 0;">${journalItems}</ul>
      <strong>Commits:</strong> ${commitCount > 0 ? `${commitCount} across ${commitRepos.join(", ")}` : "None"}<br>
      <strong>Posts:</strong> ${socialItems}
      ${notionActivityHtml}
    </td></tr>`;

  // Platform activity
  const topCaps = pa.apiCalls.byCapability.slice(0, 5)
    .map((c) => `<span style="font-family: monospace; font-size: 12px; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">${escHtml(c.slug)}</span> (${fmt(c.count)})`)
    .join(", ");

  const activityHtml = `
    ${sectionHeader("📈", `Platform Activity (last 24h — since ${sinceStr})`)}
    ${pa.zeroActivity ? warningBanner("⚠️ No platform activity in the last 24 hours") : ""}
    <tr><td style="padding: 4px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
        ${metricRow("Signups", pa.signups.count, pa.signups.delta)}
        ${metricRow("API Calls", pa.apiCalls.total, pa.apiCalls.delta)}
        ${metricRow("Active Users", pa.uniqueUsers.count, pa.uniqueUsers.delta)}
        ${metricRow("Transactions", pa.transactions.count, pa.transactions.delta)}
        ${metricRow("Revenue", eur(pa.revenue.cents), pa.revenue.delta, "€")}
      </table>
    </td></tr>
    ${topCaps ? `<tr><td style="padding: 8px 0 0 0; font-size: 13px; color: ${MUTED};">Top: ${topCaps}</td></tr>` : ""}
    ${pa.solutionExecutions.length > 0 ? `<tr><td style="padding: 6px 0 0 0; font-size: 13px; color: ${MUTED};">Solutions: ${pa.solutionExecutions.map((s) => `<span style="font-family: monospace; font-size: 12px; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">${escHtml(s.slug)}</span> (${s.count}× — ${s.succeeded} ok, ${s.failed} fail)`).join(", ")}</td></tr>` : ""}
    ${pa.signups.emails.length > 0 ? `<tr><td style="padding: 6px 0 0 0; font-size: 12px; color: ${MUTED};">New: ${pa.signups.emails.map(escHtml).join(", ")}</td></tr>` : ""}
    ${pa.signups.internalEmails.length > 0 ? `<tr><td style="padding: 2px 0 0 0; font-size: 11px; color: ${NEUTRAL};">Internal: ${pa.signups.internalEmails.map(escHtml).join(", ")}</td></tr>` : ""}`;

  // Platform health
  const breakerHtml = ph.circuitBreakers.length > 0
    ? ph.circuitBreakers.map((b) => `<span style="color:${RED};">${escHtml(b.slug)} (${b.state}, ${b.consecutiveFailures} failures)</span>`).join("<br>")
    : `<span style="color:${GREEN};">All closed ✓</span>`;
  const sqsHtml = ph.sqsChanges.length > 0
    ? ph.sqsChanges.map((s) => `${escHtml(s.slug)}: ${s.oldGrade} → ${s.newGrade} ${s.direction === "up" ? `<span style="color:${GREEN};">▲</span>` : `<span style="color:${RED};">▼</span>`}`).join("<br>")
    : "None";

  const healthHtml = `
    ${sectionHeader("🏥", "Platform Health")}
    <tr><td style="padding: 4px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
        <tr><td style="padding: 3px 0; color: ${MUTED};">Test Pass Rate</td><td style="padding: 3px 0; text-align: right; font-weight: 600;">${ph.testPassRate.rate}% (${fmt(ph.testPassRate.passed)}/${fmt(ph.testPassRate.total)})</td></tr>
        <tr><td style="padding: 3px 0; color: ${MUTED};">Circuit Breakers</td><td style="padding: 3px 0; text-align: right;">${breakerHtml}</td></tr>
        <tr><td style="padding: 3px 0; color: ${MUTED};">SQS Changes</td><td style="padding: 3px 0; text-align: right;">${sqsHtml}</td></tr>
      </table>
    </td></tr>`;

  // Beacon
  const beaconHtml = `
    ${sectionHeader("🔍", "Beacon")}
    <tr><td style="padding: 4px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">
        ${metricRow("Scans (24h)", ba.scansLast24h)}
        ${metricRow("Domains", ba.scanDomains.length > 0 ? ba.scanDomains.slice(0, 5).join(", ") : "—")}
        ${metricRow("New Subscribers", ba.newSubscribers)}
        ${metricRow("Total Scans", ba.totalScans)}
      </table>
    </td></tr>`;

  // Website traffic
  const wt = data.websiteTraffic;
  const trafficHtml = `
    ${sectionHeader("🌐", "Website Traffic")}
    <tr><td style="padding: 4px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
        <tr><td style="padding: 3px 0; color: ${MUTED};">strale.dev</td><td style="padding: 3px 0; text-align: right; color: ${wt.straleDev.available ? TEXT : NEUTRAL};">${escHtml(wt.straleDev.note)}</td></tr>
        <tr><td style="padding: 3px 0; color: ${MUTED};">scan.strale.io</td><td style="padding: 3px 0; text-align: right; color: ${wt.beacon.available ? TEXT : NEUTRAL};">${escHtml(wt.beacon.note)}</td></tr>
      </table>
    </td></tr>`;

  // Ecosystem
  const repoRows = eco.repos.map((r) =>
    `<tr><td style="padding: 2px 0; font-size: 13px; color: ${MUTED};">${link(r.name, `https://github.com/strale-io/${r.name}`)}</td><td style="text-align: right; font-size: 13px;">⭐ ${r.stars}&nbsp;${delta(r.starsDelta)}&nbsp;&nbsp;PRs: ${r.openPRs}</td></tr>`
  ).join("");
  const npmRows = eco.npmDownloads.map((p) =>
    `<tr><td style="padding: 2px 0; font-size: 13px; color: ${MUTED}; font-family: monospace;">${escHtml(p.package)}</td><td style="text-align: right; font-size: 13px; font-weight: 600;">${fmt(p.weeklyDownloads)}</td></tr>`
  ).join("");
  const pypiRows = eco.pypiDownloads.map((p) =>
    `<tr><td style="padding: 2px 0; font-size: 13px; color: ${MUTED}; font-family: monospace;">${escHtml(p.package)}</td><td style="text-align: right; font-size: 13px; font-weight: 600;">${fmt(p.recentDownloads)}</td></tr>`
  ).join("");

  const ecosystemHtml = `
    ${sectionHeader("📦", "Ecosystem")}
    <tr><td style="padding: 4px 0;">
      ${repoRows ? `<div style="font-size: 12px; font-weight: 600; color: ${HEADER_COLOR}; margin-bottom: 4px;">GitHub</div><table width="100%" cellpadding="0" cellspacing="0">${repoRows}</table>` : ""}
      ${npmRows ? `<div style="font-size: 12px; font-weight: 600; color: ${HEADER_COLOR}; margin: 10px 0 4px 0;">npm / week</div><table width="100%" cellpadding="0" cellspacing="0">${npmRows}</table>` : ""}
      ${pypiRows ? `<div style="font-size: 12px; font-weight: 600; color: ${HEADER_COLOR}; margin: 10px 0 4px 0;">PyPI / week</div><table width="100%" cellpadding="0" cellspacing="0">${pypiRows}</table>` : ""}
    </td></tr>`;

  // Distribution surfaces
  const surfaceItems = data.distributionSurfaces.map((s) => {
    const badge = s.status === "listed" ? "" :
      s.daysPending && s.daysPending > 7 ? ` <span style="color: #f59e0b;">⚠️ ${s.daysPending}d</span>` :
      s.daysPending ? ` <span style="color: ${MUTED};">(${s.daysPending}d)</span>` :
      ` <span style="color: ${GREEN};">✓</span>`;
    return `<li style="margin-bottom: 4px; font-size: 13px;">${escHtml(s.name)}${badge}</li>`;
  }).join("");

  const surfacesHtml = data.distributionSurfaces.length > 0 ? `
    ${sectionHeader("🗺️", "Distribution Surfaces")}
    <tr><td style="padding: 4px 0;"><ul style="margin: 0 0 0 20px; padding: 0; color: ${TEXT};">${surfaceItems}</ul></td></tr>` : "";

  // Priorities
  const decisionItems = data.priorities.unreviewedDecisions.slice(0, 5).map((d) =>
    `<li style="margin-bottom: 4px; font-size: 13px;">${escHtml(d.title)} <span style="color:${MUTED};">(${d.date})</span></li>`
  ).join("");
  const actionItems = data.priorities.actionRequired.slice(0, 5).map((a) =>
    `<li style="margin-bottom: 4px; font-size: 13px;">${escHtml(a.title)}</li>`
  ).join("");

  const olderDecisionsLine = data.priorities.olderUnreviewedCount > 0
    ? `<tr><td style="padding: 4px 0 0 20px; font-size: 12px; color: ${NEUTRAL};">+ ${data.priorities.olderUnreviewedCount} older decisions need review</td></tr>`
    : "";
  const olderActionsLine = data.priorities.olderActionRequiredCount > 0
    ? `<tr><td style="padding: 4px 0 0 20px; font-size: 12px; color: ${NEUTRAL};">+ ${data.priorities.olderActionRequiredCount} older action items</td></tr>`
    : "";

  const totalDecisions = data.priorities.unreviewedDecisions.length + data.priorities.olderUnreviewedCount;
  const totalActions = data.priorities.actionRequired.length + data.priorities.olderActionRequiredCount;
  const hasPriorities = totalDecisions > 0 || totalActions > 0;

  const prioritiesHtml = hasPriorities ? `
    ${sectionHeader("📋", "Priorities")}
    ${totalDecisions > 0 ? `
      <tr><td style="padding: 4px 0; font-size: 13px; font-weight: 600; color: ${TEXT};">Unreviewed Decisions: ${data.priorities.unreviewedDecisions.length} recent${data.priorities.olderUnreviewedCount > 0 ? ` + ${data.priorities.olderUnreviewedCount} older` : ""}</td></tr>
      ${decisionItems ? `<tr><td><ul style="margin: 4px 0 4px 20px; padding: 0;">${decisionItems}</ul></td></tr>` : ""}
      ${olderDecisionsLine}` : ""}
    ${totalActions > 0 ? `
      <tr><td style="padding: 8px 0 4px 0; font-size: 13px; font-weight: 600; color: ${TEXT};">Action Required: ${data.priorities.actionRequired.length} recent${data.priorities.olderActionRequiredCount > 0 ? ` + ${data.priorities.olderActionRequiredCount} older` : ""}</td></tr>
      ${actionItems ? `<tr><td><ul style="margin: 4px 0 4px 20px; padding: 0;">${actionItems}</ul></td></tr>` : ""}
      ${olderActionsLine}` : ""}` : "";

  // Recommended actions
  const actionRows = analysis.recommendedActions.map((a, i) => {
    const badge = a.impact === "high"
      ? `<span style="background: #dc2626; color: white; font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 700;">HIGH</span>`
      : `<span style="background: #f59e0b; color: white; font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 700;">MED</span>`;
    const linkLine = a.link ? `<br><span style="font-size: 12px;">→ ${link(a.link, a.link)}</span>` : "";
    return `<tr><td style="padding: 8px 0; border-bottom: 1px solid ${BORDER};">
      <div style="font-size: 14px; font-weight: 600; color: ${TEXT};">${i + 1}. ${badge}&nbsp; ${escHtml(a.action)}</div>
      <div style="font-size: 13px; color: ${MUTED}; margin-top: 4px;">${escHtml(a.why)}${linkLine}</div>
    </td></tr>`;
  }).join("");

  const actionsHtml = analysis.recommendedActions.length > 0 ? `
    ${sectionHeader("🎯", "Recommended Actions")}
    <tr><td><table width="100%" cellpadding="0" cellspacing="0">${actionRows}</table></td></tr>` : "";

  // Anomalies
  const anomaliesHtml = analysis.anomalies.length > 0 ? `
    ${sectionHeader("⚠️", "Anomalies")}
    <tr><td style="padding: 4px 0;">${analysis.anomalies.map(anomalyItem).join("")}</td></tr>` : "";

  // Bottleneck
  const bottleneckHtml = analysis.bottleneck ? `
    <tr><td style="padding: 16px 0 0 0;">
      <div style="background: #f0f9ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px;">
        <div style="font-size: 12px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Bottleneck</div>
        <div style="font-size: 14px; color: #1e3a5f;">${escHtml(analysis.bottleneck)}</div>
      </div>
    </td></tr>` : "";

  // Scoreboard
  const scoreboardHtml = `
    ${sectionHeader("📊", "Scoreboard")}
    <tr><td style="padding: 8px 0; font-size: 13px; color: ${MUTED}; text-align: center;">
      <strong style="color: ${TEXT};">${fmt(sb.totalCapabilities)}</strong> capabilities&nbsp;&nbsp;·&nbsp;&nbsp;
      <strong style="color: ${TEXT};">${fmt(sb.totalSolutions)}</strong> solutions&nbsp;&nbsp;·&nbsp;&nbsp;
      <strong style="color: ${TEXT};">${fmt(sb.totalUsers)}</strong> users&nbsp;&nbsp;·&nbsp;&nbsp;
      <strong style="color: ${TEXT};">${fmt(sb.totalApiCalls)}</strong> API calls&nbsp;&nbsp;·&nbsp;&nbsp;
      <strong style="color: ${TEXT};">${fmt(sb.totalBeaconScans)}</strong> scans
    </td></tr>`;

  // ── Assemble ────────────────────────────────────────────────────────────

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: ${FONT};">
<table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6;">
<tr><td align="center" style="padding: 24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="background: ${BG}; border-radius: 8px; overflow: hidden; max-width: 600px; width: 100%;">

  <!-- Header -->
  <tr><td style="background: #0f172a; padding: 24px 32px;">
    <div style="font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: 0.02em;">STRALE DAILY DIGEST</div>
    <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">${dateStr}</div>
  </td></tr>

  <!-- Content -->
  <tr><td style="padding: 0 32px 32px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${situationHtml}
      ${strategicHtml}
      ${shipLogHtml}
      ${activityHtml}
      ${healthHtml}
      ${beaconHtml}
      ${trafficHtml}
      ${ecosystemHtml}
      ${surfacesHtml}
      ${prioritiesHtml}
      ${actionsHtml}
      ${anomaliesHtml}
      ${bottleneckHtml}
      ${scoreboardHtml}
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid ${BORDER};">
    <div style="font-size: 11px; color: ${MUTED}; text-align: center;">
      Generated at ${data.generatedAt.slice(0, 16).replace("T", " ")} UTC&nbsp;&nbsp;·&nbsp;&nbsp;
      ${link("Dashboard", "https://strale.dev")}&nbsp;&nbsp;·&nbsp;&nbsp;
      ${link("Railway", "https://railway.app")}&nbsp;&nbsp;·&nbsp;&nbsp;
      ${link("GitHub", "https://github.com/strale-io/strale")}
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
