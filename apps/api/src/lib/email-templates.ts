/**
 * Email Design System — Shared Template Foundation
 *
 * All platform health emails (digest, interrupts) import from here.
 * Every function returns a raw HTML string with inline CSS.
 *
 * Rules:
 * - HTML tables for layout (no CSS grid/flexbox — Outlook doesn't support them)
 * - All styles inline (no <style> blocks — stripped by many email clients)
 * - Max width 620px, single column
 * - Text symbols for icons (✓ ✗ • ▶) — SVG not reliably rendered in email
 */

// ─── Design Tokens ──────────────────────────────────────────────────────────

const COLORS = {
  // Severity header bars
  critical: "#E24B4A",
  warning: "#BA7517",
  resolved: "#0F6E56",
  digest: "#185FA5",
  // Backgrounds
  bgPrimary: "#ffffff",
  bgSecondary: "#f5f5f4",
  bgDanger: "#fef2f2",
  bgWarning: "#fefce8",
  bgSuccess: "#f0fdf4",
  bgInfo: "#eff6ff",
  // Text
  textPrimary: "#1a1a1a",
  textSecondary: "#6b7280",
  textTertiary: "#9ca3af",
  // Semantic text (on colored backgrounds)
  textDanger: "#991b1b",
  textWarning: "#854d0e",
  textSuccess: "#166534",
  textInfo: "#1e40af",
  // Borders
  borderLight: "#e5e7eb",
  // Status badges
  badgeHealthy: { bg: "#f0fdf4", text: "#166534" },
  badgeDown: { bg: "#fef2f2", text: "#991b1b" },
  badgeWarning: { bg: "#fefce8", text: "#854d0e" },
  badgeInfo: { bg: "#eff6ff", text: "#1e40af" },
  badgeAuto: { bg: "#eff6ff", text: "#1e40af" },
  badgeRetry: { bg: "#fefce8", text: "#854d0e" },
  badgeRecovered: { bg: "#f0fdf4", text: "#166534" },
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export { COLORS };

// ─── Escape ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── 1. Email Wrapper ───────────────────────────────────────────────────────

/**
 * Outer shell for all email types.
 * Colored header bar with icon text + title. White body. Footer with timestamp.
 */
export function emailWrapper(
  headerColor: string,
  iconText: string,
  topLabel: string,
  title: string,
  bodyHtml: string,
): string {
  const now = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0ef;font-family:${FONT};">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f0ef;padding:24px 16px;">
<tr><td align="center">
<!--[if mso]><table width="620" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;background:${COLORS.bgPrimary};border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- Header bar -->
  <tr><td style="background:${headerColor};padding:20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td style="vertical-align:middle;width:36px;">
        <span style="font-size:22px;line-height:1;">${iconText}</span>
      </td>
      <td style="vertical-align:middle;padding-left:12px;">
        <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">${esc(topLabel)}</p>
        <h1 style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">${esc(title)}</h1>
      </td>
    </tr>
    </table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px 8px;">
    ${bodyHtml}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 32px 24px;border-top:1px solid ${COLORS.borderLight};">
    <p style="margin:0;font-size:11px;color:${COLORS.textTertiary};line-height:1.6;">
      Strale Platform Health Monitor &middot; ${now} CET<br>
      <a href="https://api.strale.io/v1/internal/trust/capabilities/batch" style="color:${COLORS.textTertiary};text-decoration:underline;">Trust API</a>
      &middot;
      <a href="https://strale.dev/trust" style="color:${COLORS.textTertiary};text-decoration:underline;">Methodology</a>
    </p>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

// ─── 2. Metric Card ─────────────────────────────────────────────────────────

export function metricCard(label: string, value: string, subtitle?: string): string {
  return `<td style="padding:4px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${COLORS.bgSecondary};border-radius:6px;">
  <tr><td style="padding:12px 14px;">
    <p style="margin:0;font-size:11px;color:${COLORS.textSecondary};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${esc(label)}</p>
    <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:${COLORS.textPrimary};line-height:1.2;">${esc(value)}</p>
    ${subtitle ? `<p style="margin:2px 0 0;font-size:11px;color:${COLORS.textTertiary};">${esc(subtitle)}</p>` : ""}
  </td></tr>
  </table>
</td>`;
}

// ─── 3. Metric Grid ─────────────────────────────────────────────────────────

export function metricGrid(
  cards: Array<{ label: string; value: string; subtitle?: string }>,
): string {
  // Use a table row with equal-width cells for email client compatibility
  const cols = cards.length;
  const widthPct = Math.floor(100 / cols);
  const cells = cards
    .map((c) => metricCard(c.label, c.value, c.subtitle))
    .join("\n");

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
<tr>
${cells}
</tr>
</table>`;
}

// ─── 4. Status Badge ────────────────────────────────────────────────────────

type BadgeKind =
  | "healthy"
  | "down"
  | "warning"
  | "info"
  | "auto"
  | "retry"
  | "recovered"
  | "upstream"
  | "internal";

const BADGE_MAP: Record<BadgeKind, { bg: string; text: string; default: string }> = {
  healthy: { ...COLORS.badgeHealthy, default: "Healthy" },
  down: { ...COLORS.badgeDown, default: "Down" },
  warning: { ...COLORS.badgeWarning, default: "Warning" },
  info: { ...COLORS.badgeInfo, default: "Info" },
  auto: { ...COLORS.badgeAuto, default: "Auto-fixed" },
  retry: { ...COLORS.badgeRetry, default: "Retrying" },
  recovered: { ...COLORS.badgeRecovered, default: "Recovered" },
  upstream: { ...COLORS.badgeWarning, default: "Upstream" },
  internal: { ...COLORS.badgeDown, default: "Internal" },
};

export function statusBadge(status: BadgeKind, text?: string): string {
  const b = BADGE_MAP[status];
  const label = text ?? b.default;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${b.bg};color:${b.text};line-height:1.5;">${esc(label)}</span>`;
}

// ─── 5. SQS Grade Badge ────────────────────────────────────────────────────

const SQS_GRADE_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: "#f0fdf4", text: "#166534" },
  B: { bg: "#f0fdf4", text: "#166534" },
  C: { bg: "#fefce8", text: "#854d0e" },
  D: { bg: "#fff7ed", text: "#9a3412" },
  E: { bg: "#fef2f2", text: "#991b1b" },
  F: { bg: "#fef2f2", text: "#991b1b" },
  pending: { bg: "#f5f5f4", text: "#6b7280" },
};

