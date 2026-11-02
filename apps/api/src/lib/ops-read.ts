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

type Shape = "count" | "cents" | "slug" | "uuid" | "date" | "timestamp" | "boolean" | "commit" | "list" | "object";

const SHAPES: Record<Exclude<Shape, "list" | "object" | "count" | "boolean">, RegExp> = {
  cents: /^\d{1,12}$/, // non-negative integer cents, as a string (postgres bigint)
  slug: /^[a-z0-9][a-z0-9-]{0,80}$/, // capability slugs; no underscores, so no sk_/key-like tokens
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  timestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
  commit: /^[0-9a-f]{12}$/,
};

/** Test types and modes: a closed vocabulary, not a pattern. */
const TEST_TYPES = new Set(["known_answer", "schema_check", "negative", "edge_case", "known_bad", "dependency_health", "regression", "piggyback"]);
const TEST_MODES = new Set(["live", "fixture", "canary"]);

/** Every key a check may return, and the one shape each accepts. Null is allowed for any leaf. */
const OUTPUT_FIELDS: Record<string, Shape | "test_type" | "test_mode"> = {
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
};

export class OpsReadOutputError extends Error {
  constructor(path: string) {
    super(`ops-read output refused at ${path}: the key is not listed in OUTPUT_FIELDS or its value has the wrong shape`);
    this.name = "OpsReadOutputError";
  }
}

function checkLeaf(shape: Shape | "test_type" | "test_mode", value: unknown, path: string): void {
  if (value === null) return;
  const ok = (() => {
    switch (shape) {
      case "count": return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
      case "boolean": return typeof value === "boolean";
      case "test_type": return typeof value === "string" && TEST_TYPES.has(value);
      case "test_mode": return typeof value === "string" && TEST_MODES.has(value);
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
};

export function isOpsReadCheck(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(OPS_READ_CHECKS, name);
}
