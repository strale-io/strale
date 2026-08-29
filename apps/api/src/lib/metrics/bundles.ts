/**
 * Bundle (solution) sales — and the only question anyone has asked of them.
 *
 * Experiment E4 in GOALS.md bets that four growth bundles built on 2026-08-16
 * sell once they are payable. Its kill criterion is "zero external sales across
 * all four in 14 days on the rail", and it fires on 2026-09-01.
 *
 * On 2026-08-28 the run discovered that the criterion, taken literally, cannot
 * be evaluated honestly. The four had sold nothing — but `lead-email-verify`,
 * the healthy control the bet was written against, had also gone quiet in the
 * latest week. "These four do not sell" and "nobody is buying bundles at all"
 * produce identical evidence on the cohort alone, and only the first of them
 * justifies the conclusion E4 draws ("bundle demand does not generalise, and we
 * stop building them"). Acting on the wrong one costs a product line.
 *
 * So this module deliberately does NOT expose a "did the cohort sell" boolean.
 * It exposes the cohort *and its control together*, and a verdict type whose
 * `confounded` arm is a first-class outcome rather than an error. DAILY-RUN.md
 * requires the session closing E4 to "say which, or record that they could not
 * tell"; a measurement that cannot express "I could not tell" makes that
 * instruction unfollowable.
 *
 * **The trial window is counted to the day, never to the week.** The first
 * draft of this module compared week buckets and widened the trial start back
 * to its Monday, on the reasoning that admitting extra days could only make a
 * kill harder to reach. That reasoning is half true and the wrong half is the
 * dangerous one: extra pre-trial days do spare the *cohort*, but they also
 * credit the *control* with orders it took before the trial existed — which
 * makes the control look healthier and a `cohort_failed` verdict easier, not
 * harder. A bias that manufactures kills is precisely what this module was
 * written to prevent, so `ordersSince` is measured with a date predicate and
 * the week series is presentation only.
 *
 * Why a new module rather than another export in `commercial.ts`: every
 * revenue reading there joins `capabilities`, and bundle purchases carry
 * `solution_slug` with a NULL `capability_id`. Reading only the capability
 * join makes every bundle look delisted — GOALS.md records that doing so
 * "did so here for about a minute this morning". Keeping the bundle population
 * in its own file makes the different join explicit rather than a subtlety
 * inside a shared function.
 *
 * Same contract as the rest of `lib/metrics`: canonical population, declared
 * instrument age, `Measurement<T>` with no value on the unavailable arm, and
 * ISO strings at every bind site (a `Date` reaching a `sql` template throws at
 * bind time — the PR-43 defect, DEC-20260504-A).
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import type { Measurement, Window } from "./types.js";
import { coversWindow, evidenceFor } from "./instruments.js";
import { externalCustomers } from "./populations.js";
import { startOfIsoWeek, elapsedDaysInIsoWeek } from "./commercial.js";

function iso(d: Date): string {
  return d.toISOString();
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  return (await getDb().execute(q)) as unknown as T[];
}

/** The four bundles E4 is a bet about. Named here so no caller retypes them. */
export const E4_COHORT = [
  "competitor-read",
  "page-seo-check",
  "prospect-brief",
  "keyword-scout",
] as const;

/**
 * The bundle E4's kill criterion is implicitly measured against.
 *
 * E4's text calls it out by name — "bundle demand does not generalise beyond
 * `lead-email-verify`" — so the experiment already depends on this bundle's
 * health without ever having measured it. This constant makes that dependency
 * explicit and testable.
 */
export const E4_CONTROL = "lead-email-verify";

/** The day the four cohort bundles became payable over x402 (GOALS.md, E4). */
export const E4_TRIAL_FROM = "2026-08-18";

export interface BundleWeek {
  /** ISO week start (Monday) as YYYY-MM-DD. */
  startsOn: string;
  orders: number;
  cents: number;
  /** True for the week currently in progress — not comparable to a full one. */
  partial: boolean;
  daysElapsed: number;
}