export function sqsGradeBadge(grade: string, score: number): string {
  const g = SQS_GRADE_COLORS[grade] ?? SQS_GRADE_COLORS.pending;
  const label = grade === "pending" ? "Pending" : `${grade} (${score})`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${g.bg};color:${g.text};line-height:1.5;">${esc(label)}</span>`;
}

// ─── 6. Check Item ──────────────────────────────────────────────────────────

export function checkItem(text: string): string {
  return `<tr><td style="padding:3px 0;font-size:13px;color:${COLORS.textPrimary};line-height:1.5;">
  <span style="color:${COLORS.textSuccess};font-weight:700;margin-right:6px;">&#10003;</span>${esc(text)}
</td></tr>`;
}

// ─── 7. Timeline Item ───────────────────────────────────────────────────────

export function timelineItem(opts: {
  time: string;
  text: string;
  detail?: string;
  badge?: string;
  isActive?: boolean;
  isLast?: boolean;
}): string {
  const dotColor = opts.isActive ? "#2563eb" : COLORS.textTertiary;
  const borderStyle = opts.isLast
    ? "border-left:2px solid transparent;"
    : `border-left:2px solid ${COLORS.borderLight};`;

  return `<tr>
<td style="vertical-align:top;width:14px;padding-right:12px;position:relative;">
  <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};margin-top:4px;"></div>
  ${!opts.isLast ? `<div style="width:2px;background:${COLORS.borderLight};margin:2px auto 0;height:100%;min-height:20px;"></div>` : ""}
</td>
<td style="padding-bottom:${opts.isLast ? "0" : "14px"};vertical-align:top;">
  <p style="margin:0;font-size:11px;color:${COLORS.textTertiary};">${esc(opts.time)}</p>
  <p style="margin:2px 0 0;font-size:13px;color:${COLORS.textPrimary};font-weight:500;">
    ${esc(opts.text)}${opts.badge ? ` ${opts.badge}` : ""}
  </p>
  ${opts.detail ? `<p style="margin:2px 0 0;font-size:12px;color:${COLORS.textSecondary};">${esc(opts.detail)}</p>` : ""}
</td>
</tr>`;
}

