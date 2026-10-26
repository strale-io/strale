/**
 * Daily summary of outside data-source outages.
 *
 * Third-party sources (registries, public APIs, vendors) go down and come back
 * many times a day. Until 2026-10 each confirmed outage and each recovery was
 * its own Health Monitor email: 577 of them between 2026-08-24 and 2026-10-23,
 * and every alert email in the 30 days before this change was one of these.
 * None was something the founder could act on — the source belongs to someone
 * else, and Strale already skips the affected tests and retries.
 *
 * So intelligent-alerts.ts no longer emails per event for an external
 * dependency (see `isExternalDependency`), and this module sends one email a
 * day listing what went down, how often, for how long, and what is still down.
 * It reads the `dependency_probe` rows dependency-health.ts already persists
 * on every probe, so it needs no state of its own and survives restarts.
 *
 * What still emails at once is unchanged in intelligent-alerts.ts: Strale's own
 * services, and an external outage that is failing paying customers' calls.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getProvider } from "./dependency-manifest.js";
import { DEPENDENCY_CONTEXT } from "./situation-assessment.js";
import { logHealthEvent } from "./health-monitor.js";
import { log, logWarn } from "./log.js";

// ─── Classification ─────────────────────────────────────────────────────────

/**
 * True when the dependency is run by someone else. Unknown names are treated
 * as Strale's own, so anything this function has not been told about keeps
 * alerting immediately rather than quietly moving to a daily email.
 */
export function isExternalDependency(name: string): boolean {
  const provider = getProvider(name);
  if (!provider) return false;
  if (provider.tier === "self-hosted") return false;
  return DEPENDENCY_CONTEXT[name]?.ownership !== "strale_infrastructure";
}

export function dependencyDisplayName(name: string): string {
  return DEPENDENCY_CONTEXT[name]?.displayName ?? getProvider(name)?.displayName ?? name;
}

// ─── Summary (pure) ─────────────────────────────────────────────────────────

export interface ProbeRow {
  dependency: string;
  at: Date;
  healthy: boolean;
}

export interface DependencyOutageSummary {
  dependency: string;
  displayName: string;
  /** Confirmed outages (2+ consecutive failed probes) overlapping the window. */
  outages: number;
  /** Downtime inside the window, summed across outages. */
  downMinutes: number;
  /** Full length of the longest outage, including any part before the window. */
  longestMinutes: number;
  stillDown: boolean;
  /** Start of the current outage when stillDown. */
  downSince: Date | null;
  /** True when the current outage began before the earliest probe read, so
   *  downSince is "at least since". */
  downSinceIsLowerBound: boolean;
}

/** Same confirmation rule the per-event emails used: one failed probe is a
 *  blip, two in a row is an outage. */
const CONFIRMED_FAILURES = 2;

/**
 * Turn probe rows into per-dependency outage summaries for [windowStart,
 * windowEnd). Rows may start before the window so an outage already running at
 * windowStart shows its real start. An outage ends at the first healthy probe
 * after it; one with no healthy probe yet is still down. Only dependencies with
 * at least one confirmed outage overlapping the window are returned, still-down
 * ones first.
 */
export function summarizeExternalOutages(
  rows: ProbeRow[],
  windowStart: Date,
  windowEnd: Date,
  isExternal: (name: string) => boolean = isExternalDependency,
): DependencyOutageSummary[] {
  const byDep = new Map<string, ProbeRow[]>();
  for (const r of rows) {
    if (!isExternal(r.dependency)) continue;
    const list = byDep.get(r.dependency) ?? [];
    list.push(r);
    byDep.set(r.dependency, list);
  }

  const ws = windowStart.getTime();
  const we = windowEnd.getTime();
  const summaries: DependencyOutageSummary[] = [];

  for (const [dependency, list] of byDep) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());

    let outages = 0;
    let downMs = 0;
    let longestMs = 0;
    let stillDown = false;
    let downSince: Date | null = null;
    let downSinceIsLowerBound = false;

    let i = 0;
    while (i < list.length) {
      if (list[i].healthy) { i++; continue; }
      const runStartIdx = i;
      while (i < list.length && !list[i].healthy) i++;
      const failures = i - runStartIdx;
      if (failures < CONFIRMED_FAILURES) continue;

      const start = list[runStartIdx].at.getTime();
      const ongoing = i >= list.length;
      const end = ongoing ? we : list[i].at.getTime();
      if (end <= ws || start >= we) continue;

      outages++;
      downMs += Math.min(end, we) - Math.max(start, ws);
      longestMs = Math.max(longestMs, end - start);
      if (ongoing) {
        stillDown = true;
        downSince = list[runStartIdx].at;
        downSinceIsLowerBound = runStartIdx === 0;
      }
    }

    if (outages === 0) continue;
    summaries.push({
      dependency,
      displayName: dependencyDisplayName(dependency),
      outages,
      downMinutes: Math.round(downMs / 60_000),
      longestMinutes: Math.round(longestMs / 60_000),
      stillDown,
      downSince,
      downSinceIsLowerBound,
    });
  }

  return summaries.sort((a, b) =>
    a.stillDown !== b.stillDown ? (a.stillDown ? -1 : 1) : b.downMinutes - a.downMinutes,
  );
}