export interface BundleSales {
  slug: string;
  /** Presentation only. The verdict never reads this — see the module note. */
  weeks: BundleWeek[];
  totalOrders: number;
  totalCents: number;
  /** Orders strictly since `trialFrom` 00:00Z, counted by date, not by week. */
  ordersSince: number;
  centsSince: number;
  /** ISO timestamp of the most recent external order, or null if never. */
  lastSaleAt: string | null;
}

/**
 * External bundle sales per discrete ISO week, newest week first, plus an
 * exact order count since `trialFrom`.
 *
 * `slugs` is the set to report. Bundles with no sales at all are returned with
 * zeroed weeks rather than omitted: E4's whole question is about absence, and
 * an absent row is indistinguishable from a slug that was never asked for.
 */
export async function bundleSales(
  slugs: readonly string[],
  opts: { trialFrom: string; weeks?: number; now?: Date },
): Promise<Measurement<BundleSales[]>> {
  const count = opts.weeks ?? 6;
  const now = opts.now ?? new Date();
  const from = startOfIsoWeek(new Date(now.getTime() - (count - 1) * 7 * 86_400_000));
  const trialFrom = new Date(`${opts.trialFrom}T00:00:00.000Z`);
  const requestedWindow: Window = { from, to: now, label: `${count} discrete ISO weeks` };

  const guard = coversWindow("transaction_revenue", from);
  if (!guard.ok) {
    return {
      status: "unavailable",
      population: "external_customers",
      requestedWindow,
      reason: guard.absent
        ? { kind: "instrument_absent", instrument: "transaction_revenue" }
        : { kind: "instrument_too_young", instrument: "transaction_revenue", enabledAt: guard.enabledAt },
    };
  }

  if (slugs.length === 0) {
    return { status: "unavailable", population: "external_customers", requestedWindow, reason: { kind: "no_data" } };
  }

  // OR-chain rather than `= ANY(array)`: a JS array does not bind as a Postgres
  // array through drizzle's sql template. Same reasoning as
  // `populations.externalCustomers`, and the same bug four times before that.
  const slugMatch = sql.join(slugs.map((s) => sql`t.solution_slug = ${s}`), sql` OR `);

  // One pass. `orders_since` is a filtered aggregate over the same rows rather
  // than a second query, so the week series and the trial count can never be
  // read from two different snapshots of a table that is still being written.
  const r = await rows<{
    slug: string; wk: string; orders: string; cents: string; last_at: string;
    orders_since: string; cents_since: string;
  }>(sql`
    SELECT t.solution_slug AS slug,
           to_char(date_trunc('week', t.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS wk,
           COUNT(*)::int AS orders,
           COALESCE(SUM(t.price_cents), 0)::int AS cents,
           MAX(t.created_at)::text AS last_at,
           COUNT(*) FILTER (WHERE t.created_at >= ${iso(trialFrom)})::int AS orders_since,
           COALESCE(SUM(t.price_cents) FILTER (WHERE t.created_at >= ${iso(trialFrom)}), 0)::int AS cents_since
    FROM transactions t
    WHERE t.status = 'completed'
      AND t.solution_slug IS NOT NULL
      AND (${slugMatch})
      AND t.created_at >= ${iso(from)} AND t.created_at <= ${iso(now)}
      AND ${externalCustomers("t")}
    GROUP BY 1, 2`);

  const currentWeek = isoDate(startOfIsoWeek(now));
  const weekStarts: string[] = [];
  for (let i = 0; i < count; i++) {
    weekStarts.push(isoDate(new Date(startOfIsoWeek(now).getTime() - i * 7 * 86_400_000)));
  }

  const byKey = new Map(r.map((x) => [`${x.slug}|${x.wk}`, x]));
  const value: BundleSales[] = slugs.map((slug) => {
    const weeks: BundleWeek[] = weekStarts.map((wk) => {
      const hit = byKey.get(`${slug}|${wk}`);
      return {
        startsOn: wk,
        orders: Number(hit?.orders ?? 0),
        cents: Number(hit?.cents ?? 0),
        partial: wk === currentWeek,
        daysElapsed: wk === currentWeek ? elapsedDaysInIsoWeek(now) : 7,
      };
    });
    const mine = r.filter((x) => x.slug === slug);
    return {
      slug,
      weeks,
      totalOrders: weeks.reduce((a, w) => a + w.orders, 0),
      totalCents: weeks.reduce((a, w) => a + w.cents, 0),
      ordersSince: mine.reduce((a, x) => a + Number(x.orders_since), 0),
      centsSince: mine.reduce((a, x) => a + Number(x.cents_since), 0),
      lastSaleAt: mine.length ? mine.map((x) => x.last_at).sort().at(-1)! : null,
    };
  });

  return {
    status: "observed",
    value,
    window: requestedWindow,
    population: "external_customers",
    instruments: evidenceFor(["transaction_revenue"]),
  };
}