// ─── 8. Numbered Step ───────────────────────────────────────────────────────

export function numberedStep(n: number, title: string, detail: string): string {
  return `<tr>
<td style="vertical-align:top;width:28px;padding-right:10px;">
  <div style="width:24px;height:24px;border-radius:50%;background:${COLORS.bgInfo};color:${COLORS.textInfo};font-size:12px;font-weight:700;text-align:center;line-height:24px;">${n}</div>
</td>
<td style="padding-bottom:14px;vertical-align:top;">
  <p style="margin:0;font-size:14px;color:${COLORS.textPrimary};font-weight:600;">${esc(title)}</p>
  <p style="margin:3px 0 0;font-size:12px;color:${COLORS.textSecondary};line-height:1.5;">${esc(detail)}</p>
</td>
</tr>`;
}

// ─── 9. Section Header ──────────────────────────────────────────────────────

export function sectionHeader(text: string): string {
  return `<p style="margin:24px 0 8px;font-size:11px;color:${COLORS.textSecondary};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">${esc(text)}</p>`;
}

// ─── 10. Source Attribution ─────────────────────────────────────────────────

export function sourceAttribution(text: string): string {
  return `<p style="margin:4px 0 16px;font-size:10px;color:${COLORS.textTertiary};font-style:italic;">${esc(text)}</p>`;
}

// ─── 11. Code Block ─────────────────────────────────────────────────────────

export function codeBlock(text: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0 16px;">
<tr><td style="background:${COLORS.bgSecondary};border-radius:4px;padding:10px 14px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:12px;color:${COLORS.textPrimary};line-height:1.6;word-break:break-all;">
${esc(text)}
</td></tr>
</table>`;
}

// ─── 12. Probe Data Table ───────────────────────────────────────────────────

export function probeDataTable(
  rows: Array<{ label: string; value: string | { badge: string } }>,
): string {
  const rowHtml = rows
    .map(
      (r) =>
        `<tr>
  <td style="padding:6px 10px;font-size:12px;color:${COLORS.textSecondary};white-space:nowrap;border-bottom:1px solid ${COLORS.borderLight};">${esc(r.label)}</td>
  <td style="padding:6px 10px;font-size:12px;color:${COLORS.textPrimary};border-bottom:1px solid ${COLORS.borderLight};">
    ${typeof r.value === "string" ? esc(r.value) : r.value.badge}
  </td>
</tr>`,
    )
    .join("\n");

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0 16px;border:1px solid ${COLORS.borderLight};border-radius:6px;overflow:hidden;">
${rowHtml}
</table>`;
}

// ─── 13. Capability Table ───────────────────────────────────────────────────

