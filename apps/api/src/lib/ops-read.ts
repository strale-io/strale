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
type Vocabulary = "test_type" | "test_mode" | "payment_method" | "call_status" | "source" | "debit_note" | "fk_action";

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
  // orphan-debit-trace: a purchase debit's `description`, reduced to the
  // writer it came from (DEBIT_TYPE_NOTE). The raw text is never selected.
  debit_note: new Set(["capability", "solution", "batch_item", "reservation_capture", "none", "other"]),
  // transaction-quality-fk: pg_constraint.confdeltype as Postgres stores it
  // (a = no action, r = restrict, c = cascade, n = set null, d = set default).
  fk_action: new Set(["a", "r", "c", "n", "d"]),
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
  // orphan-debit-trace (A-7 follow-up). `no_reference` above is kept-charges'
  // boolean, so the object here is `no_reference_debits`.
  dangling: "list",
  no_reference_debits: "object",
  months: "list",
  unmatched_kinds: "list",
  matched_debits: "count",
  matched_completed_debits: "count",
  distinct_matched_solution_calls: "count",
  distinct_matched_completed_solution_calls: "count",
  debits_sharing_a_call: "count",
  // { debits, debited_cents, refunded_nearby_debits }: `refunded_nearby` is
  // already the per-group boolean of unmatched_kinds, so the count has its own key.
  matched_not_completed: "object",
  refunded_nearby_debits: "count",
  unmatched: "count",
  unmatched_cents: "cents",
  in_transaction_quality: "boolean",
  in_wallet_reservations: "boolean",
  in_capability_invocations: "boolean",
  in_x402_settlement_intents: "boolean",
  in_dispute_requests: "boolean",
  in_job_files: "boolean",
  in_job_callbacks: "boolean",
  is_wallet_transaction_id: "boolean",
  wallet_user_closed: "boolean",
  debit_type_note: "debit_note",
  solution_call_within_10m: "boolean",
  refunded_nearby: "boolean",
  // burst-debit-refund (A-7 follow-up to orphan-debit-trace). Aggregates only.
  burst_totals: "object",
  matched_completed_totals: "object",
  bursts: "count",
  multi_debit_bursts: "count",
  debits_in_multi_debit_bursts: "count",
  bursts_with_excess: "count",
  bursts_without_excess: "count",
  bursts_with_shortfall: "count",
  excess_cents_total: "cents",
  excess_refunded_cents: "cents",
  excess_unrefunded_cents: "cents",
  shortfall_cents_total: "cents",
  refunds_attributed_to_several_bursts: "count",
  refunds_also_near_other_debits: "count",
  excess_refunded_is_upper_bound: "boolean",
  net_excess_cents: "cents",
  net_shortfall_cents: "cents",
  refunded_nearby_cents: "cents",
  debits_matching_several_solutions: "count",
  // transaction-quality-fk (A-7 follow-up). Catalog flags and counts only.
  foreign_key_exists: "boolean",
  foreign_keys: "list",
  confdeltype: "fk_action",
  convalidated: "boolean",
  condeferrable: "boolean",
  orphaned_rows: "count",
  orphaned_with_debit: "count",
  orphaned_without_debit: "count",
  orphaned_soft_deleted: "count",
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
      case "test_type": case "test_mode": case "payment_method": case "call_status": case "source": case "debit_note": case "fk_action":
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

/**
 * A purchase debit's `description`, reduced to the code path that wrote it.
 * Each prefix is a string a debit writer has used (git history of
 * lib/wallet-service.ts, lib/wallet-reservations.ts, lib/do/dispatch.ts,
 * lib/do/batch.ts and the early solution route). `starts_with`, not LIKE:
 * the text may hold `_` or `%`. The text itself (it carries a slug and,
 * for batches, an item number) is never selected.
 */
const DEBIT_TYPE_NOTE = sql`CASE
           WHEN w.description IS NULL THEN 'none'
           WHEN starts_with(w.description, 'Capability: ') THEN 'capability'
           WHEN starts_with(w.description, 'Solution: ') THEN 'solution'
           WHEN starts_with(w.description, 'Batch item ') THEN 'batch_item'
           WHEN w.description = 'Sync capability reservation captured' THEN 'reservation_capture'
           ELSE 'other'
         END`;

