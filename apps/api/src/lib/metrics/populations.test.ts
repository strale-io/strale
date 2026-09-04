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
} from "./populations.js";
import {
  INTERNAL_EMAIL_SUFFIXES,
  EXTRA_EXCLUDED_EMAILS,
  SYSTEM_ACCOUNT_EMAIL,
} from "../internal-accounts.js";

const dialect = new PgDialect();
const render = (tag: ReturnType<typeof externalCustomers>) => dialect.sqlToQuery(tag);

describe("the partition and the filter cannot drift apart", () => {
  it("both express 'ours' with the identical subquery and the identical binds", () => {
    const subquery = render(internalUserIds());
    const filter = render(externalCustomers("t"));
    const partition = render(callerClassSql("t"));

    // Same text, embedded in both.
    expect(filter.sql).toContain(subquery.sql);
    expect(partition.sql).toContain(subquery.sql);
    // Same binds, in the same order — a matching string with different
    // parameters would classify different accounts as ours.
    expect(filter.params).toEqual(subquery.params);
    expect(partition.params).toEqual(subquery.params);
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

  it("names all three classes and nothing else", () => {
    expect([...CALLER_CLASSES].sort()).toEqual(["account", "anonymous", "harness"]);
  });
});
