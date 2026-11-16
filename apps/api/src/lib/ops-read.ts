/**
 * Read-only ops checks: a fixed set of named production questions that cloud
 * sessions can ask without the PC-only database route.
 *
 * Why (2026-11-02): two open items (the suites the paid-call guard parked,
 * and the past cost of Strale's own test calls) need production data. The
 * PC-only `strale_verify` role cannot read `test_results` or `test_suites`,
 * and the earlier GitHub-Action design copied a database credential into
 * GitHub. The API already holds database access, so it answers a fixed list
 * of questions instead (Petter, 2026-11-02, confirmed in session).
 *
 * The rules this module enforces:
 *   - Fixed, named checks only. No free-form SQL, and no caller-supplied
 *     value is interpolated into a query: the only caller input is a date
 *     range, validated to YYYY-MM-DD before any database work and bound as a
 *     parameter.
 *   - Every check runs in a READ ONLY transaction with a short statement
 *     timeout; `build` reports whether that mode is in force.
 *   - Output is checked against OUTPUT_FIELDS: every key must be listed, and
 *     each key accepts one shape only (a count, cents, a slug, a uuid, a
 *     date, a timestamp, a boolean). An unlisted key or a value of the wrong
 *     shape fails the whole response. The fixed column lists are the primary
 *     guard; this is the backstop that a check written later cannot get round
 *     by adding a column.
 *   - Customer-content tables (those `scripts/provision-verify-role.mjs`
 *     withholds) are read only as aggregates or identifiers, never content:
 *     no input, output, baseline or quarantine-reason text is selected.
 *
 * Auth: `STRALE_OPS_READ_TOKEN`, at least 32 characters, compared in
 * constant time. A token separate from ADMIN_SECRET, so this read-only
 * surface never carries admin power.
 */
import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { PAID_CALL_QUARANTINE_MARKER } from "./paid-call-guard.js";

export const OPS_READ_TOKEN_MIN_LENGTH = 32;
/**
 * Longest date range `test-call-cost` accepts, in days. Equal to the
 * `test_results` retention in jobs/db-retention.ts: an older day has no rows
 * and would read as a confident zero.
 */
export const MAX_RANGE_DAYS = 30;

