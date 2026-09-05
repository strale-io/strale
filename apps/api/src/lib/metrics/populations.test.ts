/**
 * The caller-class partition, and the invariant that makes it trustworthy.
 *
 * Background (2026-09-04, LESSONS.md F2 incident 10): a merged change reported
 * three capabilities crashing "in production, last 24h" at 13/12/12 calls,
 * measured with an unfiltered `transactions` query. All 2,425 such rows, back
 * to 2026-05-29, were the internal test harness feeding malformed input to its
 * own negative tests. No customer had ever hit any of them. The harness is
 * ~98% of platform traffic, so an unfiltered count is a harness count by
 * default.
 *
 * The repair is a partition rather than another filter, and its whole value
 * rests on one property: that `harness` is EXACTLY what `externalCustomers()`
 * excludes. A partition that drifted from the filter would be worse than
 * neither, because two documents would then disagree about who a customer is.
 * The first test below is that property, and it is checked structurally —
 * against the rendered SQL and its bind parameters — rather than asserted in
 * a comment.
 */
import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  externalCustomers,
  internalUserIds,
  callerClass,
  callerClassSql,
  CALLER_CLASSES,
  EXTERNAL_CALLER_CLASSES,
  HEALTH_PROBE_STATUS,
} from "./populations.js";
import {
  INTERNAL_EMAIL_SUFFIXES,
  EXTRA_EXCLUDED_EMAILS,
  SYSTEM_ACCOUNT_EMAIL,
} from "../internal-accounts.js";

const dialect = new PgDialect();
const render = (tag: ReturnType<typeof externalCustomers>) => dialect.sqlToQuery(tag);

/**
 * Bind placeholders are numbered by position in the whole statement, so adding
 * one parameter ahead of the internal-identity subquery renumbers every
 * placeholder inside it and a literal substring match breaks even though the
 * subquery is byte-identical. That is exactly what adding the `health_probe`
 * bind did. Normalising the numbering keeps this checking the thing it was
 * written to check — that both expressions embed the SAME subquery — instead of
 * incidentally checking where its parameters happen to sit.
 */
const anonymisePlaceholders = (sqlText: string) => sqlText.replace(/\$\d+/g, "$?");

/** True when `needle` appears inside `haystack` in order, as a run. */
const containsRun = <T,>(haystack: readonly T[], needle: readonly T[]) =>
  needle.length === 0 ||
  haystack.some((_, i) => needle.every((v, j) => haystack[i + j] === v));