/**
 * orphan-debit-trace's "refunded nearby" rule, as a join or EXISTS predicate
 * over `rf` and `nr`: a no-reference refund of the same amount to the same
 * wallet within ten minutes after the debit. One fragment, so
 * burst-debit-refund applies exactly the rule orphan-debit-trace reports.
 */
const REFUNDED_NEARBY = sql`rf.wallet_id = nr.wallet_id AND rf.amount_cents = nr.debited
                            AND rf.created_at BETWEEN nr.created_at
                                                  AND nr.created_at + interval '10 minutes'`;

/**
 * Purchase debits with no reference, each with whether a wallet solution call
 * explains it: same user (wallets.user_id), `price_cents = -amount_cents`,
 * `created_at` within 60 seconds. `pairs` holds every (debit, call) match by
 * internal row id; ids stay inside the statement and only counts leave it.
 * `matched_completed` adds Q2b's `status = 'completed'`. `shares_call` marks
 * a debit whose matched call another debit also matches, so several debits
 * explained by one call are visible rather than read as fully explained.
 * `solution_call_within_10m` (the same match over ten minutes: the early
 * solution route debited before it ran the steps) and `refunded_nearby` (a
 * no-reference refund of the same amount to the same wallet within ten
 * minutes after: the early route refunded a failed run that way) describe
 * the rest, and `refunded_nearby` also the matched calls that did not complete.
 * `sol.solution_slug` and `rf.id` serve burst-debit-refund, which embeds this
 * fragment unchanged; like every id here they never leave the statement.
 */
const NO_REFERENCE_DEBITS = sql`nr AS MATERIALIZED (
          SELECT w.id, w.wallet_id, wl.user_id, w.created_at, -w.amount_cents AS debited,
                 ${DEBIT_TYPE_NOTE} AS debit_type_note
            FROM wallet_transactions w
            JOIN wallets wl ON wl.id = w.wallet_id
           WHERE w.type = 'purchase'
             AND w.reference_id IS NULL
        ),
        sol AS MATERIALIZED (
          SELECT t.id, t.user_id, t.created_at, t.price_cents, t.status, t.solution_slug
            FROM transactions t
           WHERE t.solution_slug IS NOT NULL
             AND t.payment_method = 'wallet'
             AND t.user_id IN (SELECT nr.user_id FROM nr)
        ),
        pairs (debit_id, call_id, call_status) AS MATERIALIZED (
          SELECT nr.id, s.id, s.status
            FROM nr
            JOIN sol s
              ON s.user_id = nr.user_id AND s.price_cents = nr.debited
             AND s.created_at BETWEEN nr.created_at - interval '60 seconds'
                                  AND nr.created_at + interval '60 seconds'
        ),
        rf AS MATERIALIZED (
          SELECT r.id, r.wallet_id, r.created_at, r.amount_cents
            FROM wallet_transactions r
           WHERE r.type = 'refund'
             AND r.reference_id IS NULL
             AND r.wallet_id IN (SELECT nr.wallet_id FROM nr)
        ),
        m AS (
          SELECT to_char(nr.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
                 nr.debited,
                 nr.debit_type_note,
                 EXISTS (SELECT 1 FROM pairs p WHERE p.debit_id = nr.id) AS matched,
                 EXISTS (SELECT 1 FROM pairs p
                          WHERE p.debit_id = nr.id AND p.call_status = 'completed') AS matched_completed,
                 EXISTS (SELECT 1 FROM pairs p
                           JOIN pairs q ON q.call_id = p.call_id AND q.debit_id <> p.debit_id
                          WHERE p.debit_id = nr.id) AS shares_call,
                 EXISTS (SELECT 1 FROM sol s
                          WHERE s.user_id = nr.user_id AND s.price_cents = nr.debited
                            AND s.created_at BETWEEN nr.created_at - interval '10 minutes'
                                                 AND nr.created_at + interval '10 minutes') AS solution_call_within_10m,
                 EXISTS (SELECT 1 FROM rf WHERE ${REFUNDED_NEARBY}) AS refunded_nearby
            FROM nr
        )`;