/**
 * The verdict E4 actually needs.
 *
 * `confounded` is not a failure of the measurement — it is the honest answer
 * whenever the cohort's silence is indistinguishable from the control's. It is
 * listed first here because it is the arm every naive implementation omits.
 */
export type CohortVerdict =
  | {
      kind: "confounded";
      /** Both the cohort and its control sold nothing in the trial window. */
      controlSlug: string;
      /** What the control managed before the trial — its demonstrated health. */
      controlOrdersBefore: number;
      why: string;
    }
  | {
      kind: "cohort_failed";
      /** The cohort sold nothing while the control kept selling. */
      controlSlug: string;
      controlOrdersInTrial: number;
      why: string;
    }
  | {
      kind: "cohort_selling";
      orders: number;
      cents: number;
      why: string;
    };

/**
 * Decide whether a cohort's zero sales mean the cohort failed.
 *
 * The rule, and the only one that matters: **a cohort cannot be killed on
 * silence that its control also exhibits.** If the control sold nothing in the
 * trial window either, no evidence in this data separates "these four are
 * unwanted" from "no bundle sold this fortnight", and the verdict says so.
 *
 * Both arms read `ordersSince`, which `bundleSales` counts by date. Nothing
 * here does week arithmetic; see the module note on why that mattered.
 */
export function cohortVerdict(input: {
  cohort: readonly string[];
  controlSlug: string;
  sales: BundleSales[];
  /** ISO date (YYYY-MM-DD) the cohort became purchasable — for the wording. */
  trialFrom: string;
}): CohortVerdict {
  const cohortRows = input.sales.filter((b) => input.cohort.includes(b.slug));
  const cohortOrders = cohortRows.reduce((a, b) => a + b.ordersSince, 0);
  const cohortCents = cohortRows.reduce((a, b) => a + b.centsSince, 0);

  if (cohortOrders > 0) {
    return {
      kind: "cohort_selling",
      orders: cohortOrders,
      cents: cohortCents,
      why: `The cohort took ${cohortOrders} external order(s) since ${input.trialFrom}, so the bet is not dead.`,
    };
  }

  const control = input.sales.find((b) => b.slug === input.controlSlug);
  const controlInTrial = control?.ordersSince ?? 0;
  // Health before the trial: everything in the reported weeks minus the part
  // inside the trial. A missing control row reads as zero, which routes to
  // `confounded` — the safe reading is "we have no control", never "the
  // control is fine".
  const controlBefore = control ? control.totalOrders - control.ordersSince : 0;

  if (controlInTrial === 0) {
    return {
      kind: "confounded",
      controlSlug: input.controlSlug,
      controlOrdersBefore: controlBefore,
      why:
        `The cohort sold nothing since ${input.trialFrom} — but so did ${input.controlSlug}, ` +
        `which took ${controlBefore} order(s) before it. Bundle demand fell away generally, ` +
        `so nothing here separates "these bundles are unwanted" from "no bundle sold in this period".`,
    };
  }

  return {
    kind: "cohort_failed",
    controlSlug: input.controlSlug,
    controlOrdersInTrial: controlInTrial,
    why:
      `The cohort sold nothing since ${input.trialFrom} while ${input.controlSlug} took ` +
      `${controlInTrial} order(s) over the same period. Buyers were still buying bundles; they did not buy these.`,
  };
}