/** True only for a configured, long-enough token that matches exactly. */
export function isValidOpsReadAuth(header: string | undefined, token: string | undefined): boolean {
  if (!header || !token || token.length < OPS_READ_TOKEN_MIN_LENGTH) return false;
  const expected = Buffer.from(`Bearer ${token}`, "utf-8");
  const provided = Buffer.from(header, "utf-8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// ─── Output contract ────────────────────────────────────────────────────────

type Shape = "count" | "cents" | "slug" | "uuid" | "date" | "month" | "timestamp" | "boolean" | "commit" | "list" | "object";
/** Leaves checked against a closed vocabulary rather than a pattern. */
type Vocabulary = "test_type" | "test_mode" | "payment_method" | "call_status" | "source";

const SHAPES: Record<Exclude<Shape, "list" | "object" | "count" | "boolean">, RegExp> = {
  cents: /^\d{1,12}$/, // non-negative integer cents, as a string (postgres bigint)
  slug: /^[a-z0-9][a-z0-9-]{0,80}$/, // capability slugs; no underscores, so no sk_/key-like tokens
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  timestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
  commit: /^[0-9a-f]{12}$/,
};

/**
 * Closed vocabularies. `call_status` is every `transactions.status` the money
 * checks can return, plus the test outcome `passed` (fx-error-rate's
 * `outcome` mixes call statuses and test results). `health_probe` is also
 * written to `transactions.status` (app.ts), but only on price-0 rows outside
 * every money-check filter, so it is deliberately absent: a value missing
 * here fails the check loudly rather than passing unseen.
 */
const VOCABULARIES: Record<Vocabulary, Set<string>> = {
  test_type: new Set(["known_answer", "schema_check", "negative", "edge_case", "known_bad", "dependency_health", "regression", "piggyback"]),
  test_mode: new Set(["live", "fixture", "canary"]),
  payment_method: new Set(["wallet", "x402"]),
  call_status: new Set(["completed", "failed", "executing", "pending", "passed"]),
  source: new Set(["calls", "tests"]),
};

/** Every key a check may return, and the one shape each accepts. Null is allowed for any leaf. */
const OUTPUT_FIELDS: Record<string, Shape | Vocabulary> = {
  check: "slug",
  result: "object",
  commit: "commit",
  read_only: "boolean",
  count: "count",
  suites: "list",
  parked_suites: "list",
  days: "list",
  test_suite_id: "uuid",
  capability_slug: "slug",
  test_type: "test_type",
  test_mode: "test_mode",
  active: "boolean",
  last_result_at: "timestamp",
  from: "date",
  to: "date",
  day: "date",
  oldest_result_day: "date",
  runs: "count",
  declared_external_cost_cents: "cents",
  // Money-path checks (A-7, B-6, B-5). Each key keeps one shape across checks.
  total: "object",
  slugs: "list",
  groups: "list",
  orphan_debits: "list",
  unmatched_refunds: "list",
  rows: "list",
  before_wp3: "object",
  slug: "slug",
  source: "source",
  status: "call_status",
  outcome: "call_status",
  payment_method: "payment_method",
  is_solution: "boolean",
  pre_wp3: "boolean",
  no_reference: "boolean",
  month: "month",
  first_day: "date",
  last_day: "date",
  calls: "count",
  no_debit: "count",
  debit_ne_recorded: "count",
  recorded_ne_listed: "count",
  no_longer_listed: "count",
  refunded: "count",
  debited_calls: "count",
  overcharged_calls: "count",
  overrefunded_calls: "count",
  refunds: "count",
  debits: "count",
  completed_paid_calls: "count",
  distinct_payers: "count",
  payers_unknown: "count",
  n: "count",
  debited_cents: "cents",
  recorded_cents: "cents",
  overcharged_cents: "cents",
  overrefunded_cents: "cents",
  refunded_cents: "cents",
};

export class OpsReadOutputError extends Error {
  constructor(path: string) {
    super(`ops-read output refused at ${path}: the key is not listed in OUTPUT_FIELDS or its value has the wrong shape`);
    this.name = "OpsReadOutputError";
  }
}

function checkLeaf(shape: Shape | Vocabulary, value: unknown, path: string): void {
  if (value === null) return;
  const ok = (() => {
    switch (shape) {
      case "count": return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
      case "boolean": return typeof value === "boolean";
      case "test_type": case "test_mode": case "payment_method": case "call_status": case "source":
        return typeof value === "string" && VOCABULARIES[shape].has(value);
      case "list": case "object": return false;
      default: return typeof value === "string" && SHAPES[shape].test(value);
    }
  })();
  if (!ok) throw new OpsReadOutputError(path);
}

/**
 * Throws `OpsReadOutputError` unless every key is listed in OUTPUT_FIELDS and
 * every value has that key's shape. Returns the value unchanged.
 */
export function assertSafeOutput(value: unknown, path = "$"): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new OpsReadOutputError(path);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const shape = OUTPUT_FIELDS[k];
    const at = `${path}.${k}`;
    if (!Object.prototype.hasOwnProperty.call(OUTPUT_FIELDS, k)) throw new OpsReadOutputError(`${path}.<unlisted key>`);
    if (shape === "object") {
      assertSafeOutput(v, at);
    } else if (shape === "list") {
      if (!Array.isArray(v)) throw new OpsReadOutputError(at);
      v.forEach((item, i) => assertSafeOutput(item, `${at}[${i}]`));
    } else {
      checkLeaf(shape, v, at);
    }
  }
  return value;
}

// ─── Input ──────────────────────────────────────────────────────────────────