/**
 * Follows NO_REFERENCE_DEBITS in a WITH list. `mcd`: one row per matched
 * completed debit (m's `matched_completed`: a pair whose call completed),
 * carrying the solution of its completed calls. A debit whose completed
 * matches span several solutions takes the lowest slug and is counted in
 * `solutions`, so that ambiguity is reported rather than hidden.
 */
const MATCHED_COMPLETED_DEBITS = sql`mcd AS MATERIALIZED (
          SELECT nr.id, nr.wallet_id, nr.user_id, nr.created_at, nr.debited,
                 MIN(s.solution_slug) AS solution_slug,
                 COUNT(DISTINCT s.solution_slug)::int AS solutions
            FROM nr
            JOIN pairs p ON p.debit_id = nr.id AND p.call_status = 'completed'
            JOIN sol s ON s.id = p.call_id
           GROUP BY nr.id, nr.wallet_id, nr.user_id, nr.created_at, nr.debited
        )`;

/**
 * Where a dangling reference does appear. Every uuid column in schema.ts that
 * holds a transaction id, plus `wallet_transactions.id`. Only
 * wallet_reservations, capability_invocations and x402_settlement_intents
 * carry no foreign key; transaction_quality's cascades on delete, and
 * dispute_requests, job_files and job_callbacks refuse a delete. So a hit in
 * the first three says a call row once existed; a hit in the others says the
 * key was missing when the row was written or removed.
 *
 * `in_capability_invocations` is always false today: no writer sets
 * `capability_invocations.transaction_id` (see its comment in schema.ts), so
 * a false there is not evidence of anything. `refunded_cents` is the refund
 * total for the reference, so it repeats on every row when two dangling
 * debits share one reference; do not sum it across rows.
 */
