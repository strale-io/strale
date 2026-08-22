/**
 * Commercial intelligence — the business read, not the numbers.
 *
 * `metrics.ts` answers "how much revenue, over what window, from a population
 * old enough to ask". That was enough while the only question was whether the
 * total was moving. It is not enough now: on 2026-08-22 revenue rose for the
 * second consecutive completed week while one buyer accounted for 99.3% of the
 * income. A daily report that stops at "€56.89, a record" describes an improving
 * business. The two figures together describe a single-customer dependency,
 * which is the opposite conclusion and the one that ranks the work.
 *
 * The "€56.89 record" and the "fourth consecutive week" that this docstring
 * originally cited are both instructive mistakes. The first is the week still in
 * progress, so it is not a record of anything yet; the second counted that
 * partial week as a rise and read four data points as four transitions. This
 * module returns "second" on the same series, which is how the error was
 * caught.
 *
 * So this module computes the twelve commercial questions DAILY-RUN.md lists,
 * and — the part that matters — turns them into stated conclusions. A caller
 * that renders `conclusions` cannot accidentally publish a table of numbers
 * with no reading attached, because the reading is what it gets.
 *
 * Everything here obeys the same contract as `metrics.ts`: canonical
 * populations, declared instrument ages, `Measurement<T>` with no value on the
 * unavailable arm, and ISO strings at every bind site (a `Date` reaching a
 * `sql` template throws at bind time — the PR-43 defect, DEC-20260504-A).
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import type { Measurement, Window } from "./types.js";
import { coversWindow, evidenceFor } from "./instruments.js";
import { externalCustomers } from "./populations.js";
import { ACTOR_KEY_SQL } from "./actor-identity.js";

/** ISO strings only. See the module docstring. */
function iso(d: Date): string {
  return d.toISOString();
}

async function rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  return (await getDb().execute(q)) as unknown as T[];
}

// ─── discrete weeks ────────────────────────────────────────────────────────

export interface DiscreteWeek {
  /** ISO week start (Monday) as YYYY-MM-DD. */
  startsOn: string;
  cents: number;
  /**
   * Every completed external call in the week, free-tier included. NOT the
   * same denominator as `PayerFacts.calls`, which counts paid calls only —
   * printing the two adjacent without saying so invites a wrong ratio.
   */
  calls: number;
  /** True for the week currently in progress — it is not comparable yet. */
  partial: boolean;
  /** Days of the week that have elapsed, 1–7. */
  daysElapsed: number;
}

/**
 * Discrete ISO weeks, newest first.
 *
 * Rolling windows are the wrong instrument at this volume: on 2026-08-17 a
 * rolling 7d figure read as a 20% fall while every discrete week in the series
 * had risen, because one large day had just aged out. Both readings were
 * arithmetically correct and only one of them was about the business.
 *
 * The current week is returned with `partial: true` and its elapsed-day count,
 * so a caller cannot compare four elapsed days against seven and call the
 * difference a decline. `growth()` below refuses that comparison outright.
 */