export function capabilityTable(
  rows: Array<{
    slug: string;
    sqs_score: number;
    sqs_grade: string;
    freshness: string;
    last_tested: string;
  }>,
): string {
  if (rows.length === 0) return "";

  const header = `<tr>
  <td style="padding:8px 10px;font-size:11px;color:${COLORS.textSecondary};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid ${COLORS.borderLight};background:${COLORS.bgSecondary};">Capability</td>
  <td style="padding:8px 10px;font-size:11px;color:${COLORS.textSecondary};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid ${COLORS.borderLight};background:${COLORS.bgSecondary};text-align:center;">SQS</td>
  <td style="padding:8px 10px;font-size:11px;color:${COLORS.textSecondary};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid ${COLORS.borderLight};background:${COLORS.bgSecondary};text-align:center;">Freshness</td>
  <td style="padding:8px 10px;font-size:11px;color:${COLORS.textSecondary};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid ${COLORS.borderLight};background:${COLORS.bgSecondary};text-align:right;">Last Tested</td>
</tr>`;

  const rowHtml = rows
    .map(
      (r) =>
        `<tr>
  <td style="padding:6px 10px;font-size:12px;color:${COLORS.textPrimary};border-bottom:1px solid ${COLORS.borderLight};font-family:'SFMono-Regular',Consolas,monospace;font-weight:500;">${esc(r.slug)}</td>
  <td style="padding:6px 10px;text-align:center;border-bottom:1px solid ${COLORS.borderLight};">${sqsGradeBadge(r.sqs_grade, r.sqs_score)}</td>
  <td style="padding:6px 10px;font-size:11px;color:${COLORS.textSecondary};text-align:center;border-bottom:1px solid ${COLORS.borderLight};">${esc(r.freshness)}</td>
  <td style="padding:6px 10px;font-size:11px;color:${COLORS.textTertiary};text-align:right;border-bottom:1px solid ${COLORS.borderLight};">${esc(r.last_tested)}</td>
</tr>`,
    )
    .join("\n");

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0 16px;border:1px solid ${COLORS.borderLight};border-radius:6px;overflow:hidden;">
${header}
${rowHtml}
</table>`;
}

// ─── 14. Event Log Table ────────────────────────────────────────────────────

export function eventLogTable(
  rows: Array<{ time: string; event: string; badge?: string }>,
): string {
  if (rows.length === 0) return "";

  const rowHtml = rows
    .map(
      (r) =>
        `<tr>
  <td style="padding:6px 10px;font-size:11px;color:${COLORS.textTertiary};white-space:nowrap;border-bottom:1px solid ${COLORS.borderLight};vertical-align:top;">${esc(r.time)}</td>
  <td style="padding:6px 10px;font-size:12px;color:${COLORS.textPrimary};border-bottom:1px solid ${COLORS.borderLight};">
    ${esc(r.event)}${r.badge ? ` ${r.badge}` : ""}
  </td>
</tr>`,
    )
    .join("\n");

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0 16px;border:1px solid ${COLORS.borderLight};border-radius:6px;overflow:hidden;">
${rowHtml}
</table>`;
}

// ─── 15. Infrastructure Table ───────────────────────────────────────────────

export function infrastructureTable(
  deps: Array<{
    name: string;
    healthy: boolean;
    latency_ms: number | null;
    error?: string;
  }>,
): string {
  if (deps.length === 0) return "";

  const header = `<tr>
  <td style="padding:8px 10px;font-size:11px;color:${COLORS.textSecondary};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid ${COLORS.borderLight};background:${COLORS.bgSecondary};">Dependency</td>
  <td style="padding:8px 10px;font-size:11px;color:${COLORS.textSecondary};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid ${COLORS.borderLight};background:${COLORS.bgSecondary};text-align:center;">Status</td>
  <td style="padding:8px 10px;font-size:11px;color:${COLORS.textSecondary};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid ${COLORS.borderLight};background:${COLORS.bgSecondary};text-align:right;">Latency</td>
</tr>`;

  const rowHtml = deps
    .map((d) => {
      const badge = d.healthy
        ? statusBadge("healthy")
        : statusBadge("down", d.error ?? "Down");
      const latency =
        d.latency_ms != null ? `${d.latency_ms}ms` : "—";
      return `<tr>
  <td style="padding:6px 10px;font-size:12px;color:${COLORS.textPrimary};border-bottom:1px solid ${COLORS.borderLight};font-weight:500;">${esc(d.name)}</td>
  <td style="padding:6px 10px;text-align:center;border-bottom:1px solid ${COLORS.borderLight};">${badge}</td>
  <td style="padding:6px 10px;font-size:12px;color:${COLORS.textSecondary};text-align:right;border-bottom:1px solid ${COLORS.borderLight};">${esc(latency)}</td>
</tr>`;
    })
    .join("\n");

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0 16px;border:1px solid ${COLORS.borderLight};border-radius:6px;overflow:hidden;">
${header}
${rowHtml}
</table>`;
}
