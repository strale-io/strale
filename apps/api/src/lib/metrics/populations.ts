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
import {
  internalAccountEmailExclusionSql,
  isInternalAccountEmail,
} from "../internal-accounts.js";

/**
 * Excludes traffic that is ours. ~98% of platform traffic is the test harness.
 *
 * Two things are ours, not one. The obvious one is an internal account. The
 * other is `status = 'health_probe'` — 507 rows written by our own server as a
 * database liveness check (`app.ts`, `solution_slug = '_health_probe'`), every
 * one of them with no user, no price and no payer. They are not executions and
 * the repository already knew it in two places (`rail-coverage.test.ts` calls
 * them "not an execution of anything"; `integrity-hash-retry.ts` allowlists
 * them out of the audit chain) — but this predicate did not, so a row-counting
 * consumer treated them as anonymous customers. Revenue consumers never saw it
 * because they all filter `status = 'completed'`; `identityCoverage()` counts
 * rows and did. Found by independent review of PR #507, 2026-09-05.
 */
export function externalCustomers(alias = "t"): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.status <> ${HEALTH_PROBE_STATUS}
    AND (${a}.user_id IS NULL OR ${a}.user_id NOT IN (${internalUserIds()})))`;
}

/**
 * Our own database-liveness row. Not an execution, not a caller, not a customer.
 * Named once so the partition and the filter cannot disagree about it.
 */
export const HEALTH_PROBE_STATUS = "health_probe";

/**
 * The set of our own accounts, as a subquery. Extracted so `externalCustomers`
 * and `callerClassSql` cannot drift apart: there is one definition of "ours",
 * and both the filter and the partition are expressed against it.
 */
export function internalUserIds(): SQL {
  // Delegates to `internalAccountEmailExclusionSql()` rather than rebuilding
  // the OR-chain. An earlier version of this function inlined its own copy,
  // which put two SQL definitions of "ours" in the tree while the comment
  // above claimed there was one — review caught the docstring naming a
  // function the file did not import. One definition, or the sentence is a
  // lie the next reader will trust.
  return sql`SELECT id FROM users WHERE ${internalAccountEmailExclusionSql()}`;
}

/**
 * Who a `transactions` row belongs to, as three classes rather than a filter.
 *
 * `externalCustomers()` above is the right predicate and it is not enough, for
 * a reason measured on 2026-09-04: it is something a caller has to *remember*
 * to apply, and the failure mode when they forget is silent and flattering to
 * whatever claim they are making. A merged change had reported three
 * capabilities crashing "in production, last 24h" at 13/12/12 calls, sourced
 * from an unfiltered `transactions` query. Every one of those calls — 2,425 of
 * them, going back to 2026-05-29 — was the internal test harness deliberately
 * sending malformed input at its own negative tests. No customer had ever hit
 * any of the three.
 *
 * On this platform an unfiltered count is, by default, a harness count: the
 * harness is roughly 98% of all traffic. So the repair is not another filter
 * but a **partition** — a shape that cannot render a customer figure without
 * also rendering the harness figure beside it, so "13 calls" can never again be
 * read as "13 customers" by omission. Same principle as
 * `Concentration.comparable` (LESSONS.md F2 incident 9): where the safe value
 * is also the default, an opt-in guard is a convention, not a guard.
 *
 * The classes are exhaustive and mutually exclusive:
 *   `harness`   — ours. One of our own accounts (the suffix rule in
 *                 internal-accounts), or one of our own `health_probe` rows.
 *   `account`   — a registered, non-internal user. A real customer.
 *   `x402`      — no account, but a wallet paid. Where nearly all revenue
 *                 arrives, and emphatically NOT "unattributed noise".
 *   `anonymous` — no account and no payment: free-tier, progressive-unlock and
 *                 the website demo. A caller, not necessarily a customer.
 *
 * The last two were one class until 2026-09-05, labelled "anonymous (x402)",
 * and the label was wrong: `do.ts` says in terms that a null `user_id` serves
 * *three* cases, and over 30 days 59 of those rows were free-tier calls with no
 * wallet behind them — Deno and curl user agents, and browser hits refered from
 * the website. Folding a crawler's failed free-tier calls into "N customer
 * call(s)" is the same misreading this module exists to prevent, one level
 * down. `x402_payer_hash` is indexed, so the split costs nothing.
 *
 * `health_probe` is checked FIRST and independently of `user_id`, because those
 * rows carry no user and would otherwise land in `anonymous` — which is exactly
 * how they were being printed as failing customer calls.
 *
 * `account` + `anonymous` is exactly the population `externalCustomers()`
 * admits, and `harness` is exactly the population it excludes — by
 * construction, not by a parallel rule: both are built from the same
 * `internalAccountEmailExclusionSql()`. `populations.test.ts` renders both
 * through the Postgres dialect and fails if the two ever stop agreeing.
 */
export type CallerClass = "harness" | "account" | "x402" | "anonymous";

export const CALLER_CLASSES: readonly CallerClass[] = ["harness", "account", "x402", "anonymous"];

/** The classes that are somebody other than us. `harness` is the complement. */
export const EXTERNAL_CALLER_CLASSES: readonly CallerClass[] = ["account", "x402", "anonymous"];

/**
 * SQL classifying a `transactions` row. Needs no join — the internal-account
 * test is a subquery, the same one `externalCustomers()` uses.
 */
export function callerClassSql(alias = "t"): SQL {
  const a = sql.raw(alias);
  return sql`(CASE
    WHEN ${a}.status = ${HEALTH_PROBE_STATUS} THEN 'harness'
    WHEN ${a}.user_id IS NULL AND ${a}.x402_payer_hash IS NOT NULL THEN 'x402'
    WHEN ${a}.user_id IS NULL THEN 'anonymous'
    WHEN ${a}.user_id IN (${internalUserIds()}) THEN 'harness'
    ELSE 'account' END)`;
}

/**
 * The TypeScript twin of `callerClassSql`, for rows already in hand.
 * `hasUser` is false when `user_id` is null — passing an email of `null` for a
 * row that *does* have a user id would otherwise be indistinguishable from an
 * anonymous row, and that conflation is the whole point of the type.
 *
 * `row` carries the two fields the SQL branches on before it looks at the user.
 * They are optional so existing callers keep compiling, and both default to the
 * shape of an ordinary execution — a defaulting that is safe in one direction
 * only: omitting `status` can misclassify one of our probes as a caller, never
 * a caller as ours. `populations.test.ts` pins both branches against the SQL.
 */
export function callerClass(
  email: string | null | undefined,
  hasUser: boolean,
  row: { status?: string | null; hasX402Payer?: boolean } = {},
): CallerClass {
  if (row.status === HEALTH_PROBE_STATUS) return "harness";
  if (!hasUser) return row.hasX402Payer ? "x402" : "anonymous";
  return isInternalAccountEmail(email) ? "harness" : "account";
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
  const a = sql.raw(alias);
  const chain = sql.join(needles.map((n) => sql`${a}.ua ILIKE ${`%${n}%`}`), sql` OR `);
  return sql`(${a}.ua IS NOT NULL AND (${chain}))`;
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