describe("the partition and the filter cannot drift apart", () => {
  it("both express 'ours' with the identical subquery and the identical binds", () => {
    const subquery = render(internalUserIds());
    const filter = render(externalCustomers("t"));
    const partition = render(callerClassSql("t"));

    // Same text, embedded in both (modulo bind numbering — see the helper).
    expect(anonymisePlaceholders(filter.sql)).toContain(anonymisePlaceholders(subquery.sql));
    expect(anonymisePlaceholders(partition.sql)).toContain(anonymisePlaceholders(subquery.sql));
    // Same binds, contiguous and in the same order — a matching string with
    // different parameters would classify different accounts as ours. Both
    // expressions now carry a `health_probe` bind ahead of the subquery, so
    // this is a run-match rather than whole-list equality; reordering or
    // dropping any identity bind still fails.
    expect(containsRun(filter.params, subquery.params)).toBe(true);
    expect(containsRun(partition.params, subquery.params)).toBe(true);
  });

  it("the filter admits exactly the two non-harness classes", () => {
    const filter = render(externalCustomers("t")).sql;
    // externalCustomers = anonymous (user_id IS NULL) OR account (NOT ours).
    expect(filter).toContain("t.user_id IS NULL");
    expect(filter).toContain("t.user_id NOT IN");
    // and the partition's harness branch is the same test, unnegated.
    const partition = render(callerClassSql("t")).sql;
    expect(partition).toContain("t.user_id IS NULL THEN 'anonymous'");
    expect(partition).toMatch(/t\.user_id IN \(SELECT id FROM users[\s\S]*THEN 'harness'/);
  });

  it("every internal-account rule is carried into the partition's binds", () => {
    const params = render(callerClassSql("t")).params as string[];
    for (const suffix of INTERNAL_EMAIL_SUFFIXES) expect(params).toContain(`%${suffix}`);
    for (const email of EXTRA_EXCLUDED_EMAILS) expect(params).toContain(email);
  });
});

describe("callerClass — the TypeScript twin", () => {
  it("classifies the harness account as harness", () => {
    expect(callerClass(SYSTEM_ACCOUNT_EMAIL, true)).toBe("harness");
  });

  it("classifies every internal suffix as harness, not just the system account", () => {
    for (const suffix of INTERNAL_EMAIL_SUFFIXES) {
      expect(callerClass(`someone${suffix}`, true)).toBe("harness");
    }
    for (const email of EXTRA_EXCLUDED_EMAILS) {
      expect(callerClass(email, true)).toBe("harness");
    }
  });

  it("classifies a registered outside buyer as account", () => {
    expect(callerClass("provider@dlgt.io", true)).toBe("account");
  });

  /**
   * The discriminating case. A row with a user id but no email in hand is NOT
   * anonymous — it is an account we failed to join. Collapsing the two would
   * move real customers into the same bucket as the x402 rail and make the
   * partition unable to answer the question it exists for.
   */
  it("does not confuse 'no user' with 'user whose email we did not fetch'", () => {
    expect(callerClass(null, false)).toBe("anonymous");
    expect(callerClass(null, true)).toBe("account");
    expect(callerClass(undefined, true)).toBe("account");
  });

  it("is case-insensitive about our own domains", () => {
    expect(callerClass("SYSTEM@STRALE.INTERNAL", true)).toBe("harness");
  });

  /**
   * The one pair that genuinely could drift, and originally had no test.
   *
   * `callerClass` lowercases (via `isInternalAccountEmail`); Postgres `LIKE`
   * and `=` on a `varchar` column do not. So for `SYSTEM@STRALE.INTERNAL` the
   * TypeScript twin said `harness` while the SQL said `account` — the two
   * halves of a partition whose stated thesis is that they cannot disagree.
   * Latent rather than live (every production `users.email` is lower-case, and
   * both auth write paths lower-case on insert), and the first writer that
   * does not lower-case would have made it real, silently, in the predicate
   * that gates the quality floor.
   *
   * The structural tests above render both sides and compare them, which
   * proves they are built from the same subquery — and could not see this,
   * because both sides were rendering the same *case-sensitive* SQL. This
   * test crosses the boundary the others do not: it asserts the SQL folds
   * case, which is what makes the TS twin's answer the same answer.
   */
  it("agrees with the SQL on case — the twin and the query fold identically", () => {
    const rendered = render(callerClassSql("t")).sql;
    // Every email comparison in the emitted SQL folds the column's case.
    const comparisons = rendered.match(/[A-Za-z_.()]*email[)]?\s*(?:LIKE|=)/gi) ?? [];
    expect(comparisons.length).toBeGreaterThan(0);
    for (const c of comparisons) expect(c.toLowerCase()).toContain("lower(email)");
    // And the TS twin agrees on the mixed-case form for every rule we have.
    for (const suffix of INTERNAL_EMAIL_SUFFIXES) {
      expect(callerClass(`Someone${suffix.toUpperCase()}`, true)).toBe("harness");
    }
    for (const email of EXTRA_EXCLUDED_EMAILS) {
      expect(callerClass(email.toUpperCase(), true)).toBe("harness");
    }
  });

  it("names all four classes and nothing else", () => {
    expect([...CALLER_CLASSES].sort()).toEqual(["account", "anonymous", "harness", "x402"]);
  });

  it("the external classes are exactly the classes that are not us", () => {
    expect([...EXTERNAL_CALLER_CLASSES].sort()).toEqual(["account", "anonymous", "x402"]);
    expect(EXTERNAL_CALLER_CLASSES).not.toContain("harness");
    // Every class is either ours or theirs; nothing is unclassified.
    expect([...EXTERNAL_CALLER_CLASSES, "harness"].sort()).toEqual([...CALLER_CLASSES].sort());
  });
});