const DANGLING_FIELDS = [
  "month", "debited_cents",
  "in_transaction_quality", "in_wallet_reservations", "in_capability_invocations",
  "in_x402_settlement_intents", "in_dispute_requests", "in_job_files", "in_job_callbacks",
  "is_wallet_transaction_id", "refunded_cents", "wallet_user_closed", "debit_type_note",
] as const;
const NO_REFERENCE_TOTAL_FIELDS = [
  "matched_debits", "matched_completed_debits",
  "distinct_matched_solution_calls", "distinct_matched_completed_solution_calls",
  "debits_sharing_a_call", "unmatched", "unmatched_cents",
] as const;
const UNMATCHED_KIND_FIELDS = ["month", "debit_type_note", "solution_call_within_10m", "refunded_nearby", "debits", "debited_cents"] as const;
const BURST_TOTAL_FIELDS = [
  "bursts", "multi_debit_bursts", "debits_in_multi_debit_bursts",
  "bursts_with_excess", "bursts_without_excess", "bursts_with_shortfall",
  "excess_cents_total", "excess_refunded_cents", "excess_unrefunded_cents", "shortfall_cents_total",
  "refunds_attributed_to_several_bursts", "refunds_also_near_other_debits", "excess_refunded_is_upper_bound",
] as const;
const MATCHED_COMPLETED_TOTAL_FIELDS = [
  "debits", "debited_cents", "distinct_matched_completed_solution_calls", "recorded_cents",
  "net_excess_cents", "net_shortfall_cents", "refunded_nearby_cents", "debits_matching_several_solutions",
] as const;
const FOREIGN_KEY_FIELDS = ["confdeltype", "convalidated", "condeferrable"] as const;
const ORPHANED_QUALITY_FIELDS = ["orphaned_rows", "orphaned_with_debit", "orphaned_without_debit", "orphaned_soft_deleted"] as const;

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

  /**
   * A-7 follow-up to kept-charges' `orphan_debits` (first production run,
   * archive/receipts/2026-11-16-check-a7-money-path-ops-read.json).
   * `dangling`: one row per purchase debit whose reference matches no
   * `transactions` row, with where that reference does appear, what was
   * refunded against it and whether the wallet's account is closed
   * (`users.deleted_at`). Per-debit rows, so they go to the token holder
   * only; the master applies the privacy table before any receipt.
   * `no_reference_debits`: purchase debits with no reference per month, and
   * how many a wallet solution call explains (NO_REFERENCE_DEBITS), with the
   * unexplained rest grouped in `unmatched_kinds`. No id, description text or
   * email is selected.
   */
  "orphan-debit-trace": check({
    prepare: () => null,
    run: async (tx) => {
      const dangling = rowsOf(await tx.execute(sql`
        WITH d AS MATERIALIZED (
          SELECT w.reference_id AS ref,
                 w.wallet_id,
                 w.created_at,
                 -w.amount_cents AS debited,
                 ${DEBIT_TYPE_NOTE} AS debit_type_note
            FROM wallet_transactions w
            LEFT JOIN transactions t ON t.id = w.reference_id
           WHERE w.type = 'purchase'
             AND w.reference_id IS NOT NULL
             AND t.id IS NULL
        )
        SELECT to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
               d.debited::bigint::text AS debited_cents,
               EXISTS (SELECT 1 FROM transaction_quality q WHERE q.transaction_id = d.ref) AS in_transaction_quality,
               EXISTS (SELECT 1 FROM wallet_reservations v WHERE v.transaction_id = d.ref) AS in_wallet_reservations,
               EXISTS (SELECT 1 FROM capability_invocations ci WHERE ci.transaction_id = d.ref) AS in_capability_invocations,
               EXISTS (SELECT 1 FROM x402_settlement_intents xi WHERE xi.transaction_id = d.ref) AS in_x402_settlement_intents,
               EXISTS (SELECT 1 FROM dispute_requests dr WHERE dr.transaction_id = d.ref) AS in_dispute_requests,
               EXISTS (SELECT 1 FROM job_files jf WHERE jf.transaction_id = d.ref) AS in_job_files,
               EXISTS (SELECT 1 FROM job_callbacks jc WHERE jc.transaction_id = d.ref) AS in_job_callbacks,
               EXISTS (SELECT 1 FROM wallet_transactions o WHERE o.id = d.ref) AS is_wallet_transaction_id,
               (SELECT COALESCE(SUM(r.amount_cents), 0) FROM wallet_transactions r
                 WHERE r.type = 'refund' AND r.reference_id = d.ref)::bigint::text AS refunded_cents,
               (SELECT u.deleted_at IS NOT NULL FROM wallets wl JOIN users u ON u.id = wl.user_id
                 WHERE wl.id = d.wallet_id) AS wallet_user_closed,
               d.debit_type_note
          FROM d
         ORDER BY d.created_at, d.debited
      `));
      const perMonth = rowsOf(await tx.execute(sql`
        WITH ${NO_REFERENCE_DEBITS}
        SELECT GROUPING(month)::int AS is_total,
               month,
               COUNT(*)::int AS debits,
               COALESCE(SUM(debited), 0)::bigint::text AS debited_cents,
               COUNT(*) FILTER (WHERE matched)::int AS matched_debits,
               COUNT(*) FILTER (WHERE matched_completed)::int AS matched_completed_debits,
               (SELECT COUNT(DISTINCT p.call_id) FROM pairs p)::int AS distinct_matched_solution_calls,
               (SELECT COUNT(DISTINCT p.call_id) FROM pairs p
                 WHERE p.call_status = 'completed')::int AS distinct_matched_completed_solution_calls,
               COUNT(*) FILTER (WHERE shares_call)::int AS debits_sharing_a_call,
               COUNT(*) FILTER (WHERE matched AND NOT matched_completed)::int AS mnc_debits,
               COALESCE(SUM(debited) FILTER (WHERE matched AND NOT matched_completed), 0)::bigint::text AS mnc_cents,
               COUNT(*) FILTER (WHERE matched AND NOT matched_completed AND refunded_nearby)::int AS mnc_refunded_nearby,
               COUNT(*) FILTER (WHERE NOT matched)::int AS unmatched,
               COALESCE(SUM(debited) FILTER (WHERE NOT matched), 0)::bigint::text AS unmatched_cents
          FROM m
         GROUP BY ROLLUP (month)
         ORDER BY GROUPING(month) DESC, month
      `));
      const kinds = rowsOf(await tx.execute(sql`
        WITH ${NO_REFERENCE_DEBITS}
        SELECT month,
               debit_type_note,
               solution_call_within_10m,
               refunded_nearby,
               COUNT(*)::int AS debits,
               COALESCE(SUM(debited), 0)::bigint::text AS debited_cents
          FROM m
         WHERE NOT matched
         GROUP BY 1, 2, 3, 4
         ORDER BY 1, 2, 3, 4
      `));
      const isTotal = (r: Row) => Number(r.is_total) === 1;
      const total: Row = perMonth.find(isTotal) ?? {};
      return {
        dangling: dangling.map((r) => pick(r, DANGLING_FIELDS)),
        no_reference_debits: {
          months: perMonth.filter((r) => !isTotal(r)).map((r) => pick(r, ["month", "debits", "debited_cents"])),
          ...pick(total, NO_REFERENCE_TOTAL_FIELDS),
          // Debits matched only to calls that did not complete: Q2b left them
          // out, and refunded_nearby says whether the money went back.
          matched_not_completed: {
            debits: total.mnc_debits ?? null,
            debited_cents: total.mnc_cents ?? null,
            refunded_nearby_debits: total.mnc_refunded_nearby ?? null,
          },
          unmatched_kinds: kinds.map((r) => pick(r, UNMATCHED_KIND_FIELDS)),
        },
      };
    },
  }),

  /**
   * A-7 follow-up to orphan-debit-trace: the no-reference debits matched to
   * completed solution calls total more than those calls' recorded prices,
   * and some sit in bursts. Was the excess refunded?
   *
   * Matching is orphan-debit-trace's own (NO_REFERENCE_DEBITS, embedded
   * verbatim; MATCHED_COMPLETED_DEBITS keeps its `matched_completed`). A
   * burst is a run of matched completed debits by one user for one solution
   * whose candidate call windows (debit time +/- 60 seconds, the matching
   * window) overlap, chained in time order. Per burst: its debits, the
   * distinct completed calls of that solution they match and those calls'
   * recorded prices; excess = debited - prices. Refunded nearby is
   * orphan-debit-trace's rule (REFUNDED_NEARBY), each refund row counted
   * once per burst. A single debit is a burst of one, so `bursts` covers
   * every matched completed debit and `multi_debit_bursts` the repeated ones.
   *
   * `burst_totals`: per-burst excess summed where positive, with the nearby
   * refund capped at the excess; a burst whose calls cost more than its
   * debits is a shortfall, reported apart rather than netted away. The
   * refund rule matches by wallet, amount and time, not by reference, so one
   * refund row can sit near two bursts, or near a burst and a no-reference
   * debit outside `mcd` (matched to a failed call, or unmatched) that
   * orphan-debit-trace already credits with it. Either way
   * `excess_refunded_cents` counts a refund that may belong elsewhere, so
   * `refunds_attributed_to_several_bursts` and
   * `refunds_also_near_other_debits` count those refund rows, and
   * `excess_refunded_is_upper_bound` is true unless both are zero.
   * `matched_completed_totals`: the same over all matched completed debits
   * at once, netted (`net_excess_cents` or `net_shortfall_cents`, one of them
   * zero), so the receipt reconciles with orphan-debit-trace and Q2b.
   * Aggregates only: no per-burst row, month, id or user leaves the statement.
   */
  "burst-debit-refund": check({
    prepare: () => null,
    run: async (tx) => {
      const [bursts] = rowsOf(await tx.execute(sql`
        WITH ${NO_REFERENCE_DEBITS},
        ${MATCHED_COMPLETED_DEBITS},
        ord AS (
          SELECT mcd.*,
                 CASE WHEN (LAG(mcd.created_at) OVER w) + interval '60 seconds'
                           >= mcd.created_at - interval '60 seconds'
                      THEN 0 ELSE 1 END AS starts_burst
            FROM mcd
          WINDOW w AS (PARTITION BY mcd.user_id, mcd.solution_slug ORDER BY mcd.created_at, mcd.id)
        ),
        bd AS (
          SELECT ord.*,
                 SUM(ord.starts_burst) OVER (PARTITION BY ord.user_id, ord.solution_slug
                                             ORDER BY ord.created_at, ord.id
                                             ROWS UNBOUNDED PRECEDING) AS burst_no
            FROM ord
        ),
        bc AS (
          SELECT DISTINCT bd.user_id, bd.solution_slug, bd.burst_no, p.call_id, s.price_cents
            FROM bd
            JOIN pairs p ON p.debit_id = bd.id AND p.call_status = 'completed'
            JOIN sol s ON s.id = p.call_id AND s.solution_slug = bd.solution_slug
        ),
        br AS (
          SELECT DISTINCT bd.user_id, bd.solution_slug, bd.burst_no, rf.id, rf.amount_cents
            FROM bd
            JOIN nr ON nr.id = bd.id
            JOIN rf ON ${REFUNDED_NEARBY}
        ),
        b AS (
          SELECT d.debits,
                 d.debited - COALESCE(c.prices, 0) AS excess,
                 COALESCE(r.refunded, 0) AS refunded
            FROM (SELECT user_id, solution_slug, burst_no, COUNT(*)::int AS debits, SUM(debited) AS debited
                    FROM bd GROUP BY 1, 2, 3) d
            LEFT JOIN (SELECT user_id, solution_slug, burst_no, SUM(price_cents) AS prices
                         FROM bc GROUP BY 1, 2, 3) c USING (user_id, solution_slug, burst_no)
            LEFT JOIN (SELECT user_id, solution_slug, burst_no, SUM(amount_cents) AS refunded
                         FROM br GROUP BY 1, 2, 3) r USING (user_id, solution_slug, burst_no)
        ),
        near_other AS (
          SELECT DISTINCT rf.id
            FROM nr
            JOIN rf ON ${REFUNDED_NEARBY}
           WHERE NOT EXISTS (SELECT 1 FROM mcd WHERE mcd.id = nr.id)
        ),
        rc AS (
          SELECT (SELECT COUNT(*) FROM (SELECT br.id FROM br GROUP BY br.id HAVING COUNT(*) > 1) several_bursts) AS several,
                 (SELECT COUNT(DISTINCT br.id) FROM br
                   WHERE EXISTS (SELECT 1 FROM near_other o WHERE o.id = br.id)) AS also_other
        )
        SELECT COUNT(*)::int AS bursts,
               COUNT(*) FILTER (WHERE debits > 1)::int AS multi_debit_bursts,
               COALESCE(SUM(debits) FILTER (WHERE debits > 1), 0)::int AS debits_in_multi_debit_bursts,
               COUNT(*) FILTER (WHERE excess > 0)::int AS bursts_with_excess,
               COUNT(*) FILTER (WHERE excess <= 0)::int AS bursts_without_excess,
               COUNT(*) FILTER (WHERE excess < 0)::int AS bursts_with_shortfall,
               COALESCE(SUM(excess) FILTER (WHERE excess > 0), 0)::bigint::text AS excess_cents_total,
               COALESCE(SUM(LEAST(refunded, excess)) FILTER (WHERE excess > 0), 0)::bigint::text AS excess_refunded_cents,
               COALESCE(SUM(excess - LEAST(refunded, excess)) FILTER (WHERE excess > 0), 0)::bigint::text AS excess_unrefunded_cents,
               COALESCE(-SUM(excess) FILTER (WHERE excess < 0), 0)::bigint::text AS shortfall_cents_total,
               (SELECT several FROM rc)::int AS refunds_attributed_to_several_bursts,
               (SELECT also_other FROM rc)::int AS refunds_also_near_other_debits,
               (SELECT several > 0 OR also_other > 0 FROM rc) AS excess_refunded_is_upper_bound
          FROM b
      `));
      const [all] = rowsOf(await tx.execute(sql`
        WITH ${NO_REFERENCE_DEBITS},
        ${MATCHED_COMPLETED_DEBITS},
        mc_calls AS (
          SELECT DISTINCT p.call_id, s.price_cents
            FROM pairs p
            JOIN sol s ON s.id = p.call_id
           WHERE p.call_status = 'completed'
        ),
        mc_refunds AS (
          SELECT DISTINCT rf.id, rf.amount_cents
            FROM mcd
            JOIN nr ON nr.id = mcd.id
            JOIN rf ON ${REFUNDED_NEARBY}
        ),
        tot AS (
          SELECT (SELECT COUNT(*) FROM mcd) AS debits,
                 (SELECT COALESCE(SUM(debited), 0) FROM mcd) AS debited,
                 (SELECT COUNT(*) FROM mc_calls) AS calls,
                 (SELECT COALESCE(SUM(price_cents), 0) FROM mc_calls) AS prices,
                 (SELECT COALESCE(SUM(amount_cents), 0) FROM mc_refunds) AS refunded,
                 (SELECT COUNT(*) FROM mcd WHERE solutions > 1) AS several
        )
        SELECT debits::int AS debits,
               debited::bigint::text AS debited_cents,
               calls::int AS distinct_matched_completed_solution_calls,
               prices::bigint::text AS recorded_cents,
               GREATEST(debited - prices, 0)::bigint::text AS net_excess_cents,
               GREATEST(prices - debited, 0)::bigint::text AS net_shortfall_cents,
               refunded::bigint::text AS refunded_nearby_cents,
               several::int AS debits_matching_several_solutions
          FROM tot
      `));
      // Each statement is one aggregate row; a missing one reads as nulls.
      return {
        burst_totals: pick(bursts ?? {}, BURST_TOTAL_FIELDS),
        matched_completed_totals: pick(all ?? {}, MATCHED_COMPLETED_TOTAL_FIELDS),
      };
    },
  }),

  /**
   * A-7 follow-up: some debits reference call rows that are gone while their
   * `transaction_quality` rows survive, although schema.ts declares
   * transaction_quality.transaction_id -> transactions.id ON DELETE CASCADE.
   * `foreign_keys`: every such constraint in pg_constraint, matched by its
   * columns (not its name), with confdeltype, convalidated and condeferrable
   * as Postgres stores them; an empty list means the key is absent in this
   * database. `orphaned_*`: transaction_quality rows with no transactions
   * row, split by whether a purchase debit references the same id, and how
   * many carry the soft-delete marker. Catalog flags and counts only: no id,
   * constraint name, month or user.
   */
  "transaction-quality-fk": check({
    prepare: () => null,
    run: async (tx) => {
      const fks = rowsOf(await tx.execute(sql`
        SELECT c.confdeltype::text AS confdeltype,
               c.convalidated,
               c.condeferrable
          FROM pg_constraint c
          JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attname = 'transaction_id'
          JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attname = 'id'
         WHERE c.contype = 'f'
           AND c.conrelid = 'transaction_quality'::regclass
           AND c.confrelid = 'transactions'::regclass
           AND c.conkey = ARRAY[a.attnum]
           AND c.confkey = ARRAY[fa.attnum]
         ORDER BY 1, 2, 3
      `));
      const [orphaned] = rowsOf(await tx.execute(sql`
        SELECT COUNT(*)::int AS orphaned_rows,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM wallet_transactions w
                                               WHERE w.type = 'purchase' AND w.reference_id = q.transaction_id))::int AS orphaned_with_debit,
               COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM wallet_transactions w
                                                   WHERE w.type = 'purchase' AND w.reference_id = q.transaction_id))::int AS orphaned_without_debit,
               COUNT(*) FILTER (WHERE q.deleted_at IS NOT NULL)::int AS orphaned_soft_deleted
          FROM transaction_quality q
         WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = q.transaction_id)
      `));
      return {
        foreign_key_exists: fks.length > 0,
        foreign_keys: fks.map((r) => pick(r, FOREIGN_KEY_FIELDS)),
        // A missing row reads as nulls, not as a confident zero.
        ...pick(orphaned ?? {}, ORPHANED_QUALITY_FIELDS),
      };
    },
  }),
};

export function isOpsReadCheck(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(OPS_READ_CHECKS, name);
}
