/**
 * The platform's own refusals must never open a circuit breaker.
 *
 * There are three of them, all from `guarded-executor.ts`: the dispatcher gate
 * declining to spend vendor credits from a non-customer context, an
 * unclassified capability failing closed, and an exhausted test budget. Each
 * means the gate worked. None is evidence the capability or its upstream is
 * unhealthy.
 *
 * This was inert rather than guarded until now. `recordFailure` skipped
 * user-input errors but had no notion of a platform-initiated refusal, and the
 * only reason that never bit is that nothing routed such a refusal to it —
 * `test-runner.ts` never called `recordFailure` at all, which is precisely
 * what `cost-control-refusal-accounting.test.ts` pins.
 *
 * PR #60 proposed changing that, wiring failing known_answer/dependency_health
 * suites into the breaker. An ALLOW_MATRIX refusal classifies as verdict
 * `unknown`, so it would have arrived here unguarded and opened the breaker on
 * paid capabilities — 91 such refusals across 8 capabilities in 30 days of
 * production. That wiring was dropped (see the note in `test-runner.ts`), but
 * the guard is worth having on its own: it closes the category for every route
 * to the breaker, present and future, rather than for one caller.
 *
 * Same reasoning as PR #231, one category over. #231 covered refusals the
 * caller provoked; this covers refusals the platform chose.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPlatformRefusal, isUserInputError, recordFailure } from "./circuit-breaker.js";
import { classifyFailure } from "./failure-classifier.js";

/** Every DB interaction recordFailure attempts. Empty => it returned early. */
const dbCalls: string[] = [];

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      dbCalls.push("transaction");
      // Without the guard, recordFailure opens a transaction and reads
      // capability_health — that read is the observable asserted against.
      return fn({
        select: () => ({
          from: () => ({ where: () => ({ limit: () => ({ for: async () => [] }) }) }),
        }),
        insert: () => ({ values: async () => undefined }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      });
    },
    execute: async () => {
      dbCalls.push("execute");
      return [];
    },
  }),
}));

beforeEach(() => {
  dbCalls.length = 0;
});

/** Verbatim shapes from `guarded-executor.ts`'s three refusal classes. */
const ALLOW_MATRIX_REFUSAL =
  "Capability 'french-company-data' (cost_class=paid_prepaid) refuses invocation from " +
  "context kind 'internal_test'. ALLOW_MATRIX governs this; bypass would burn vendor " +
  "credits outside customer-initiated paths.";
const UNCLASSIFIED_REFUSAL =
  "Capability 'new-thing' has no cost_class. Non-customer invocations are refused " +
  "during the Phase A0b GRACE window. Classify by adding cost_class to " +
  "manifests/new-thing.yaml (see CLAUDE.md cost-class taxonomy).";
const BUDGET_REFUSAL =
  "Capability 'greek-company-data' has exhausted its daily test budget (40 of 40 calls).";

const REFUSALS = [ALLOW_MATRIX_REFUSAL, UNCLASSIFIED_REFUSAL, BUDGET_REFUSAL];

describe("the platform's own refusals never open the breaker", () => {
  it("recognises all three guarded-executor refusal classes", () => {
    for (const reason of REFUSALS) {
      expect(isPlatformRefusal(reason), reason.slice(0, 48)).toBe(true);
    }
  });

  it("recordFailure returns without touching capability_health", async () => {
    // The behavioural assertion, and the only one here that fails if the guard
    // is removed from recordFailure — the predicate checks above would keep
    // passing. It watches whether the breaker's write path was entered at all.
    for (const reason of REFUSALS) {
      dbCalls.length = 0;
      await recordFailure("french-company-data", reason);
      expect(dbCalls, `${reason.slice(0, 44)} must not reach the breaker`).toEqual([]);
    }
  });

  it("a genuine upstream fault DOES reach the breaker", async () => {
    // The other direction on the same observable, so the assertion above
    // cannot pass merely because the mock never records anything.
    await recordFailure("french-company-data", "cvrapi.dk returned HTTP 503");
    expect(dbCalls.length, "genuine faults must still open a transaction").toBeGreaterThan(0);
  });

  it("keeps platform refusals out of the caller-attributable bucket", () => {
    // Deliberately NOT folded into USER_INPUT_ERROR_PATTERNS: nobody asked for
    // this refusal, so filing it as caller input would misreport whose fault it
    // was everywhere else that list is read.
    for (const reason of REFUSALS) {
      expect(isUserInputError(reason), reason.slice(0, 44)).toBe(false);
    }
  });

  it("does not swallow real faults", () => {
    for (const fault of [
      "cvrapi.dk returned HTTP 503",
      "fetch failed: ETIMEDOUT",
      "Unexpected token < in JSON at position 0",
      "Browserless returned a 500",
    ]) {
      expect(isPlatformRefusal(fault), `${fault} must still trip`).toBe(false);
    }
  });
});

describe("why the guard is needed even without PR #60's wiring", () => {
  it("an ALLOW_MATRIX refusal classifies as a verdict that routes to the breaker", () => {
    // This is the latent hazard. Any future code that feeds test verdicts into
    // recordFailure — which #60 attempted — inherits it, because `unknown` is
    // indistinguishable from a real fault at the verdict layer. The guard has
    // to live at recordFailure, not at the caller.
    for (const testType of ["known_answer", "dependency_health"]) {
      const { verdict } = classifyFailure(ALLOW_MATRIX_REFUSAL, false, false, testType, {}, true);
      expect(verdict, `${testType}: refusal is indistinguishable by verdict alone`).toBe("unknown");
    }
  });
});