export class OpsReadInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsReadInputError";
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * `from`/`to` as YYYY-MM-DD (UTC, both inclusive). Defaults to the last
 * MAX_RANGE_DAYS days ending today. Returned as strings: they are bound to
 * SQL as text and cast there, never as Date objects (DEC-20260504-A, the
 * PR-43 class).
 */
export function parseDateRange(
  query: { from?: string; to?: string },
  now: Date = new Date(),
): { from: string; to: string } {
  const today = now.toISOString().slice(0, 10);
  const to = query.to ?? today;
  if (!DATE_RE.test(to) || !isRealDate(to)) throw new OpsReadInputError("'to' must be a date as YYYY-MM-DD");
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const from = query.from ?? new Date(toMs - (MAX_RANGE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  if (!DATE_RE.test(from) || !isRealDate(from)) throw new OpsReadInputError("'from' must be a date as YYYY-MM-DD");
  const span = (toMs - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (span < 1) throw new OpsReadInputError("'from' must not be after 'to'");
  if (span > MAX_RANGE_DAYS) {
    throw new OpsReadInputError(`the range may be at most ${MAX_RANGE_DAYS} days (test results are kept for ${MAX_RANGE_DAYS} days)`);
  }
  return { from, to };
}

// ─── Checks ─────────────────────────────────────────────────────────────────

/** The read-only executor a check receives (a drizzle transaction). */
export interface ReadExecutor {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

export type RawQuery = { from?: string; to?: string };

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return ((result as { rows?: unknown[] })?.rows ?? []) as Record<string, unknown>[];
}

/** Exact prefix match (LIKE would treat the marker's `_` as a wildcard). */
const IS_PARKED = sql`ts.test_status = 'quarantined' AND starts_with(ts.quarantine_reason, ${PAID_CALL_QUARANTINE_MARKER})`;

type Row = Record<string, unknown>;

/**
 * A new row holding exactly `fields`. Every money-check row is built this
 * way, so a column the SQL or the driver adds later (an id, a payer count on
 * a per-slug row) cannot reach the response even before the output contract.
 */
function pick(row: Row | undefined, fields: readonly string[]): Row | null {
  if (!row) return null;
  return Object.fromEntries(fields.map((f) => [f, row[f] ?? null]));
}

/**
 * Splits a `GROUP BY ROLLUP (slug)` result on its `is_total` column
 * (`GROUPING(slug)`), which is dropped: the total has no slug at all rather
 * than a fake '(total)' one.
 */
function splitRollup(rows: Row[], fields: readonly string[]): { total: Row | null; slugs: Row[] } {
  const isTotal = (r: Row) => Number(r.is_total) === 1;
  return {
    total: pick(rows.find(isTotal), fields),
    slugs: rows.filter((r) => !isTotal(r)).map((r) => pick(r, ["slug", ...fields]) as Row),
  };
}

/**
 * The paid rows of archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md
 * (its two free-tier rows left out): tools that bill a success when the
 * upstream call failed. B-6 measures their exposure.
 */
export const SWALLOWED_FAILURE_SLUGS = [
  "vasp-verify", "vasp-non-compliant-check", "insolvency-check", "mx-lookup",
  "pricing-page-extract", "gdpr-fine-lookup", "package-security-audit", "dependency-audit",
  "cookie-scan", "email-auth-check", "email-deliverability-check", "domain-reputation",
  "company-tech-stack", "tech-stack-detect", "barcode-lookup", "backlink-check",
  "business-day-check", "cz-company-data", "eori-validate", "company-fundamentals",
  "github-repo-analyze", "customs-duty-lookup", "seo-audit", "startup-domain-check",
  "email-pattern-discover", "country-trade-data", "domain-age-check", "whois-lookup",
  "page-exists", "port-check", "og-image-check", "domain-contact-extract",
  "protocol-fees-lookup", "container-track", "ens-reverse-lookup", "email-reputation-score",
] as const;

/** One parameter per slug (`IN ($1, …, $36)`), never a row constructor cast to an array. */
const IS_SWALLOWED_FAILURE_SLUG = sql`c.slug IN (${sql.join(SWALLOWED_FAILURE_SLUGS.map((s) => sql`${s}`), sql`, `)})`;

/**
 * A completed, charged call: excludes free-tier calls and Strale's own
 * test-harness rows (written completed, wallet, price 0).
 */
const PAID_COMPLETED = sql`t.status = 'completed'
     AND t.is_free_tier = false
     AND t.price_cents > 0`;

/**
 * Solution debits carry the transaction id only since WP3 (PR #350, merged
 * 2026-08-21), so solution comparisons split here. A literal in the SQL text,
 * never a bound Date (DEC-20260504-A).
 */
const WP3_CUTOFF = sql`TIMESTAMPTZ '2026-08-22 00:00:00+00'`;

/** The ledger debit and refund that reference call `t`, per call. */
const LEDGER_PER_CALL = sql`(SELECT -SUM(w.amount_cents) FROM wallet_transactions w
           WHERE w.reference_id = t.id AND w.type = 'purchase') AS debited_cents,
         (SELECT SUM(w.amount_cents) FROM wallet_transactions w
           WHERE w.reference_id = t.id AND w.type = 'refund')   AS refunded_cents`;

/** B-5's window: seven full UTC days after #976/#977 (merged 2026-11-08), both ends inclusive. */
const FX_WINDOW = { from: "2026-11-09", to: "2026-11-15" } as const;

const CAPABILITY_DEBIT_FIELDS = ["calls", "no_debit", "debit_ne_recorded", "recorded_ne_listed", "refunded", "debited_cents"] as const;
const SOLUTION_DEBIT_FIELDS = ["calls", "no_debit", "debit_ne_recorded", "no_longer_listed", "recorded_ne_listed", "refunded", "debited_cents"] as const;
/** Per-slug exposure fields. No payer column, ever: one payer per tool can point to one customer. */
const EXPOSURE_SLUG_FIELDS = ["slug", "payment_method", "completed_paid_calls", "recorded_cents", "first_day", "last_day"] as const;
const EXPOSURE_TOTAL_FIELDS = ["completed_paid_calls", "distinct_payers", "payers_unknown", "recorded_cents", "first_day", "last_day"] as const;

interface CheckDef<P> {
  /** Validates caller input before any database work; throws OpsReadInputError. */
  prepare: (query: RawQuery) => P;
  run: (tx: ReadExecutor, params: P) => Promise<unknown>;
}

function check<P>(def: CheckDef<P>): CheckDef<unknown> {
  return def as CheckDef<unknown>;
}

/**
 * Each check is fixed SQL. The only caller input is the validated date range
 * of `test-call-cost`, bound as a parameter. Selected columns are identifiers,
 * statuses, counts and timestamps; never input, output, baseline or reason
 * text.
 */
export const OPS_READ_CHECKS: Record<string, CheckDef<unknown>> = {
  /**
   * The commit this API process was built from, and whether the check ran
   * read-only: the post-deploy proof (DEC-20260504-C step 4) that the mode
   * every other check relies on is in force in production.
   */
  build: check({
    prepare: () => null,
    run: async (tx) => {
      const [row] = rowsOf(await tx.execute(sql`SELECT current_setting('transaction_read_only') = 'on' AS read_only`));
      return {
        commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
        read_only: row?.read_only === true,
      };
    },
  }),

  /** Suites the paid-call guard parked (lib/paid-call-guard.ts). */
  "parked-suites": check({
    prepare: () => null,
    run: async (tx) => {
      const rows = rowsOf(await tx.execute(sql`
        SELECT ts.id::text AS test_suite_id,
               ts.capability_slug,
               ts.test_type,
               ts.test_mode,
               ts.active,
               to_char(
                 (SELECT MAX(tr.executed_at) FROM test_results tr WHERE tr.test_suite_id = ts.id) AT TIME ZONE 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"'
               ) AS last_result_at
          FROM test_suites ts
         WHERE ${IS_PARKED}
         ORDER BY ts.capability_slug, ts.test_type
      `));
      return { count: rows.length, suites: rows };
    },
  }),

  /**
   * Strale's own test runs per UTC day, with the declared external cost
   * (`test_suites.external_cost_cents` at read time, times runs). Test runs
   * carry no measured cost: their LLM spend is only logged. Piggyback rows
   * come from customer traffic and are excluded. `parked_suites` gives the
   * same totals for each parked suite, so runs x price-per-call answers what
   * the paid-call leak cost. `oldest_result_day` says how far back rows
   * survive retention, so a short history is visible rather than read as zero.
   */
  "test-call-cost": check({
    prepare: (query) => parseDateRange(query),
    run: async (tx, params) => {
      const { from, to } = params as { from: string; to: string };
      const inRange = sql`tr.executed_at >= (${from}::date)::timestamp AT TIME ZONE 'UTC'
           AND tr.executed_at <  ((${to}::date) + 1)::timestamp AT TIME ZONE 'UTC'`;
      const days = rowsOf(await tx.execute(sql`
        SELECT to_char(date_trunc('day', tr.executed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS runs,
               COALESCE(SUM(COALESCE(ts.external_cost_cents, 0)), 0)::bigint::text AS declared_external_cost_cents
          FROM test_results tr
          JOIN test_suites ts ON ts.id = tr.test_suite_id
         WHERE ts.test_type <> 'piggyback'
           AND ${inRange}
         GROUP BY 1
         ORDER BY 1
      `));
      const parked = rowsOf(await tx.execute(sql`
        SELECT ts.id::text AS test_suite_id,
               ts.capability_slug,
               ts.test_type,
               COUNT(tr.id)::int AS runs,
               (COUNT(tr.id) * COALESCE(MAX(ts.external_cost_cents), 0))::bigint::text AS declared_external_cost_cents
          FROM test_suites ts
          LEFT JOIN test_results tr
            ON tr.test_suite_id = ts.id
           AND ${inRange}
         WHERE ${IS_PARKED}
         GROUP BY ts.id, ts.capability_slug, ts.test_type
         ORDER BY ts.capability_slug, ts.test_type
      `));
      const [oldest] = rowsOf(await tx.execute(sql`
        SELECT to_char(MIN(executed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS oldest_result_day FROM test_results
      `));
      return { from, to, oldest_result_day: oldest?.oldest_result_day ?? null, days, parked_suites: parked };
    },
  }),

  // ─── Money-path checks ───────────────────────────────────────────────────
  // The reviewed SQL of docs/lanes/pc/a7-bundle-queries-brief.md (Q1-Q5),
  // changed only as docs/lanes/codex/ops-read-money-checks-brief.md says:
  // totals split by GROUPING() rather than a '(total)' slug, counts cast to
  // int, cents to bigint text, dates through to_char in UTC. Aggregates only:
  // no id, input, output or error text is selected. Database errors (a 5s
  // statement timeout included) are never caught here, so the route answers
  // "The check failed." rather than a confident zero.

  /**
   * A-7, Q1: completed, wallet-paid, non-free capability calls against the
   * ledger debit that references them. `total` covers every capability;
   * `slugs` lists only the ones with a missing or mismatched debit or a
   * recorded price that differs from today's listed price (which may be a
   * later price change, not a bug).
   */
  "capability-debits": check({
    prepare: () => null,
    run: async (tx) => {
      const rows = rowsOf(await tx.execute(sql`
        WITH calls AS (
          SELECT c.slug,
                 t.price_cents AS recorded_cents,
                 c.price_cents AS listed_cents,
                 ${LEDGER_PER_CALL}
            FROM transactions t
            JOIN capabilities c ON c.id = t.capability_id
           WHERE ${PAID_COMPLETED}
             AND t.payment_method = 'wallet'
             AND t.solution_slug IS NULL
        )
        SELECT GROUPING(slug)::int AS is_total,
               slug,
               COUNT(*)::int AS calls,
               COUNT(*) FILTER (WHERE debited_cents IS NULL)::int AS no_debit,
               COUNT(*) FILTER (WHERE debited_cents IS NOT NULL
                                  AND debited_cents <> recorded_cents)::int AS debit_ne_recorded,
               COUNT(*) FILTER (WHERE recorded_cents <> listed_cents)::int AS recorded_ne_listed,
               COUNT(*) FILTER (WHERE refunded_cents IS NOT NULL)::int AS refunded,
               COALESCE(SUM(debited_cents), 0)::bigint::text AS debited_cents
          FROM calls
         GROUP BY ROLLUP (slug)
        HAVING GROUPING(slug) = 1
            OR COUNT(*) FILTER (WHERE debited_cents IS NULL
                                   OR debited_cents <> recorded_cents
                                   OR recorded_cents <> listed_cents) > 0
         ORDER BY GROUPING(slug) DESC, slug
      `));
      return splitRollup(rows, CAPABILITY_DEBIT_FIELDS);
    },
  }),

  /**
   * A-7, Q2 and Q2b: solution calls paid from the wallet, compared the same
   * way from WP3 on (`slugs` lists every solution). `before_wp3` counts the
   * earlier calls, whose debits carry no reference by design: not findings.
   */
  "solution-debits": check({
    prepare: () => null,
    run: async (tx) => {
      const rows = rowsOf(await tx.execute(sql`
        WITH calls AS (
          SELECT t.solution_slug AS slug,
                 t.price_cents   AS recorded_cents,
                 s.price_cents   AS listed_cents,
                 ${LEDGER_PER_CALL}
            FROM transactions t
            LEFT JOIN solutions s ON s.slug = t.solution_slug
           WHERE t.solution_slug IS NOT NULL
             AND ${PAID_COMPLETED}
             AND t.payment_method = 'wallet'
             AND t.created_at >= ${WP3_CUTOFF}
        )
        SELECT GROUPING(slug)::int AS is_total,
               slug,
               COUNT(*)::int AS calls,
               COUNT(*) FILTER (WHERE debited_cents IS NULL)::int AS no_debit,
               COUNT(*) FILTER (WHERE debited_cents IS NOT NULL
                                  AND debited_cents <> recorded_cents)::int AS debit_ne_recorded,
               COUNT(*) FILTER (WHERE listed_cents IS NULL)::int AS no_longer_listed,
               COUNT(*) FILTER (WHERE recorded_cents <> listed_cents)::int AS recorded_ne_listed,
               COUNT(*) FILTER (WHERE refunded_cents IS NOT NULL)::int AS refunded,
               COALESCE(SUM(debited_cents), 0)::bigint::text AS debited_cents
          FROM calls
         GROUP BY ROLLUP (slug)
         ORDER BY GROUPING(slug) DESC, slug
      `));
      const [before] = rowsOf(await tx.execute(sql`
        SELECT COUNT(*)::int AS calls,
               COALESCE(SUM(t.price_cents), 0)::bigint::text AS recorded_cents,
               to_char(MIN(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS first_day,
               to_char(MAX(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS last_day
          FROM transactions t
         WHERE t.solution_slug IS NOT NULL
           AND ${PAID_COMPLETED}
           AND t.payment_method = 'wallet'
           AND t.created_at < ${WP3_CUTOFF}
      `));
      return {
        ...splitRollup(rows, SOLUTION_DEBIT_FIELDS),
        before_wp3: pick(before, ["calls", "recorded_cents", "first_day", "last_day"]),
      };
    },
  }),

  /**
   * A-7 / P-001, Q3, Q3b and Q3c. `groups`: per status, payment method and
   * kind, calls that kept more than they may (their recorded price if
   * completed, nothing otherwise) or were refunded more than they were
   * charged; both counts should be zero. `orphan_debits`: purchase debits
   * pointing at no call, per month. `unmatched_refunds`: refunds whose call
   * has no purchase debit; only pre-WP3 solution rows are expected.
   */
  "kept-charges": check({
    prepare: () => null,
    run: async (tx) => {
      const groups = rowsOf(await tx.execute(sql`
        WITH d AS (SELECT reference_id AS id, -SUM(amount_cents) AS debited
                     FROM wallet_transactions
                    WHERE type = 'purchase' AND reference_id IS NOT NULL
                    GROUP BY 1),
             r AS (SELECT reference_id AS id, SUM(amount_cents) AS refunded
                     FROM wallet_transactions
                    WHERE type = 'refund' AND reference_id IS NOT NULL
                    GROUP BY 1),
             x AS (SELECT t.status,
                          t.payment_method,
                          (t.solution_slug IS NOT NULL) AS is_solution,
                          d.debited - COALESCE(r.refunded, 0)
                            - CASE WHEN t.status = 'completed' THEN t.price_cents ELSE 0 END AS excess,
                          COALESCE(r.refunded, 0) - d.debited AS overrefund
                     FROM d
                     JOIN transactions t ON t.id = d.id
                     LEFT JOIN r ON r.id = d.id
                    WHERE t.created_at < now() - interval '1 day')
        SELECT status,
               payment_method,
               is_solution,
               COUNT(*)::int AS debited_calls,
               COUNT(*) FILTER (WHERE excess > 0)::int AS overcharged_calls,
               COALESCE(SUM(excess) FILTER (WHERE excess > 0), 0)::bigint::text AS overcharged_cents,
               COUNT(*) FILTER (WHERE overrefund > 0)::int AS overrefunded_calls,
               COALESCE(SUM(overrefund) FILTER (WHERE overrefund > 0), 0)::bigint::text AS overrefunded_cents
          FROM x
         GROUP BY 1, 2, 3
         ORDER BY 1, 2, 3
      `));
      const orphans = rowsOf(await tx.execute(sql`
        SELECT to_char(w.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
               (w.reference_id IS NULL) AS no_reference,
               COUNT(*)::int AS debits,
               COALESCE(-SUM(w.amount_cents), 0)::bigint::text AS debited_cents
          FROM wallet_transactions w
          LEFT JOIN transactions t ON t.id = w.reference_id
         WHERE w.type = 'purchase'
           AND t.id IS NULL
         GROUP BY 1, 2
         ORDER BY 1, 2
      `));
      const unmatched = rowsOf(await tx.execute(sql`
        SELECT (w.created_at < ${WP3_CUTOFF}) AS pre_wp3,
               (t.solution_slug IS NOT NULL) AS is_solution,
               COUNT(*)::int AS refunds,
               COALESCE(SUM(w.amount_cents), 0)::bigint::text AS refunded_cents
          FROM wallet_transactions w
          LEFT JOIN transactions t ON t.id = w.reference_id
         WHERE w.type = 'refund'
           AND w.reference_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM wallet_transactions p
                            WHERE p.type = 'purchase' AND p.reference_id = w.reference_id)
         GROUP BY 1, 2
         ORDER BY 1, 2
      `));
      return {
        groups: groups.map((r) => pick(r, ["status", "payment_method", "is_solution", "debited_calls", "overcharged_calls", "overcharged_cents", "overrefunded_calls", "overrefunded_cents"])),
        orphan_debits: orphans.map((r) => pick(r, ["month", "no_reference", "debits", "debited_cents"])),
        unmatched_refunds: unmatched.map((r) => pick(r, ["pre_wp3", "is_solution", "refunds", "refunded_cents"])),
      };
    },
  }),

  /**
   * B-6, Q4: an upper bound on what the tools in SWALLOWED_FAILURE_SLUGS
   * billed, as completed paid direct calls (legitimate negatives included;
   * uses inside a solution are not counted). Payer counts are computed for
   * the total only, by a separate statement: the per-slug statement selects
   * none, and per-slug rows are built from EXPOSURE_SLUG_FIELDS.
   */
  "swallowed-failure-exposure": check({
    prepare: () => null,
    run: async (tx) => {
      const perSlug = rowsOf(await tx.execute(sql`
        SELECT c.slug,
               t.payment_method,
               COUNT(*)::int AS completed_paid_calls,
               COALESCE(SUM(t.price_cents), 0)::bigint::text AS recorded_cents,
               to_char(MIN(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS first_day,
               to_char(MAX(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS last_day
          FROM transactions t
          JOIN capabilities c ON c.id = t.capability_id
         WHERE ${PAID_COMPLETED}
           AND ${IS_SWALLOWED_FAILURE_SLUG}
         GROUP BY c.slug, t.payment_method
         ORDER BY SUM(t.price_cents) DESC, c.slug, t.payment_method
      `));
      const [total] = rowsOf(await tx.execute(sql`
        SELECT COUNT(*)::int AS completed_paid_calls,
               COUNT(DISTINCT COALESCE(t.user_id::text, 'x402:' || t.x402_payer_hash))::int AS distinct_payers,
               COUNT(*) FILTER (WHERE t.user_id IS NULL AND t.x402_payer_hash IS NULL)::int AS payers_unknown,
               COALESCE(SUM(t.price_cents), 0)::bigint::text AS recorded_cents,
               to_char(MIN(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS first_day,
               to_char(MAX(t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS last_day
          FROM transactions t
          JOIN capabilities c ON c.id = t.capability_id
         WHERE ${PAID_COMPLETED}
           AND ${IS_SWALLOWED_FAILURE_SLUG}
      `));
      return {
        total: pick(total, EXPOSURE_TOTAL_FIELDS),
        slugs: perSlug.map((r) => pick(r, EXPOSURE_SLUG_FIELDS)),
      };
    },
  }),

  /**
   * B-5, Q5: exchange-rate tools in the seven days after #976/#977. Customer
   * direct calls (Strale's internal receipt rail left out) and Strale's own
   * test results (piggyback left out). `oldest_result_day` shows how far back
   * `test_results` survives its 30-day retention, so a pruned window reads
   * as pruned, not as zero test runs.
   */
  "fx-error-rate": check({
    prepare: () => null,
    run: async (tx) => {
      const { from, to } = FX_WINDOW;
      const rows = rowsOf(await tx.execute(sql`
        SELECT 'calls' AS source, c.slug, t.status AS outcome, COUNT(*)::int AS n
          FROM transactions t
          JOIN capabilities c ON c.id = t.capability_id
         WHERE c.slug IN ('exchange-rate', 'currency-convert', 'forex-history')
           AND t.created_at >= (${from}::date)::timestamp AT TIME ZONE 'UTC'
           AND t.created_at <  ((${to}::date) + 1)::timestamp AT TIME ZONE 'UTC'
           AND t.receipt_rail IS DISTINCT FROM 'internal'
         GROUP BY 2, 3
        UNION ALL
        SELECT 'tests', tr.capability_slug, CASE WHEN tr.passed THEN 'passed' ELSE 'failed' END, COUNT(*)::int
          FROM test_results tr
          JOIN test_suites ts ON ts.id = tr.test_suite_id
         WHERE ts.test_type <> 'piggyback'
           AND tr.capability_slug IN ('exchange-rate', 'currency-convert', 'forex-history')
           AND tr.executed_at >= (${from}::date)::timestamp AT TIME ZONE 'UTC'
           AND tr.executed_at <  ((${to}::date) + 1)::timestamp AT TIME ZONE 'UTC'
         GROUP BY 2, 3
         ORDER BY 1, 2, 3
      `));
      const [oldest] = rowsOf(await tx.execute(sql`
        SELECT to_char(MIN(executed_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS oldest_result_day FROM test_results
      `));
      return {
        from,
        to,
        oldest_result_day: oldest?.oldest_result_day ?? null,
        rows: rows.map((r) => pick(r, ["source", "slug", "outcome", "n"])),
      };
    },
  }),
};

export function isOpsReadCheck(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(OPS_READ_CHECKS, name);
}
