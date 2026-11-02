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
 *     range, validated to YYYY-MM-DD and bound as a parameter.
 *   - Every check runs in a READ ONLY transaction with a short statement
 *     timeout.
 *   - Output is counts, sums, slugs, identifiers, timestamps and booleans
 *     only. `assertSafeOutput` refuses any other string, so a free-text or
 *     customer-content value cannot leave through a check written later.
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

export const OPS_READ_TOKEN_ENV = "STRALE_OPS_READ_TOKEN";
export const OPS_READ_TOKEN_MIN_LENGTH = 32;
/** Longest date range `test-call-cost` accepts, in days. */
export const MAX_RANGE_DAYS = 92;
const DEFAULT_RANGE_DAYS = 30;

/** True only for a configured, long-enough token that matches exactly. */
export function isValidOpsReadAuth(header: string | undefined, token: string | undefined): boolean {
  if (!header || !token || token.length < OPS_READ_TOKEN_MIN_LENGTH) return false;
  const expected = Buffer.from(`Bearer ${token}`, "utf-8");
  const provided = Buffer.from(header, "utf-8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// ─── Output contract ────────────────────────────────────────────────────────

const SAFE_STRING_PATTERNS: readonly RegExp[] = [
  /^[a-z0-9][a-z0-9_-]{0,80}$/, // slugs, test types, modes, statuses, check names
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, // uuids
  /^\d{4}-\d{2}-\d{2}$/, // dates
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, // ISO timestamps (UTC)
  /^-?\d+(\.\d+)?$/, // numeric strings (postgres numeric / bigint)
];
const SAFE_KEY = /^[a-z][a-z0-9_]{0,60}$/;

export class OpsReadOutputError extends Error {
  constructor(path: string) {
    super(`ops-read output refused at ${path}: only counts, sums, slugs, identifiers, timestamps and booleans may leave this endpoint`);
    this.name = "OpsReadOutputError";
  }
}

/**
 * Throws `OpsReadOutputError` unless every leaf is a number, boolean, null or
 * an allowed string shape, and every key is snake_case. Dates are converted to
 * ISO strings first. Returns the (converted) value.
 */
export function assertSafeOutput(value: unknown, path = "$"): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new OpsReadOutputError(path);
    return value;
  }
  if (value instanceof Date) return assertSafeOutput(value.toISOString(), path);
  if (typeof value === "string") {
    if (SAFE_STRING_PATTERNS.some((re) => re.test(value))) return value;
    throw new OpsReadOutputError(path);
  }
  if (Array.isArray(value)) return value.map((v, i) => assertSafeOutput(v, `${path}[${i}]`));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!SAFE_KEY.test(k)) throw new OpsReadOutputError(`${path}.<key>`);
      out[k] = assertSafeOutput(v, `${path}.${k}`);
    }
    return out;
  }
  throw new OpsReadOutputError(path);
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
 * `from`/`to` as YYYY-MM-DD (UTC, both inclusive). Defaults to the last 30
 * days ending today. Returned as strings: they are bound to SQL as text and
 * cast there, never as Date objects (DEC-20260504-A, the PR-43 class).
 */
export function parseDateRange(
  query: { from?: string; to?: string },
  now: Date = new Date(),
): { from: string; to: string } {
  const today = now.toISOString().slice(0, 10);
  const to = query.to ?? today;
  if (!DATE_RE.test(to) || !isRealDate(to)) throw new OpsReadInputError("'to' must be a date as YYYY-MM-DD");
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const from = query.from ?? new Date(toMs - (DEFAULT_RANGE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  if (!DATE_RE.test(from) || !isRealDate(from)) throw new OpsReadInputError("'from' must be a date as YYYY-MM-DD");
  const span = (toMs - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (span < 1) throw new OpsReadInputError("'from' must not be after 'to'");
  if (span > MAX_RANGE_DAYS) throw new OpsReadInputError(`the range may be at most ${MAX_RANGE_DAYS} days`);
  return { from, to };
}

// ─── Checks ─────────────────────────────────────────────────────────────────

/** The read-only executor a check receives (a drizzle transaction). */
export interface ReadExecutor {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

type Query = { from?: string; to?: string };

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return ((result as { rows?: unknown[] })?.rows ?? []) as Record<string, unknown>[];
}

const PARKED_PATTERN = `${PAID_CALL_QUARANTINE_MARKER}%`;

/**
 * Each check is fixed SQL. The only caller input is the validated date range
 * of `test-call-cost`, bound as a parameter. Selected columns are identifiers,
 * statuses, counts and timestamps; never input, output, baseline or reason
 * text.
 */
export const OPS_READ_CHECKS: Record<string, (tx: ReadExecutor, query: Query) => Promise<unknown>> = {
  /** The commit this API process was built from. No database read. */
  build: async () => ({
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  }),

  /** Suites the paid-call guard parked (lib/paid-call-guard.ts). */
  "parked-suites": async (tx) => {
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
       WHERE ts.test_status = 'quarantined'
         AND ts.quarantine_reason LIKE ${PARKED_PATTERN}
       ORDER BY ts.capability_slug, ts.test_type
    `));
    return { count: rows.length, suites: rows };
  },

  /**
   * Strale's own scheduled test runs per UTC day, with the declared external
   * cost (`test_suites.external_cost_cents` at read time, times runs). Test
   * runs carry no measured cost: their LLM spend is only logged. Piggyback
   * rows come from customer traffic and are excluded. `parked_suites` gives
   * the same totals for each parked suite, so runs x price-per-call answers
   * what the paid-call leak cost.
   */
  "test-call-cost": async (tx, query) => {
    const { from, to } = parseDateRange(query);
    const days = rowsOf(await tx.execute(sql`
      SELECT to_char(date_trunc('day', tr.executed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS runs,
             COALESCE(SUM(COALESCE(ts.external_cost_cents, 0)), 0)::bigint::text AS declared_external_cost_cents
        FROM test_results tr
        JOIN test_suites ts ON ts.id = tr.test_suite_id
       WHERE ts.test_type <> 'piggyback'
         AND tr.executed_at >= (${from}::date)::timestamp AT TIME ZONE 'UTC'
         AND tr.executed_at <  ((${to}::date) + 1)::timestamp AT TIME ZONE 'UTC'
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
         AND tr.executed_at >= (${from}::date)::timestamp AT TIME ZONE 'UTC'
         AND tr.executed_at <  ((${to}::date) + 1)::timestamp AT TIME ZONE 'UTC'
       WHERE ts.test_status = 'quarantined'
         AND ts.quarantine_reason LIKE ${PARKED_PATTERN}
       GROUP BY ts.id, ts.capability_slug, ts.test_type
       ORDER BY ts.capability_slug, ts.test_type
    `));
    return { from, to, days, parked_suites: parked };
  },
};

export function isOpsReadCheck(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(OPS_READ_CHECKS, name);
}