// ─── Email (pure) ───────────────────────────────────────────────────────────

const TZ = "Europe/Stockholm";

function formatSwedishTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: TZ,
  }).format(d);
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderExternalOutageDigest(
  summaries: DependencyOutageSummary[],
  windowStart: Date,
  windowEnd: Date,
): { subject: string; html: string } {
  const down = summaries.filter((s) => s.stillDown);
  const recovered = summaries.filter((s) => !s.stillDown);

  const subject = `Strale — outside data sources, daily summary: ${summaries.length} had outages` +
    (down.length > 0 ? `, ${down.length} still down` : "");

  const item = (s: DependencyOutageSummary): string => {
    const times = s.outages === 1 ? "1 outage" : `${s.outages} outages`;
    const parts = [`${times}, ${formatDuration(s.downMinutes)} down in total`];
    if (s.outages > 1) parts.push(`longest ${formatDuration(s.longestMinutes)}`);
    if (s.stillDown && s.downSince) {
      parts.push(`down since ${s.downSinceIsLowerBound ? "before " : ""}${formatSwedishTime(s.downSince)}`);
    }
    return `<li><strong>${escapeHtml(s.displayName)}</strong> — ${escapeHtml(parts.join("; "))}</li>`;
  };

  const section = (title: string, list: DependencyOutageSummary[]): string =>
    list.length === 0 ? "" : `<h3 style="margin: 20px 0 8px; font-size: 15px;">${title}</h3><ul style="margin: 0; padding-left: 20px;">${list.map(item).join("")}</ul>`;

  const html = `<div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; color: #1a1a2e; line-height: 1.5;">
<p style="margin: 0 0 4px; font-size: 13px; color: #555;">${escapeHtml(formatSwedishTime(windowStart))} to ${escapeHtml(formatSwedishTime(windowEnd))} (Swedish time)</p>
<p>These are services run by other organisations — public registries, open data APIs and vendors — that some Strale tools read from. When one stops answering, Strale retries and pauses its own tests of the affected tools until it is back.</p>
<p><strong>Nothing here needs you.</strong> If one of these outages starts failing paying customers' calls, you get a separate email straight away.</p>
${section("Still down now", down)}
${section("Had outages, back now", recovered)}
<p style="margin-top: 24px; font-size: 12px; color: #777;">An outage here means the source failed at least two checks in a row; single missed checks are left out. Strale Health Monitor sends this once a day, and only on days something went down.</p>
</div>`;

  return { subject, html };
}

// ─── Compile + send (DB) ────────────────────────────────────────────────────

export const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
/** How far before the window to read, so an outage already running at the
 *  start of the window shows when it really began. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

function rowsOf(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows ?? []) as Record<string, unknown>[];
}

export async function loadProbeRows(windowStart: Date, windowEnd: Date): Promise<ProbeRow[]> {
  const db = getDb();
  const from = new Date(windowStart.getTime() - LOOKBACK_MS).toISOString();
  const to = windowEnd.toISOString();
  // Only dependencies that failed at least once are worth reading in full;
  // ~30k probe rows land per day and almost all of them are healthy.
  const result = await db.execute(sql`
    WITH flagged AS (
      SELECT DISTINCT details->>'dependency' AS dep
      FROM health_monitor_events
      WHERE event_type = 'dependency_probe'
        AND details->>'healthy' = 'false'
        AND created_at >= ${from}::timestamptz
        AND created_at < ${to}::timestamptz
    )
    SELECT details->>'dependency' AS dependency,
           created_at,
           (details->>'healthy') = 'true' AS healthy
    FROM health_monitor_events
    WHERE event_type = 'dependency_probe'
      AND created_at >= ${from}::timestamptz
      AND created_at < ${to}::timestamptz
      AND details->>'dependency' IN (SELECT dep FROM flagged)
    ORDER BY created_at
  `);
  return rowsOf(result).map((r) => ({
    dependency: String(r.dependency),
    at: new Date(r.created_at as string | Date),
    healthy: r.healthy === true,
  }));
}

export interface ExternalOutageDigestResult {
  sent: boolean;
  reason: "sent" | "nothing_to_report" | "email_not_configured" | "preview";
  subject: string | null;
  html: string | null;
  summaries: DependencyOutageSummary[];
}

/** A missed day is caught up, but never more than this far back. */
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Where the previous summary's window ended, so consecutive summaries neither
 * overlap nor leave a gap when one is sent at 08:01 and the next at 11:50, or
 * when a send failed (a failed send records nothing, so the next run covers
 * its period). Null when no summary has run yet.
 */