/**
 * Our own database-liveness rows, which were being printed as failing customers.
 *
 * Found by independent review of PR #507 on 2026-09-05, and measured against
 * production: `who-called --failing --days 20` reported "78 customer call(s),
 * of which 78 failed" for solution-less rows. 77 of the 78 were
 * `status = 'health_probe'` — the platform pinging its own database, written
 * with no user, no price and no payer. They classified as `anonymous` because
 * that branch only asked whether `user_id` was null, which for a probe it is.
 *
 * 507 such rows are permanently in `transactions` (2026-04-16 → 2026-08-21).
 * They cannot be deleted — they are in the audit chain — so any window reaching
 * back before 2026-08-21 contains them, and the tool exists to answer exactly
 * those long-window questions.
 *
 * Each assertion below fails against the un-fixed code: with the probe branch
 * removed, the SQL loses its first WHEN, `callerClass` returns "anonymous", and
 * `externalCustomers` stops naming the status at all. Verified by removing it.
 */
describe("our own health probes are ours, not anonymous customers", () => {
  it("the partition classifies a health_probe row as harness, before it looks at the user", () => {
    const partition = render(callerClassSql("t")).sql;
    expect(partition).toContain("t.status = $1 THEN 'harness'");
    // Order matters and is the whole bug: a probe carries no user, so an
    // earlier `user_id IS NULL` branch would claim it first.
    expect(partition.indexOf("THEN 'harness'")).toBeLessThan(partition.indexOf("t.user_id IS NULL"));
    expect(render(callerClassSql("t")).params[0]).toBe(HEALTH_PROBE_STATUS);
  });

  it("the TypeScript twin agrees, including for a probe with no user", () => {
    expect(callerClass(null, false, { status: HEALTH_PROBE_STATUS })).toBe("harness");
    // and the status wins over a payer hash, which no real probe carries but
    // which must not be able to promote one into the paying population.
    expect(callerClass(null, false, { status: HEALTH_PROBE_STATUS, hasX402Payer: true })).toBe("harness");
  });

  it("the filter excludes them too — revenue never saw this, row counts did", () => {
    const filter = render(externalCustomers("t"));
    expect(filter.sql).toContain("t.status <> $1");
    expect(filter.params[0]).toBe(HEALTH_PROBE_STATUS);
  });
});

/**
 * `anonymous` meant "the x402 rail" and did not.
 *
 * `do.ts` serves three anonymous cases — free tier, progressive unlock, and an
 * X-Payment call — and over 30 days 59 anonymous rows had no wallet behind them
 * at all: Deno and curl user agents, and browser hits refered from the website.
 * Counting a crawler's failed free-tier calls as "customer calls" is the same
 * misreading this module exists to prevent, one level down.
 */
describe("paying anonymous callers are separated from free-tier ones", () => {
  it("the partition splits on the payer hash, and only for rows with no user", () => {
    const partition = render(callerClassSql("t")).sql;
    expect(partition).toContain("t.user_id IS NULL AND t.x402_payer_hash IS NOT NULL THEN 'x402'");
    // The unpaid branch must come after, or every anonymous row is 'anonymous'.
    expect(partition.indexOf("THEN 'x402'")).toBeLessThan(partition.indexOf("THEN 'anonymous'"));
  });

  it("the TypeScript twin splits the same way", () => {
    expect(callerClass(null, false, { hasX402Payer: true })).toBe("x402");
    expect(callerClass(null, false, { hasX402Payer: false })).toBe("anonymous");
    expect(callerClass(null, false)).toBe("anonymous");
    // A registered user is never reclassified by a payer hash.
    expect(callerClass("provider@dlgt.io", true, { hasX402Payer: true })).toBe("account");
  });
});