export async function discreteWeeks(count = 5, now = new Date()): Promise<Measurement<DiscreteWeek[]>> {
  const guard = coversWindow("transaction_revenue", new Date(now.getTime() - count * 7 * 86_400_000));
  if (!guard.ok) {
    return {
      status: "unavailable",
      population: "external_customers",
      requestedWindow: { from: new Date(now.getTime() - count * 7 * 86_400_000), to: now, label: `last ${count} weeks` },
      reason: guard.absent
        ? { kind: "instrument_absent", instrument: "transaction_revenue" }
        : { kind: "instrument_too_young", instrument: "transaction_revenue", enabledAt: guard.enabledAt },
    };
  }
  const from = startOfIsoWeek(new Date(now.getTime() - (count - 1) * 7 * 86_400_000));
  const r = await rows<{ wk: string; cents: string; calls: string }>(sql`
    SELECT to_char(date_trunc('week', t.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS wk,
           COALESCE(SUM(t.price_cents), 0)::int AS cents,
           COUNT(*)::int AS calls
    FROM transactions t
    WHERE t.status = 'completed'
      AND t.created_at >= ${iso(from)} AND t.created_at <= ${iso(now)}
      AND ${externalCustomers("t")}
    GROUP BY 1 ORDER BY 1 DESC`);
  const currentWeek = isoDate(startOfIsoWeek(now));
  const byWeek = new Map(r.map((x) => [x.wk, x]));
  // Densify. A week with no external traffic produces no GROUP BY row, and
  // `growth()` would then treat two weeks either side of the gap as adjacent —
  // reporting a week-on-week rise between weeks three apart. A missing bucket
  // genuinely means zero revenue, so filling it is both honest and what makes
  // the adjacency assumption downstream true rather than merely usual.
  const value: DiscreteWeek[] = [];
  for (let i = 0; i < count; i++) {
    const wk = isoDate(new Date(startOfIsoWeek(now).getTime() - i * 7 * 86_400_000));
    const hit = byWeek.get(wk);
    value.push({
      startsOn: wk,
      cents: Number(hit?.cents ?? 0),
      calls: Number(hit?.calls ?? 0),
      partial: wk === currentWeek,
      daysElapsed: wk === currentWeek ? elapsedDaysInIsoWeek(now) : 7,
    });
  }
  if (r.length === 0) {
    return {
      status: "unavailable", population: "external_customers",
      requestedWindow: { from, to: now, label: `last ${count} weeks` },
      reason: { kind: "no_data" },
    };
  }
  return {
    status: "observed", value,
    window: { from, to: now, label: `${value.length} discrete ISO weeks` },
    population: "external_customers",
    instruments: evidenceFor(["transaction_revenue"]),
  };
}

export function startOfIsoWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // getUTCDay: 0=Sunday. ISO weeks start Monday, so Sunday is day 7.
  const dow = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - (dow - 1));
  return x;
}