async function loadLastWindowEnd(): Promise<Date | null> {
  const result = await getDb().execute(sql`
    SELECT details->>'window_end' AS window_end
    FROM health_monitor_events
    WHERE event_type = 'external_outage_digest'
      AND created_at >= now() - interval '3 days'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const value = rowsOf(result)[0]?.window_end;
  const d = typeof value === "string" ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export function digestWindowStart(now: Date, lastWindowEnd: Date | null): Date {
  if (!lastWindowEnd || lastWindowEnd >= now) return new Date(now.getTime() - DIGEST_WINDOW_MS);
  return new Date(Math.max(lastWindowEnd.getTime(), now.getTime() - MAX_WINDOW_MS));
}

/**
 * Build the summary for the period since the previous one (normally the 24
 * hours before `now`) and send it, unless nothing went down — then no email at
 * all. `previewOnly` builds without sending or recording.
 */
export async function sendExternalOutageDigest(
  now: Date = new Date(),
  opts: { previewOnly?: boolean } = {},
): Promise<ExternalOutageDigestResult> {
  const windowEnd = now;
  const windowStart = digestWindowStart(now, await loadLastWindowEnd());
  const summaries = summarizeExternalOutages(await loadProbeRows(windowStart, windowEnd), windowStart, windowEnd);

  if (summaries.length === 0) {
    // A preview must not record: the next real run starts its window at the
    // last recorded window_end, so a recorded preview would drop the hours
    // before it from the next morning's email.
    if (!opts.previewOnly) await recordRun(false, "nothing_to_report", summaries, windowStart, windowEnd);
    return { sent: false, reason: "nothing_to_report", subject: null, html: null, summaries };
  }

  const { subject, html } = renderExternalOutageDigest(summaries, windowStart, windowEnd);
  if (opts.previewOnly) return { sent: false, reason: "preview", subject, html, summaries };

  const { sendDigestEmail, isEmailConfigured } = await import("./digest-sender.js");
  if (!isEmailConfigured()) {
    logWarn("external-outage-digest-not-configured", "email not configured; daily outage summary not sent");
    await recordRun(false, "email_not_configured", summaries, windowStart, windowEnd);
    return { sent: false, reason: "email_not_configured", subject, html, summaries };
  }

  await sendDigestEmail(html, subject);
  log.info({ label: "external-outage-digest-sent", dependencies: summaries.length }, "external-outage-digest-sent");
  await recordRun(true, "sent", summaries, windowStart, windowEnd);
  return { sent: true, reason: "sent", subject, html, summaries };
}

async function recordRun(
  sent: boolean,
  reason: string,
  summaries: DependencyOutageSummary[],
  windowStart: Date,
  windowEnd: Date,
): Promise<void> {
  await logHealthEvent({
    eventType: "external_outage_digest",
    tier: 1,
    actionTaken: sent
      ? `Daily outside-source summary sent: ${summaries.length} with outages`
      : `Daily outside-source summary not sent: ${reason}`,
    details: {
      sent,
      reason,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      dependencies: summaries.map((s) => ({
        dependency: s.dependency,
        outages: s.outages,
        down_minutes: s.downMinutes,
        still_down: s.stillDown,
      })),
    },
  });
}

// ─── Schedule ───────────────────────────────────────────────────────────────

/** Sent on the first scheduler pass from 08:00 Swedish time. The window closes
 *  at noon so a 12h due-interval cannot fire a second time the same day. */
export const DIGEST_SEND_HOUR_START = 8;
export const DIGEST_SEND_HOUR_END = 12;
export const DIGEST_DUE_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function isDigestSendHour(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: TZ }).format(now),
  );
  return hour >= DIGEST_SEND_HOUR_START && hour < DIGEST_SEND_HOUR_END;
}
