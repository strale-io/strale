/** Founder revenue roadmap, week 1: private aggregate business reporting. */
import { eq, sql } from "drizzle-orm";
import { getDb, withDatabase } from "../db/index.js";
import { businessSummaryDeliveries } from "../db/schema.js";
import { discreteWeeks, growth, payerFacts, startOfIsoWeek, type DiscreteWeek } from "./metrics/commercial.js";
import { revenueCents, topSellers } from "./metrics/metrics.js";
import { externalCustomers } from "./metrics/populations.js";
import type { Window } from "./metrics/types.js";
import { isEmailConfigured, preparePrivateDigestEmail, sendPrivateDigestEmail, type PrivateDigestEnvelope } from "./digest-sender.js";
import { registerJobSync } from "./job-coordinator.js";

const DAY = 86_400_000;
const TZ = "Europe/Stockholm";

export function businessReportDay(now: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  if (Number(part("hour")) < 8) return null;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export interface PeriodSummary {
  from: string;
  to: string;
  revenue_cents: number | null;
  payers: number | null;
  top_share: number | null;
  other_identified_payers_cents: number | null;
  unattributed_cents: number | null;
  repeat_payers: number | null;
  repeat_payer_revenue_cents: number | null;
  identity_status: string;
}

export interface BusinessSummary {
  report_day: string;
  daily: PeriodSummary;
  last_completed_week: PeriodSummary;
  completed_weeks: DiscreteWeek[];
  growth: ReturnType<typeof growth>;
  daily_activity: {
    settled_x402_calls: number;
    settled_x402_revenue_cents: number;
    completed_paid_calls: number;
    failed_priced_attempts: number;
    anonymous_free_calls: number;
    anonymous_free_ip_hashes: number;
  };
  top_tools: { slug: string; calls: number; cents: number }[];
}

async function summarizePeriod(window: Window): Promise<PeriodSummary> {
  const [revenue, population] = await Promise.all([revenueCents(window), payerFacts(window)]);
  const facts = population.status === "unavailable" ? null : population.value;
  const sorted = [...(facts?.payers ?? [])].sort((a, b) => b.cents - a.cents);
  const total = revenue.status === "unavailable" ? null : revenue.value;
  const identified = sorted.reduce((sum, p) => sum + p.cents, 0);
  return {
    from: window.from.toISOString(), to: window.to.toISOString(), revenue_cents: total,
    payers: facts ? sorted.length : total === 0 ? 0 : null,
    top_share: facts && population.status === "observed" && total !== null && total > 0 ? sorted[0]!.cents / total : null,
    other_identified_payers_cents: facts ? identified - (sorted[0]?.cents ?? 0) : total === 0 ? 0 : null,
    unattributed_cents: facts ? facts.unattributedCents : total,
    repeat_payers: facts ? sorted.filter((p) => p.activeDays > 1).length : total === 0 ? 0 : null,
    repeat_payer_revenue_cents: facts ? sorted.filter((p) => p.activeDays > 1).reduce((sum, p) => sum + p.cents, 0) : total === 0 ? 0 : null,
    identity_status: population.status,
  };
}

/** Same complete UTC ISO week and metric functions as commercial-brief.ts.
 * Payer keys, inputs, outputs and source-tag strings never leave this collector. */
export async function collectBusinessSummary(reportDay: string): Promise<BusinessSummary> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDay)) throw new Error("Invalid business report date");
  const end = new Date(`${reportDay}T00:00:00.000Z`);
  if (!Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== reportDay) throw new Error("Invalid business report date");
  const from = new Date(end.getTime() - DAY);
  const dailyWindow = { from, to: new Date(end.getTime() - 1), label: "previous complete UTC day" };
  const weekEnd = startOfIsoWeek(end);
  const weeklyWindow = { from: new Date(weekEnd.getTime() - 7 * DAY), to: new Date(weekEnd.getTime() - 1), label: "last completed UTC ISO week" };
  const [daily, weekly, weeks, sellers, activity] = await Promise.all([
    summarizePeriod(dailyWindow), summarizePeriod(weeklyWindow), discreteWeeks(6, end), topSellers(dailyWindow),
    getDb().execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE t.status = 'completed' AND t.x402_settlement_id IS NOT NULL)::int AS settled_x402_calls,
        COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'completed' AND t.x402_settlement_id IS NOT NULL), 0)::int AS settled_x402_revenue_cents,
        COUNT(*) FILTER (WHERE t.status = 'completed' AND t.price_cents > 0)::int AS completed_paid_calls,
        COUNT(*) FILTER (WHERE t.status = 'failed' AND t.price_cents > 0)::int AS failed_priced_attempts,
        COUNT(*) FILTER (WHERE t.status = 'completed' AND t.is_free_tier = true AND t.user_id IS NULL)::int AS anonymous_free_calls,
        COUNT(DISTINCT t.client_ip_hash) FILTER (WHERE t.status = 'completed' AND t.is_free_tier = true AND t.user_id IS NULL)::int AS anonymous_free_ip_hashes
      FROM transactions t
      WHERE t.created_at >= ${from.toISOString()} AND t.created_at < ${end.toISOString()}
        AND ${externalCustomers("t")}`),
  ]);
  const completed = weeks.status === "unavailable" ? [] : weeks.value.filter((w) => !w.partial);
  const a = (activity as unknown as BusinessSummary["daily_activity"][])[0]!;
  return {
    report_day: reportDay, daily, last_completed_week: weekly, completed_weeks: completed, growth: growth(completed),
    daily_activity: a,
    top_tools: sellers.status === "unavailable" ? [] : sellers.value.map(({ slug, calls, cents }) => ({ slug, calls, cents })),
  };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const euro = (c: number | null) => c === null ? "Unavailable" : `€${(c / 100).toFixed(2)}`;
const count = (n: number | null) => n === null ? "Unavailable" : String(n);
const percent = (n: number | null) => n === null ? "Unavailable" : `${(n * 100).toFixed(1)}%`;
function localTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function renderBusinessSummary(summary: BusinessSummary): { subject: string; html: string } {
  const row = (label: string, value: string) => `<tr><th align="left">${escape(label)}</th><td>${escape(value)}</td></tr>`;
  const period = (title: string, p: PeriodSummary, repeats: boolean) => `<h2>${title}</h2><p>${escape(localTime(p.from))} to ${escape(localTime(p.to))} (Stockholm time; UTC accounting boundary).</p><table>${
    row("Revenue from completed calls", euro(p.revenue_cents)) + row("Distinct paying identities", count(p.payers)) +
    row("Largest payer's revenue share", percent(p.top_share)) + row("Revenue from other identified payers", euro(p.other_identified_payers_cents)) +
    row("Revenue without a payer identity", euro(p.unattributed_cents)) +
    (repeats ? row("Payers active on more than one day", count(p.repeat_payers)) + row("Revenue from those repeat payers", euro(p.repeat_payer_revenue_cents)) : "")
  }</table><p>Identity measurement: ${escape(p.identity_status)}. A wallet or account is not necessarily one person.</p>`;
  const a = summary.daily_activity;
  const [latest, prior] = summary.completed_weeks;
  const trend = summary.growth.kind === "not_comparable" || !latest || !prior
    ? "Fewer than two complete weeks are available; no week-to-week comparison."
    : `Completed week starting ${latest.startsOn}: ${euro(latest.cents)}, compared with ${euro(prior.cents)} for the week starting ${prior.startsOn}. ` +
      (summary.growth.kind === "flat" ? "Revenue was unchanged." : `Revenue ${summary.growth.kind === "rising" ? "increased" : "decreased"} compared with the prior completed week.`);
  return {
    subject: `Strale business summary — ${summary.report_day}: ${euro(summary.daily.revenue_cents)}`,
    html: `<main><h1>Strale daily business summary</h1>${period("Previous complete day", summary.daily, false)}${period("Last completed week", summary.last_completed_week, true)}<p>${escape(trend)} The current partial week is excluded.</p><h2>Previous day's activity</h2><table>${
      row("Completed paid calls", String(a.completed_paid_calls)) + row("Failed attempts at a priced tool", String(a.failed_priced_attempts)) +
      row("Completed calls with x402 settlement", String(a.settled_x402_calls)) + row("Revenue on those x402 calls", euro(a.settled_x402_revenue_cents)) +
      row("Completed anonymous free calls", String(a.anonymous_free_calls)) + row("Distinct anonymous free IP hashes", String(a.anonymous_free_ip_hashes))
    }</table><p>Failed priced attempts are not charges and may include caller-input errors. Free IP hashes are not people; shared networks and missing hashes limit this count. Internal accounts and health probes are excluded.</p><h2>Top tools by daily revenue</h2><ul>${summary.top_tools.map((t) => `<li>${escape(t.slug)}: ${euro(t.cents)}, ${t.calls} paid calls</li>`).join("") || "<li>No recorded paid tool sales.</li>"}</ul><p>Revenue is completed-call revenue in EUR, not deposits, profit or a currency conversion. No customer identities or tool inputs appear in this summary.</p></main>`,
  };
}

/** Persist the immutable email before delivery. Retrying after a provider
 * success and DB failure must use the identical body and idempotency key. */
async function preparedEmail(day: string, now: Date): Promise<{ message: PrivateDigestEnvelope; prepared_at: string } | null> {
  return getDb().transaction(async (db) => {
    // Short transaction only; never holds a transaction across email delivery.
    await db.execute(sql`SELECT pg_advisory_xact_lock(19661110)`);
    const existing = await db.execute(sql`
      SELECT payload, sent_at FROM business_summary_deliveries WHERE report_day = ${day}::date`);
    const prepared = (existing as unknown as { payload: { message: PrivateDigestEnvelope; prepared_at: string }; sent_at: string | null }[])[0];
    if (prepared?.sent_at) return null;
    if (prepared) return prepared.payload;
    const summary = await withDatabase(db, () => collectBusinessSummary(day));
    const rendered = renderBusinessSummary(summary);
    const email = { message: preparePrivateDigestEmail(rendered.html, rendered.subject), prepared_at: now.toISOString() };
    await db.insert(businessSummaryDeliveries).values({ reportDay: day, payload: email });
    return email;
  });
}

export async function sendBusinessSummary(now = new Date()): Promise<{ outcome: "completed" | "not_due" | "already_sent" }> {
  const day = businessReportDay(now);
  if (!day) return { outcome: "not_due" };
  // Financial reports must have an explicitly configured private recipient.
  if (!isEmailConfigured() || !process.env.HEALTH_DIGEST_EMAIL) throw new Error("Business summary email is not configured");
  const email = await preparedEmail(day, now);
  if (!email) return { outcome: "already_sent" };
  if (now.getTime() - new Date(email.prepared_at).getTime() >= DAY) throw new Error("Business summary delivery needs reconciliation");
  await sendPrivateDigestEmail(email.message, `strale-business-summary-${day}`);
  // Dedicated private table: health_monitor_events is publicly readable.
  // Propagate a receipt-write failure so the coordinator retries the same email.
  // Commit acceptance and its original success timestamp atomically. A later
  // coordinator failure must not leave a delivered report without a heartbeat.
  const acceptedAt = new Date();
  await getDb().transaction(async (db) => {
    await db.update(businessSummaryDeliveries).set({ sentAt: acceptedAt }).where(eq(businessSummaryDeliveries.reportDay, day));
    await db.execute(sql`
      INSERT INTO job_schedule (job_name, interval_ms, next_run_at, last_finished_at, last_outcome)
      VALUES ('heartbeat:business-summary', ${DAY}, now(), ${acceptedAt.toISOString()}::timestamptz, 'ok')
      ON CONFLICT (job_name) DO UPDATE SET
        last_finished_at = GREATEST(job_schedule.last_finished_at, EXCLUDED.last_finished_at), last_outcome = 'ok'`);
  });
  return { outcome: "completed" };
}

export function startBusinessSummary(): void {
  registerJobSync({ name: "business-summary", intervalMs: 60 * 60 * 1000, startupDelayMs: 60_000, handler: () => sendBusinessSummary() });
}