export function elapsedDaysInIsoWeek(now: Date): number {
  const start = startOfIsoWeek(now);
  return Math.min(7, Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type GrowthVerdict =
  | { kind: "rising"; consecutive: number; latestFullCents: number; priorCents: number }
  | { kind: "falling"; consecutive: number; latestFullCents: number; priorCents: number }
  | { kind: "flat"; latestFullCents: number; priorCents: number }
  | { kind: "not_comparable"; why: string };

/**
 * Growth as a direction with a reason, never as a bare percentage.
 *
 * Two refusals are deliberate:
 *  - a partial week is never compared against a full one, in either direction.
 *    A record-breaking partial week is still not evidence of growth, and a
 *    partial week below last week's total is not evidence of decline;
 *  - "rising" requires the run of full weeks, so one good week after three bad
 *    ones reports as one week up, not as growth.
 */
export function growth(weeks: DiscreteWeek[]): GrowthVerdict {
  const full = weeks.filter((w) => !w.partial);
  if (full.length < 2) {
    return {
      kind: "not_comparable",
      why: "fewer than two completed weeks of data — the week in progress is not comparable to a finished one",
    };
  }
  // weeks arrive newest-first.
  const [latest, prior] = full;
  if (latest!.cents === prior!.cents) {
    return { kind: "flat", latestFullCents: latest!.cents, priorCents: prior!.cents };
  }
  const rising = latest!.cents > prior!.cents;
  let consecutive = 0;
  for (let i = 0; i + 1 < full.length; i++) {
    const higher = full[i]!.cents > full[i + 1]!.cents;
    if (higher !== rising) break;
    consecutive++;
  }
  return rising
    ? { kind: "rising", consecutive, latestFullCents: latest!.cents, priorCents: prior!.cents }
    : { kind: "falling", consecutive, latestFullCents: latest!.cents, priorCents: prior!.cents };
}

// ─── payers ────────────────────────────────────────────────────────────────

export interface PayerFacts {
  /** Stable key per payer — a user id, or a keyed hash of the wallet. */
  key: string;
  cents: number;
  calls: number;
  /** Distinct UTC days on which this payer bought, inside the window. */
  activeDays: number;
  firstSeen: string;
  lastSeen: string;
  /** First purchase inside the window, by slug — what activated them. */
  firstSlugInWindow: string | null;
}

export interface Concentration {
  payers: number;
  /** True when the window is a week still in progress. Blocks comparison. */
  partialWindow: boolean;
  topShare: number;
  topCents: number;
  othersCents: number;
  unattributedCents: number;
  /** Null while the identity instrument is younger than the lookback. */
  newPayers: number | null;
  /** Keys of the payers counted as new — feeds `activatingSlugs`. */
  newPayerKeys: Set<string>;
  returningPayers: number | null;
  repeatPayers: number;
  /** Whether the largest payer is one of the repeaters. */
  topPayerRepeats: boolean;
  repeatPayersExcludingTop: number;
  activePayingDays: number;
  /** Share of revenue in the window that resolves to a payer at all, 0-1. */
  attributedShare: number;
  /**
   * Whether this window's `topShare` may be compared against another window's.
   *
   * False when the identity instrument is younger than the window, or when too
   * much revenue is unattributed. Both make `topShare` a share of whatever
   * happened to be visible rather than of the business, and comparing two such
   * figures produces a movement that is entirely an artefact of coverage.
   * Measured on the first production run of this module: the current week read
   * 99.3% against a prior week's 19.0%, and the prior week's figure was one
   * payer divided by five days of revenue nothing had been recording.
   */
  comparable: boolean;
}

/**
 * Who paid, how much, and how often — the population every concentration and
 * repeat question is answered from.
 *
 * `topShare` divides by ALL external revenue including the unattributed part.
 * Dividing by the attributed slice turns "one wallet, plus money we cannot yet
 * trace" into a confident 100%, which is the shape of the 2026-08-15 "one
 * paying customer" error.
 */
export interface PayerPopulation {
  payers: PayerFacts[];
  /** Revenue in the window that resolves to no payer at all. */
  unattributedCents: number;
}

export async function payerFacts(w: Window): Promise<Measurement<PayerPopulation>> {
  const r = await rows<{
    actor_key: string | null; cents: string; calls: string; active_days: string;
    first_seen: string; last_seen: string; first_slug: string | null;
  }>(sql`
    WITH paid AS (
      SELECT ${sql.raw(ACTOR_KEY_SQL)} AS actor_key,
             t.price_cents, t.created_at,
             COALESCE(t.solution_slug, c.slug) AS slug
      FROM transactions t
      LEFT JOIN capabilities c ON c.id = t.capability_id
      WHERE t.status = 'completed' AND t.price_cents > 0
        AND t.created_at >= ${iso(w.from)} AND t.created_at <= ${iso(w.to)}
        AND ${externalCustomers("t")}
    )
    SELECT actor_key,
           COALESCE(SUM(price_cents), 0)::int AS cents,
           COUNT(*)::int AS calls,
           COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date)::int AS active_days,
           MIN(created_at) AS first_seen,
           MAX(created_at) AS last_seen,
           (ARRAY_AGG(slug ORDER BY created_at ASC))[1] AS first_slug
    FROM paid GROUP BY 1`);
  const identified = r.filter((x) => x.actor_key !== null);
  if (identified.length === 0) {
    return {
      status: "unavailable", population: "external_customers", requestedWindow: w,
      reason: { kind: "no_data" },
    };
  }
  const payers = identified.map((x) => ({
    key: x.actor_key!,
    cents: Number(x.cents),
    calls: Number(x.calls),
    activeDays: Number(x.active_days),
    firstSeen: x.first_seen,
    lastSeen: x.last_seen,
    firstSlugInWindow: x.first_slug,
  }));
  const guard = coversWindow("x402_payer_identity", w.from);
  const unattributed = r.filter((x) => x.actor_key === null).reduce((a, x) => a + Number(x.cents), 0);
  const base = {
    value: { payers, unattributedCents: unattributed },
    window: w, population: "external_customers" as const,
    instruments: evidenceFor(["x402_payer_identity"]),
    caveat: unattributed > 0
      ? `€${(unattributed / 100).toFixed(2)} of revenue in this period cannot be traced to any payer.`
      : undefined,
  };
  return guard.ok
    ? { status: "observed", ...base }
    : {
        status: "estimated", ...base,
        methodology:
          "A lower bound. Payer identity has only been recorded since " +
          (guard.enabledAt ? isoDate(guard.enabledAt) : "recently") +
          ", so buyers active earlier in this window are not counted",
      };
}

/**
 * Concentration and repeat, from the payer facts plus the history that decides
 * who is new.
 *
 * `returningPayers` is `null`, not 0, while the identity instrument is younger
 * than the lookback: nobody *can* have been seen before the instrument existed,
 * so a zero here would be a structural artefact presented as a finding.
 */
export async function concentration(
  w: Window,
  facts: PayerFacts[],
  unattributedCents: number,
  opts: { lookbackDays?: number; partialWindow?: boolean } = {},
): Promise<Concentration> {
  const lookbackDays = opts.lookbackDays ?? 90;
  const partialWindow = opts.partialWindow ?? false;
  const identifiedCents = facts.reduce((a, f) => a + f.cents, 0);
  const totalCents = identifiedCents + unattributedCents;
  const sorted = [...facts].sort((a, b) => b.cents - a.cents);
  const topCents = sorted[0]?.cents ?? 0;
  const lookbackFrom = new Date(w.from.getTime() - lookbackDays * 86_400_000);
  const guard = coversWindow("x402_payer_identity", lookbackFrom);

  const newPayerKeys = new Set(facts.map((f) => f.key));
  let returningPayers: number | null = null;
  let newPayers: number | null = null;
  if (facts.length > 0) {
    const prior = await rows<{ actor_key: string | null }>(sql`
      SELECT DISTINCT ${sql.raw(ACTOR_KEY_SQL)} AS actor_key
      FROM transactions t
      WHERE t.status = 'completed' AND t.price_cents > 0
        AND t.created_at >= ${iso(lookbackFrom)} AND t.created_at < ${iso(w.from)}
        AND ${externalCustomers("t")}`);
    const seen = new Set(prior.map((x) => x.actor_key).filter((k): k is string => k !== null));
    for (const f of facts) if (seen.has(f.key)) newPayerKeys.delete(f.key);
    // BOTH halves are gated, not just the pessimistic one. They sum to
    // `facts.length` by construction, so publishing `newPayers` while refusing
    // `returningPayers` states the same unmeasurable fact in its flattering
    // direction: before the instrument existed a returning buyer carries no
    // identity, is absent from `seen`, and therefore reads as brand new.
    returningPayers = guard.ok ? facts.length - newPayerKeys.size : null;
    newPayers = guard.ok ? newPayerKeys.size : null;
  }
  // "Days anyone paid us" is a union across payers, so it cannot be summed from
  // the per-payer counts without double-counting a day two buyers shared.
  const dayRows = await rows<{ n: string }>(sql`
    SELECT COUNT(DISTINCT (t.created_at AT TIME ZONE 'UTC')::date)::int AS n
    FROM transactions t
    WHERE t.status = 'completed' AND t.price_cents > 0
      AND t.created_at >= ${iso(w.from)} AND t.created_at <= ${iso(w.to)}
      AND ${externalCustomers("t")}`);
  const attributedShare = totalCents === 0 ? 0 : identifiedCents / totalCents;
  const topKey = sorted[0]?.key ?? null;
  const repeaters = facts.filter((f) => f.activeDays > 1);
  return {
    payers: facts.length,
    partialWindow,
    topShare: totalCents === 0 ? 0 : topCents / totalCents,
    attributedShare,
    // A partial window disqualifies comparison as surely as a young instrument
    // does. Two days of a week against a finished one is the same error
    // `growth()` refuses for revenue, and on a Monday it reads as a jump to
    // 100% concentration every single time.
    comparable:
      coversWindow("x402_payer_identity", w.from).ok && attributedShare >= 0.8 && !partialWindow,
    topCents,
    othersCents: identifiedCents - topCents,
    unattributedCents,
    newPayers,
    newPayerKeys,
    returningPayers,
    repeatPayers: repeaters.length,
    // Who repeated matters more than how many. A small buyer forming a habit is
    // the single signal we are looking for, and a bare count cannot tell it
    // apart from the big buyer simply buying again.
    topPayerRepeats: topKey !== null && repeaters.some((f) => f.key === topKey),
    repeatPayersExcludingTop: repeaters.filter((f) => f.key !== topKey).length,
    activePayingDays: Number(dayRows[0]?.n ?? 0),
  };
}

export interface QuietPayer { key: string; cents: number; lastSeen: string; daysQuiet: number }

/**
 * Payers who bought before the window and have not bought inside it.
 *
 * Deliberately not called "churn". At this volume a buyer who skips a week has
 * not left, and calling it churn would invite a retention response to a
 * scheduling artefact. `daysQuiet` is the number the reader should judge on.
 */
export async function quietPayers(
  w: Window, lookbackDays = 90, minCents = 20,
): Promise<Measurement<QuietPayer[]>> {
  const lookbackFrom = new Date(w.from.getTime() - lookbackDays * 86_400_000);
  const guard = coversWindow("x402_payer_identity", lookbackFrom);
  if (!guard.ok) {
    return {
      status: "unavailable", population: "external_customers", requestedWindow: w,
      availableWindow: guard.enabledAt
        ? { from: guard.enabledAt, to: w.to, label: `since ${isoDate(guard.enabledAt)}` }
        : undefined,
      reason: guard.absent
        ? { kind: "instrument_absent", instrument: "x402_payer_identity" }
        : { kind: "instrument_too_young", instrument: "x402_payer_identity", enabledAt: guard.enabledAt },
    };
  }
  const r = await rows<{ actor_key: string | null; cents: string; last_seen: string }>(sql`
    SELECT ${sql.raw(ACTOR_KEY_SQL)} AS actor_key,
           COALESCE(SUM(t.price_cents), 0)::int AS cents,
           MAX(t.created_at) AS last_seen
    FROM transactions t
    WHERE t.status = 'completed' AND t.price_cents > 0
      AND t.created_at >= ${iso(lookbackFrom)} AND t.created_at < ${iso(w.from)}
      AND ${externalCustomers("t")}
    GROUP BY 1`);
  const active = await rows<{ actor_key: string | null }>(sql`
    SELECT DISTINCT ${sql.raw(ACTOR_KEY_SQL)} AS actor_key
    FROM transactions t
    WHERE t.status = 'completed' AND t.price_cents > 0
      AND t.created_at >= ${iso(w.from)} AND t.created_at <= ${iso(w.to)}
      AND ${externalCustomers("t")}`);
  const stillHere = new Set(active.map((x) => x.actor_key).filter(Boolean));
  const value = r
    .filter((x) => x.actor_key !== null && !stillHere.has(x.actor_key) && Number(x.cents) >= minCents)
    .map((x) => ({
      key: x.actor_key!,
      cents: Number(x.cents),
      lastSeen: x.last_seen,
      daysQuiet: Math.floor((w.to.getTime() - new Date(x.last_seen).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.cents - a.cents);
  return {
    status: "observed", value, window: w, population: "external_customers",
    instruments: evidenceFor(["x402_payer_identity"]),
  };
}

// ─── the reading ───────────────────────────────────────────────────────────

export interface Conclusion {
  /** Which commercial question this answers. */
  topic: "trajectory" | "concentration" | "repeat" | "acquisition" | "attrition" | "coverage";
  /** One sentence, plain English, safe to put in front of a non-technical reader. */
  text: string;
  /** True when this is the single most important thing on the page today. */
  headline?: boolean;
}

export interface CommercialRead {
  weeks: DiscreteWeek[];
  growth: GrowthVerdict;
  concentration: Concentration | null;
  quiet: QuietPayer[] | null;
  activatingSlugs: Array<{ slug: string; payers: number }>;
  conclusions: Conclusion[];
}

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

/**
 * Turn the facts into the sentences a founder reads.
 *
 * This is the part the brief consumes. It is pure — no database, no clock — so
 * every rule below is directly testable against a constructed state, which is
 * how the concentration rule earns its keep: the case that matters is "revenue
 * up AND concentration up", and it has to be provable that this reads as bad
 * news rather than good.
 */
export function interpret(input: {
  weeks: DiscreteWeek[];
  growth: GrowthVerdict;
  concentration: Concentration | null;
  quiet: QuietPayer[] | null;
  activatingSlugs: Array<{ slug: string; payers: number }>;
  /**
   * Last period's largest-buyer share, and ONLY when both periods are
   * `comparable`. Passing an incomparable prior share is how a coverage
   * artefact becomes a narrative about the business — see `Concentration
   * .comparable`. The caller is responsible for the gate because only it knows
   * which prior window it drew from.
   */
  priorTopShare?: number | null;
}): Conclusion[] {
  const out: Conclusion[] = [];
  const { growth: g, concentration: c } = input;

  // 1. Trajectory.
  if (g.kind === "not_comparable") {
    out.push({ topic: "trajectory", text: `Revenue trend cannot be read yet: ${g.why}.` });
  } else if (g.kind === "rising") {
    out.push({
      topic: "trajectory",
      text: g.consecutive > 1
        ? `Revenue rose for the ${ordinal(g.consecutive)} week running, reaching ${eur(g.latestFullCents)} in the last completed week.`
        : `Revenue rose in the last completed week, ${eur(g.priorCents)} to ${eur(g.latestFullCents)}.`,
    });
  } else if (g.kind === "falling") {
    out.push({
      topic: "trajectory",
      text: g.consecutive > 1
        ? `Revenue fell for the ${ordinal(g.consecutive)} week running, down to ${eur(g.latestFullCents)} in the last completed week.`
        : `Revenue fell in the last completed week, ${eur(g.priorCents)} to ${eur(g.latestFullCents)}.`,
    });
  } else {
    out.push({ topic: "trajectory", text: `Revenue was flat across the last two completed weeks, at ${eur(g.latestFullCents)}.` });
  }

  if (!c) {
    out.push({
      topic: "coverage",
      text: "We cannot yet tell how many separate buyers this revenue came from, so none of it should be read as a customer count.",
      headline: true,
    });
    return out;
  }

  // 2. Concentration — and the rule that exists because of 2026-08-22.
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const rose = input.priorTopShare != null && c.topShare > input.priorTopShare + 0.005;
  const growing = g.kind === "rising";
  if (c.payers === 0) {
    // Not reachable from the shipped caller today — `payerFacts` returns
    // `unavailable` when nobody is identified, so the CLI routes to the `!c`
    // branch first. Kept because `interpret()` is exported and pure: any future
    // caller that builds a Concentration itself hits this, and the alternative
    // was `payers <= 1` emitting the genuine single-customer sentence for an
    // empty set, next to a coverage line contradicting it.
    out.push({
      topic: "coverage",
      text: "No payment in this period can be traced to a buyer, so nothing here supports any statement about how many customers we have.",
      headline: true,
    });
    return out;
  }
  if (c.payers === 1) {
    out.push({
      topic: "concentration",
      text: "Every euro we can trace came from a single buyer, so the business currently has one customer and one point of failure.",
      headline: true,
    });
  } else if (c.topShare >= 0.6) {
    out.push({
      topic: "concentration",
      text: growing && rose
        ? `Revenue is growing and the dependency is deepening at the same time: the largest buyer now accounts for ${pct(c.topShare)}, up from ${pct(input.priorTopShare!)}. We are selling more to the same customer, not acquiring customers.`
        : `The largest buyer accounts for ${pct(c.topShare)} of revenue — ${eur(c.topCents)} against ${eur(c.othersCents)} from everyone else combined. Losing them would remove most of the income.`,
      headline: true,
    });
  } else {
    out.push({
      topic: "concentration",
      text: `Revenue is spread across ${c.payers} buyers with the largest at ${pct(c.topShare)}, so no single customer can take most of it away.`,
    });
  }

  // 3. Acquisition, and where growth came from.
  if (c.newPayers === null) {
    out.push({
      topic: "acquisition",
      text: "Whether any of these buyers is new cannot be answered yet — we have not been able to recognise a returning buyer for long enough to tell a first purchase from a repeat one.",
    });
  } else if (c.newPayers > 0) {
    const slugs = input.activatingSlugs.slice(0, 3).map((s) => s.slug);
    out.push({
      topic: "acquisition",
      text: slugs.length > 0
        ? `${c.newPayers} buyer${c.newPayers === 1 ? "" : "s"} bought for the first time, arriving through ${slugs.join(", ")}.`
        : `${c.newPayers} buyer${c.newPayers === 1 ? "" : "s"} bought for the first time.`,
    });
  } else {
    out.push({ topic: "acquisition", text: "No new buyer appeared this period." });
  }
  if (growing && c.newPayers !== null && c.newPayers > 0 && c.topShare >= 0.9) {
    out.push({
      topic: "acquisition",
      text: "The new buyers are rounding error against the largest one — they add names, not income.",
    });
  }

  // 4. Repeat.
  if (c.repeatPayers === 0) {
    out.push({
      topic: "repeat",
      text: "Nobody bought on more than one day, so there is no evidence yet of anyone building us into a routine.",
    });
  } else if (c.repeatPayersExcludingTop > 0) {
    out.push({
      topic: "repeat",
      text: `${c.repeatPayersExcludingTop} buyer${c.repeatPayersExcludingTop === 1 ? "" : "s"} other than the largest came back on a later day, which is the first sign of a second habit forming.`,
    });
  } else if (c.topPayerRepeats) {
    out.push({
      topic: "repeat",
      text: "Only the largest buyer came back on a later day; nobody else has developed a pattern.",
    });
  } else {
    // The count says somebody repeated and it was not the biggest buyer's
    // doing. Saying "only the largest" here would invert the one signal we are
    // actually looking for.
    out.push({
      topic: "repeat",
      text: `${c.repeatPayers} buyer${c.repeatPayers === 1 ? "" : "s"} came back on a later day, and the largest buyer was not among them.`,
    });
  }

  // 5. Attrition.
  if (input.quiet && input.quiet.length > 0) {
    const worst = input.quiet[0]!;
    out.push({
      topic: "attrition",
      text: `${input.quiet.length} previously paying buyer${input.quiet.length === 1 ? " has" : "s have"} gone quiet; the largest of them spent ${eur(worst.cents)} and last bought ${worst.daysQuiet} days ago.`,
    });
  }

  // 6. Coverage — always last, because it qualifies everything above it.
  if (input.priorTopShare == null && c.payers > 1) {
    out.push({
      topic: "coverage",
      text: "How concentrated last period was cannot be measured on the same basis, so this week's spread is a first reading rather than a movement.",
    });
  }
  if (c.attributedShare < 1) {
    const share = 1 - c.attributedShare;
    if (share > 0.1) {
      out.push({
        topic: "coverage",
        text: `${pct(share)} of revenue cannot be traced to any buyer, so every customer count above is a floor rather than a total.`,
      });
    }
  }
  return out;
}

function ordinal(n: number): string {
  const names = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
  return names[n - 1] ?? `${n}th`;
}

/** Which capabilities or bundles were a new payer's first purchase. */
export function activatingSlugs(
  facts: PayerFacts[], newPayerKeys: Set<string>,
): Array<{ slug: string; payers: number }> {
  const counts = new Map<string, number>();
  for (const f of facts) {
    if (!newPayerKeys.has(f.key) || !f.firstSlugInWindow) continue;
    counts.set(f.firstSlugInWindow, (counts.get(f.firstSlugInWindow) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, payers]) => ({ slug, payers }))
    .sort((a, b) => b.payers - a.payers);
}
