/**
 * Regression tests for the 2026-08-16 close-out review findings.
 *
 * Per DEC-20260504-A every audit-follow-up that introduces a code path ships a
 * test that fails against the un-applied fix and passes against the applied
 * one. Each block below names the finding, states the failure it locks out,
 * and asserts on the *structural shape* of the fix rather than on a live
 * database — the same approach the PR-43 bind-encoder test took, and for the
 * same reason: these are all bugs where the code read fine and the shape was
 * wrong.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { customerContentMatches } from "./customer-content.js";
import { rankBySales } from "./seller-rank.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(join(HERE, "..", rel), "utf8");

/**
 * Source with comments removed. These assertions are about what the code does;
 * a docstring that *describes* the old bug (and every fix here carries one)
 * would otherwise match the pattern that proves the bug is present.
 */
const readCode = (rel: string) =>
  readSrc(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const dialect = new PgDialect();

// ── H1 · every retention loop read a field this driver never sets ───────────
describe("data-retention: affected-row counting", () => {
  const src = readCode("lib/data-retention.ts");

  it("never reads .rowCount — postgres-js reports affected rows as .count", () => {
    // The bug: `(result as any).rowCount ?? 0` is always 0 on this driver, so
    // `if (count < BATCH_SIZE) break` fired on the first iteration and every
    // summary counter logged 0 forever.
    expect(src).not.toMatch(/\.rowCount/);
    expect(src).toMatch(/function affected\(result: unknown\): number/);
  });

  it("every drain loop is capped per invocation (DEC-20260504-B)", () => {
    // Matched by STRUCTURE, not by one exact line. The original required the
    // literal `if (count < BATCH_SIZE || ++batches >= MAX_BATCHES_PER_RUN)`,
    // so splitting a loop's break in two — which purgeCustomerContent does, to
    // record that it stopped at the ceiling rather than because the work ran
    // out — read as an uncapped loop and failed a correctly capped drain.
    //
    // The property that matters is that each loop's short-batch break is
    // accompanied by a MAX_BATCHES_PER_RUN break, in either shape. Taking the
    // window from one `count < BATCH_SIZE` to the next keeps that per-loop:
    // a loop that drops its cap still fails, because the reference has to
    // appear within its own window and not a neighbour's.
    const loops = [...src.matchAll(/if \(count < BATCH_SIZE/g)];
    expect(loops.length).toBeGreaterThan(0);

    for (const [i, loop] of loops.entries()) {
      const start = loop.index;
      const end = i + 1 < loops.length ? loops[i + 1].index : src.length;
      const window = src.slice(start, end);
      expect(window, `drain loop ${i + 1} of ${loops.length} has no MAX_BATCHES_PER_RUN cap`)
        .toMatch(/\+\+batches >= MAX_BATCHES_PER_RUN/);
    }
  });
});

// ── H2 · a content redaction was marking rows logically deleted ─────────────
describe("data-retention: the 90-day sweep redacts, it does not delete", () => {
  const src = readCode("lib/data-retention.ts");
  const purge = src.slice(src.indexOf("async function purgeCustomerContent"));

  // The two chain-classification cases this fix depends on live in
  // routes/verify.test.ts, next to the module they exercise — importing a route
  // module from a lib test drags its module-level rate-limiter state into the
  // shared worker and destabilises unrelated route suites.
  it("purgeCustomerContent does not set deleted_at", () => {
    // Setting it hid the whole row from the transaction list, transaction
    // detail, the audit-record endpoint behind every shareable audit URL, and
    // the A2A task lookup — all of which filter `deleted_at IS NULL`. The
    // docstring promises the Art. 30 skeleton survives 1095 days; setting
    // deleted_at made that true in the table and false through the API.
    expect(purge).not.toMatch(/deleted_at = NOW\(\)/);
    expect(purge).toMatch(/redacted_at = NOW\(\)/);
  });

  it("the 1095-day deletion still sets deleted_at — there the row IS gone", () => {
    const hard = src.slice(
      src.indexOf("async function purgeTransactions"),
      src.indexOf("async function purgeHealthMonitorEvents"),
    );
    expect(hard).toMatch(/deleted_at = NOW\(\)/);
  });

});

// ── H3/H4 · the agent card advertised endpoints the gateway would 404 ───────
describe("agent card: only advertise what the gateway serves", () => {
  const src = readCode("routes/a2a.ts");

  it("reads the two columns the gateway gates on", () => {
    // Measured against production 2026-08-16: the card listed 307 capabilities
    // and 98 solutions; the gateway would serve 249 and 79. 66 advertised
    // endpoints 404'd — and each 404 wrote a false `x402_unknown_slug` row
    // into the demand table, so the card manufactured build-signal from its
    // own bug.
    expect(src).toMatch(/x402Enabled: capabilities\.x402Enabled/);
    expect(src).toMatch(/lifecycleState: capabilities\.lifecycleState/);
    expect(src).toMatch(/x402Enabled: solutions\.x402Enabled/);
  });

  it("gates every x402_endpoint on payableViaX402", () => {
    const emits = src.match(/x402_endpoint: [^\n]*/g) ?? [];
    expect(emits.length).toBeGreaterThan(0);
    for (const line of emits) expect(line).toMatch(/payable/);
  });

  it("advertises solutions at the solutions path, not the capability wildcard", () => {
    // `/x402/{slug}` is the capability wildcard. Solutions live at
    // `/x402/v2/solutions/{slug}`; the old form fell through and 404'd for
    // every solution on the card.
    expect(src).toMatch(/\/x402\/v2\/solutions\/\$\{slug\}/);
    expect(src).not.toMatch(/x402_endpoint: payableViaX402\(sol\) \? `\$\{PUBLIC_API_BASE\}\/x402\/\$\{sol\.slug\}`/);
  });

  it("uses the shared ranker rather than a private copy", () => {
    // The copy had neither the 15-minute cache (this surface is fetched ~520×
    // a week) nor the fail-open catch, so a ranking-query failure 500'd the
    // card — the exact outcome seller-rank.ts says it exists to prevent.
    expect(src).toMatch(/from "\.\.\/lib\/seller-rank\.js"/);
    expect(src).not.toMatch(/async function externalRevenueBySlug/);
  });
});

// ── M6 · an OR chain with no parentheses inverts the caller's WHERE ─────────
describe("customerContentMatches", () => {
  it("is parenthesised, so AND/OR precedence cannot silently invert", () => {
    const q = dialect.sqlToQuery(sql`SELECT 1 WHERE deleted_at IS NULL AND ${customerContentMatches("x")}`);
    expect(q.sql).toMatch(/AND \(/);
    // Unwrapped this renders `AND a ILIKE .. OR b ILIKE ..`, and AND binds
    // tighter than OR — the deleted_at filter would apply to the first column
    // only.
    expect(q.sql).not.toMatch(/AND [a-z_.]+::text ILIKE \$1 OR/);
  });

  it("escapes ILIKE wildcards so an audit cannot over-match", () => {
    const q = dialect.sqlToQuery(customerContentMatches("100%_off"));
    expect(q.params[0]).toBe("%100\\%\\_off%");
    expect(q.sql).toMatch(/ESCAPE/);
  });
});

// ── M10 · a ranker that claimed solutions but could only see capabilities ───
describe("seller-rank", () => {
  it("reads solution_slug, so solutions can actually rank", () => {
    // Solution executions carry `capability_id IS NULL` (schema.ts:244), so the
    // old `JOIN capabilities` could never match one: every solution scored 0
    // and `rankBySales` over a solution catalogue was an alphabetical sort
    // wearing a revenue label.
    const src = readCode("lib/seller-rank.ts");
    // The selected slug, specifically — a solution row has no capability to
    // join to, so an inner join drops it before it can be summed.
    expect(src).toMatch(/COALESCE\(t\.solution_slug, c\.slug\) AS slug/);
    expect(src).toMatch(/LEFT JOIN capabilities c/);
  });

  it("orders paid sellers by revenue, then free, then alphabetically", () => {
    const items = [
      { slug: "zeta", free: false },
      { slug: "alpha", free: false },
      { slug: "free-thing", free: true },
      { slug: "earner", free: false },
    ];
    const ranked = rankBySales(
      items,
      new Map([["earner", 500]]),
      (i) => i.slug,
      (i) => i.free,
    );
    expect(ranked.map((i) => i.slug)).toEqual(["earner", "free-thing", "alpha", "zeta"]);
  });
});

// ── M3 · the heartbeat's threshold could never fire ─────────────────────────
describe("revenue heartbeat: the alert can detect the outage it cites", () => {
  const src = readCode("jobs/revenue-heartbeat.ts");

  it("measures cadence between calls, not across days", () => {
    // The old estimate was `TRAILING_DAYS × 24 ÷ distinct_active_days`. Active
    // days cannot exceed the window, so it could not return under ~24h, so
    // `max(24, cadence × 3)` could not drop under ~72h — and the 21-hour
    // settlement outage named in the file's own docstring would not have
    // fired.
    expect(src).not.toMatch(/\$\{String\(TRAILING_DAYS\)\} \* 24\.0/);
    expect(src).toMatch(/MAX\(created_at\) - MIN\(created_at\)/);
    expect(src).toMatch(/GREATEST\(COUNT\(\*\) - 1, 1\)/);
  });

  it("the floor is below the 21-hour incident it was built for", () => {
    const m = src.match(/const MIN_SILENCE_HOURS = (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(21);
  });

  it("derives the actor key from the identity spine, not a local copy", () => {
    // Two key formats created the same day (`x402:abc` vs `x402:v1:abc`) in a
    // module whose whole point is that the two definitions cannot drift.
    expect(src).toMatch(/ACTOR_KEY_SQL/);
    expect(src).not.toMatch(/'x402:' \|\| t\.x402_payer_hash/);
  });
});

// ── M1 · a comment claimed a test that did not exist ────────────────────────
describe("metrics: window bounds are bound as strings", () => {
  it("no Date instance is interpolated into a metrics query", () => {
    // metrics.ts said "a test asserts the source contains no raw Date
    // interpolation." No such test existed. This is it. The failure mode is
    // the PR-43 defect: postgres-js cannot encode a Date passed through a
    // drizzle sql`` template, and the query throws ERR_INVALID_ARG_TYPE at
    // runtime — invisible to tsc.
    const src = readCode("lib/metrics/metrics.ts");
    // A bare Date reaching a bind slot is the failure. Anything ending in
    // .toISOString() or coming from bounds() is a string and binds fine.
    const binds = src.match(/\$\{[^}]*\b(?:from|to)\b[^}]*\}/g) ?? [];
    expect(binds.length).toBeGreaterThan(0);
    for (const b of binds) {
      expect(b, `unencoded Date bind: ${b}`).toMatch(/toISOString\(\)|bounds\(/);
    }
    expect(src).toMatch(/function bounds\(w: Window\)/);
    expect(src).toMatch(/w\.from\.toISOString\(\), to: w\.to\.toISOString\(\)/);
  });
});
