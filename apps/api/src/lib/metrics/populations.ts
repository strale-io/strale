/**
 * Who counts. Defined once, because two of the August failures came from
 * bespoke inline filters — one that let a test account through as a customer,
 * and one that counted health checkers as prospective buyers.
 *
 * Cross-provider review also rejected the binary customer/monitor split used on
 * 2026-08-15: registry indexers, uptime monitors and unidentified callers are
 * three different things, and collapsing them discards the evidence that tells
 * you which. Hence explicit categories, with `unknown` kept OUT of any
 * conversion claim rather than silently counted as demand.
 */
import { sql, type SQL } from "drizzle-orm";
import { INTERNAL_EMAIL_LIKE_PATTERNS, EXTRA_EXCLUDED_EMAILS } from "../internal-accounts.js";

/** Excludes our own accounts. ~98% of platform traffic is the test harness. */
export function externalCustomers(alias = "t"): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.user_id IS NULL OR ${a}.user_id NOT IN (
    SELECT id FROM users WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
      OR email = ANY(${EXTRA_EXCLUDED_EMAILS})))`;
}

export type CallerCategory = "known_monitor" | "known_indexer" | "customer_candidate" | "unknown";

/**
 * Signatures we have actually observed, rather than a guess at the vocabulary
 * of monitoring. The earlier substring list would have discarded a genuine
 * client called `company-registry-bot` as non-demand; naming what we have seen
 * is narrower and honest about its limits.
 */
const KNOWN_MONITORS = [
  "glimind-probe", "mcpbeat", "yellowmcp-health", "aisec-registry-probe",
  "reliability-bureau-spike", "mcpscoringengine", "x402-observatory",
];
const KNOWN_INDEXERS = ["smithery-probe", "glama", "agent-tools.cloud"];

export function categorise(ua: string | null | undefined): CallerCategory {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  if (KNOWN_MONITORS.some((m) => u.includes(m))) return "known_monitor";
  if (KNOWN_INDEXERS.some((m) => u.includes(m))) return "known_indexer";
  return "customer_candidate";
}

/**
 * SQL predicates. Written so NULL user agents land in `unknown` rather than
 * evaporating: `NOT (NULL ILIKE ANY(...))` is NULL, not true, which on
 * 2026-08-15 silently removed those rows from both populations at once.
 */
function anyOf(alias: string, needles: string[]): SQL {
  return sql`(${sql.raw(alias)}.ua IS NOT NULL AND ${sql.raw(alias)}.ua ILIKE ANY(${needles.map((n) => `%${n}%`)}))`;
}
export const isKnownMonitor = (a = "dh") => anyOf(a, KNOWN_MONITORS);
export const isKnownIndexer = (a = "dh") => anyOf(a, KNOWN_INDEXERS);
export const isAutomatedTooling = (a = "dh") => sql`(${isKnownMonitor(a)} OR ${isKnownIndexer(a)})`;
export const isCustomerCandidate = (a = "dh") =>
  sql`(${sql.raw(a)}.ua IS NOT NULL AND NOT ${isAutomatedTooling(a)})`;
export const isUnknownCaller = (a = "dh") => sql`(${sql.raw(a)}.ua IS NULL)`;

/**
 * The identifier in discovery_hits rotates its salt every UTC day, on purpose —
 * so we never accumulate a profile of any caller. The cost is that distinct
 * counts across days are VISIT-DAYS, not visitors, and no amount of SQL
 * recovers the difference. Exported as a constant so the wording is identical
 * everywhere it is shown, and impossible to quietly downgrade to "agents".
 */
export const VISIT_DAY_CAVEAT =
  "Counted as visit-days, not individuals — the caller's identifier is scrambled " +
  "fresh each day so we never build a profile of anyone. One agent visiting daily " +
  "counts as seven.";
