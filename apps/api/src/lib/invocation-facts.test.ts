/**
 * WP9 — the quality floor must be able to see a capability that only ever runs
 * inside bundles, and no new serving path may quietly skip recording.
 *
 * Every test here is mutation-checked: `scripts/mutation-test.mjs` reverts the
 * WP9 change and confirms the named test goes RED. A test that passes against
 * the pre-fix code is not evidence of anything, and this repo has shipped
 * several of those.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { foldTrafficRows, type FloorTrafficRow } from "../jobs/quality-floor.js";
import { evaluateFloor, DEFAULT_FLOOR_CONFIG } from "./quality-floor.js";
import { outcomeFromError } from "./execution-outcome.js";
import { CapabilityRefusalError } from "./capability-refusal.js";
import { TOS_REFUSAL_MARKER } from "./tos-blocklist.js";
import { classifyTransactionFailure } from "./transaction-failure-taxonomy.js";
import {
  INVOCATION_RAILS,
  INVOCATION_FACT_DELETE_GUARD_DAYS,
} from "./invocation-facts.js";
import { INVOCATION_FACT_RETENTION_DAYS } from "./data-retention.js";

const SRC = join(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function factRow(partial: Partial<FloorTrafficRow>): FloorTrafficRow {
  return {
    slug: "bundle-only-capability",
    lifecycle_state: "active",
    visible: true,
    x402_enabled: true,
    source: "fact",
    status: null,
    error: null,
    success: true,
    counts: null,
    day: "2026-08-01",
    recent: false,
    n: 1,
    ...partial,
  };
}

describe("the floor can see a capability that only runs inside solutions", () => {
  /**
   * The whole reason WP9 exists. Before it, a bundle wrote ONE transaction with
   * `capability_id = NULL` and buried its step outcomes in an `output.steps`
   * JSONB blob, so the floor's `JOIN transactions ON capability_id` matched
   * nothing for a capability invoked only as a step. It could fail every call
   * it served and never reach the minimum-call threshold, because as far as the
   * query was concerned it had no traffic at all.
   */
  it("quarantines a capability whose only traffic is solution steps", () => {
    // Twelve step invocations, three of which produced usable output. No
    // transaction row anywhere carries this capability's id.
    const rows: FloorTrafficRow[] = [
      factRow({ success: true, n: 3, day: "2026-08-01" }),
      factRow({ success: false, counts: true, n: 5, day: "2026-08-02" }),
      factRow({ success: false, counts: true, n: 4, day: "2026-08-03" }),
    ];

    const stats = foldTrafficRows(rows, new Map());
    expect(stats).toHaveLength(1);
    expect(stats[0].eligibleCalls).toBe(12);
    expect(stats[0].completedCalls).toBe(3);

    const decisions = evaluateFloor(stats, DEFAULT_FLOOR_CONFIG);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe("quarantine");
    // 25% is below the 30% deactivation floor too, so it should also surface a
    // proposal — a capability this broken is not merely a delisting.
    expect(decisions[0].deactivateProposal).toBe(true);
  });

  it("does not count a step failure the caller caused", () => {
    // `counts_against_capability: false` is the WP4 verdict for a caller-
    // attributable failure. A correct refusal of bad input must not push a
    // capability toward delisting — the platform has delisted capabilities for
    // refusing bad input before, and that is what this asserts against.
    const stats = foldTrafficRows(
      [
        factRow({ success: true, n: 4 }),
        factRow({ success: false, counts: false, n: 40, day: "2026-08-02" }),
      ],
      new Map(),
    );
    expect(stats[0].eligibleCalls).toBe(4);
    expect(stats[0].completedCalls).toBe(4);
    expect(evaluateFloor(stats, DEFAULT_FLOOR_CONFIG)).toEqual([]);
  });

  it("reads the verdict off the fact instead of re-deriving it from a string", () => {
    // The fold trusts `counts` and does not re-run the string taxonomy on fact
    // rows — one authority per business fact.
    //
    // An earlier version of this test used "Missing required input fields" as
    // the error and asserted the failure COUNTED, on the reasoning that the fact
    // wins over the string. The reasoning was right and the example was wrong:
    // it pinned an authority that could not yet answer the question. The fix is
    // upstream, in outcomeFromError, which now consults the taxonomy so the fact
    // carries the correct verdict in the first place — see the regression test
    // below. Here the error text is deliberately incidental.
    const stats = foldTrafficRows(
      [
        factRow({ success: true, n: 1 }),
        factRow({
          success: false,
          counts: true,
          error: "some upstream returned a 500",
          n: 9,
          day: "2026-08-02",
        }),
      ],
      new Map(),
    );
    expect(stats[0].eligibleCalls).toBe(10);
    expect(stats[0].completedCalls).toBe(1);
  });

  it("a refusal and a caller's bad input never count against the capability", () => {
    // The defect this test exists for, found by review round 3 and measured
    // against production: WP9 made outcomeFromError the sole authority on
    // whether a failure counts, and it only excused the three cost-gate errors.
    // Every string in the curated caller-input and ToS sets — built
    // incident-by-incident over months — would have become a counted failure
    // the moment the epoch passed. Three live capabilities crossed the floor in
    // the model: product-reviews-extract to 9.3%, us-company-data to 33%, and
    // url-to-markdown to 53% — the last being the free-tier front door whose
    // quarantine was reversed that very morning by adding those exact strings.
    //
    // These are the real production error strings, not invented ones.
    for (const message of [
      "URL returned HTTP 403. The site blocks automated access.",
      "URL returned HTTP 404. This page does not exist.",
      "'cik' or 'company_name' is required",
      "No US company found matching that name",
      "Missing required input fields: iban",
      "This page returned almost no readable text",
    ]) {
      const outcome = outcomeFromError(new Error(message));
      expect(outcome.counts_against_capability, message).toBe(false);
      expect(outcome.fault, message).toBe("caller");
    }

    // A ToS refusal is an answer the platform is required to give under
    // DEC-20260428-A. Scoring it as a defect would delist capabilities for
    // obeying policy.
    const refusal = outcomeFromError(
      new CapabilityRefusalError(
        `Trustpilot is not a supported source: its ${TOS_REFUSAL_MARKER}.`,
      ),
    );
    expect(refusal.counts_against_capability).toBe(false);
    expect(refusal.failure_class).toBe("capability_refused");

    // The STRUCTURAL check, not the string one. The assertion above passed even
    // with the isCapabilityRefusal branch deleted, because that message also
    // carries the ToS marker the taxonomy matches on -- so it proved nothing
    // about the branch it was meant to cover. A refusal whose wording the
    // taxonomy does not recognise is the case the class exists for: the
    // taxonomy is a curated list of strings and will always trail the refusals
    // actually thrown, which is why the error type carries a discriminator.
    const unrecognised = new CapabilityRefusalError(
      "This source is out of scope for automated retrieval.",
    );
    expect(classifyTransactionFailure(unrecognised.message)).toBe("internal");
    expect(outcomeFromError(unrecognised).counts_against_capability).toBe(false);
  });

  it("still counts what is genuinely the capability's problem", () => {
    // The excusing must not swallow real defects, or the floor stops working.
    for (const message of [
      "The Danish business registry (cvrapi.dk) returned a server error (HTTP 503).",
      "Request timed out after 35000ms",
      "TypeError: Cannot read properties of undefined",
    ]) {
      expect(outcomeFromError(new Error(message)).counts_against_capability, message).toBe(true);
    }
  });
});

describe("evidence completeness", () => {
  it("carries no price on a fact, so revenue comes from the billing table", () => {
    // Facts answer 'did this work'. Asking them what a call earned would be the
    // same category error WP9 exists to undo, so `revenueCents` must come from
    // the map the job builds from `transactions` — and must be zero when the
    // capability is absent from it rather than guessed.
    const withRevenue = foldTrafficRows(
      [factRow({ success: true, n: 2 })],
      new Map([["bundle-only-capability", 250]]),
    );
    expect(withRevenue[0].revenueCents).toBe(250);

    const withoutRevenue = foldTrafficRows([factRow({ success: true, n: 2 })], new Map());
    expect(withoutRevenue[0].revenueCents).toBe(0);
  });
});

describe("no serving path may skip the fact", () => {
  /**
   * Exit condition: a guard prevents a new invocation path skipping the fact.
   *
   * `kind: "customer_paid"` is the marker of a customer-serving invocation —
   * it is what the dispatcher gate is told, and it is what makes the call count
   * as customer experience. Any file that claims it must also record what
   * happened.
   *
   * Requires a CALL, not an import. WP8 shipped a guard whose assertions were
   * satisfied by the import line alone: delete the logic, keep the import, and
   * it stayed green.
   */
  it("every file that serves a customer_paid invocation also records it", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const body = readFileSync(file, "utf8");
      if (!body.includes(`kind: "customer_paid"`)) continue;
      if (!body.includes("recordInvocation(")) {
        offenders.push(file.slice(SRC.length + 1).replace(/\\/g, "/"));
      }
    }
    expect(
      offenders,
      "These files invoke a capability as a paying customer but record no " +
        "invocation fact, so the quality floor cannot see their traffic. " +
        "Call recordInvocation() from lib/invocation-facts.ts on BOTH the " +
        "success and the failure path.",
    ).toEqual([]);
  });

  it("the known invocation paths are actually covered, not merely unviolated", () => {
    // The guard above passes vacuously if no file matches. Pin the ones that
    // must match, so deleting a rail's marker cannot turn the guard green.
    //
    // `guarded-executor.ts` is on this list because it RUNS an executor. It had
    // no live callers when WP9 shipped — every rail uses `assertGuardedAllow`
    // and drives the executor itself — but the guard flagged it anyway, and an
    // executor-invoking helper that records nothing is a ready-made way for the
    // next rail to be invisible to the floor. It was fixed rather than
    // allowlisted; an allowlist is how a guard becomes decoration.
    const covered = walk(SRC)
      .filter((f) => {
        const body = readFileSync(f, "utf8");
        return body.includes(`kind: "customer_paid"`) && body.includes("recordInvocation(");
      })
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"))
      .sort();

    expect(covered).toEqual([
      "capabilities/guarded-executor.ts",
      "lib/solution-executor.ts",
      "routes/do.ts",
      "routes/x402-gateway-v2.ts",
    ]);
  });

  it("every covered path records the FAILURE case too, not just the success", () => {
    // The guard above is satisfied by a single call, which is exactly how a
    // half-wired rail would look: record the successes, drop the failures, and
    // hand the quality floor a completion rate that can only ever be 100%.
    // That is worse than no signal, because it reads as health.
    //
    // An invocation either returns output or throws, so each of these files
    // needs at least two record sites. Removing one of a pair must be caught —
    // the first version of this test checked only that SOME call existed, and a
    // mutation deleting one of two survived it.
    const shortfall: string[] = [];
    for (const rel of [
      "capabilities/guarded-executor.ts",
      "lib/solution-executor.ts",
      "routes/do.ts",
      "routes/x402-gateway-v2.ts",
    ]) {
      const body = readFileSync(join(SRC, rel), "utf8");
      const calls = (body.match(/recordInvocation\(\{/g) ?? []).length;
      const fromError = (body.match(/outcomeFromError\(/g) ?? []).length;
      if (calls < 2 || fromError < 1) {
        shortfall.push(`${rel}: ${calls} record site(s), ${fromError} error-outcome derivation(s)`);
      }
    }
    expect(
      shortfall,
      "Each of these files runs a capability and must record BOTH outcomes. " +
        "A path that records only successes gives the floor a completion rate " +
        "of 100% no matter how broken the capability is.",
    ).toEqual([]);
  });

  it("a fact the floor cannot read is worse than no fact — the visibility fields are pinned", () => {
    // The whole outcome machinery is mutation-checked. The fields that decide
    // whether the row is READ AT ALL were not, and a one-token change silently
    // nullified the package with a green suite: setting the solution step's
    // `isFreeTier` to a literal `true` makes every bundle fact fail the floor's
    // `AND f.is_free_tier = false` filter, so bundle-only capabilities go back
    // to being invisible — the single defect WP9 exists to close.
    //
    // The headline test misses it because it hand-builds FloorTrafficRows and
    // feeds the fold; it never exercises the writer. These assert the writer.
    const solutions = readFileSync(join(SRC, "lib/solution-executor.ts"), "utf8");
    expect((solutions.match(/isFreeTier: actor\.isFreeTier/g) ?? []).length).toBe(2);
    expect((solutions.match(/userId: actor\.userId/g) ?? []).length).toBe(2);
    expect((solutions.match(/contextKind: "customer_paid"/g) ?? []).length).toBe(2);
    expect(solutions).not.toContain("isFreeTier: true");

    // Same for the two direct rails. `/v1/do` threads a required actor through
    // four execution paths; x402 has no account by design and is never
    // free-tier, so its literals are the correct values and are pinned as such.
    const doRoute = readFileSync(join(SRC, "routes/do.ts"), "utf8");
    expect((doRoute.match(/isFreeTier: actor\.isFreeTier/g) ?? []).length).toBe(2);
    expect((doRoute.match(/userId: actor\.userId/g) ?? []).length).toBe(2);

    const x402 = readFileSync(join(SRC, "routes/x402-gateway-v2.ts"), "utf8");
    expect((x402.match(/contextKind: "customer_paid"/g) ?? []).length).toBe(2);
    expect(x402).not.toContain("isFreeTier: true");
  });

  it("the solution executor assesses the enriched output, not the raw result", () => {
    // The customer receives the enriched output and the solution's aggregate
    // billing verdict is computed from it. Assessing the raw executor result
    // here would let a step's quality record and its billing verdict disagree
    // about the same call — two answers to one question, again.
    const body = readFileSync(join(SRC, "lib/solution-executor.ts"), "utf8");
    expect(body).toContain("outcome: outcomeFromOutput(step.capabilitySlug, output)");
  });
});

describe("retention and the database guard must not contradict each other", () => {
  it("prunes facts well outside the window the database refuses to delete in", () => {
    // Block 0101 refuses to DELETE a fact inside the floor's reading window, so
    // a retention window shorter than that guard would make the nightly purge
    // throw on every run -- inside a bulk job, which is exactly where this
    // platform has previously let failures go unnoticed for days at a time.
    expect(INVOCATION_FACT_RETENTION_DAYS).toBeGreaterThan(
      INVOCATION_FACT_DELETE_GUARD_DAYS,
    );
    // And comfortably outside, not by a day. The floor reads 30 days; six times
    // that answers a question about recent history without keeping a fact
    // forever.
    expect(INVOCATION_FACT_RETENTION_DAYS).toBeGreaterThanOrEqual(90);
  });

  it("the guard constant still matches the interval the migration installs", () => {
    // Two places state the same number -- the trigger SQL and the TypeScript
    // constant the retention rule is checked against. They are checked against
    // each other here, because the failure mode of them drifting is a purge
    // that throws nightly and a test that keeps passing.
    const migration = readFileSync(join(SRC, "lib/startup-migrations.ts"), "utf8");
    expect(migration).toContain(
      `INTERVAL '${INVOCATION_FACT_DELETE_GUARD_DAYS} days'`,
    );
  });

  it("the purge is LIMIT-paginated rather than one unbounded DELETE", () => {
    // DEC-20260504-B. The table is created empty so there is no backlog to
    // drain on first run, but it accrues roughly 6k rows a day once the writer
    // is live, and an unbounded DELETE on that is a future incident.
    const body = readFileSync(join(SRC, "lib/data-retention.ts"), "utf8");
    // Substring-scoped rather than regex-extracted: the LIMIT has to be in the
    // same statement as the DELETE, not merely somewhere else in a file that
    // has five other batched purges in it.
    const at = body.indexOf("DELETE FROM capability_invocations");
    expect(at, "the invocation-fact purge must exist").toBeGreaterThan(-1);
    // Sliced FROM the DELETE, so asserting the DELETE is in the slice can never
    // fail — that assertion was tautological and is gone. What is checked below
    // is what surrounds it.
    const source = body.slice(at, at + 400);
    expect(source).toContain("LIMIT ${BATCH_SIZE}");
    // The direction of the cutoff. Inverted, the purge deletes the NEWEST facts
    // -- which are exactly the ones inside the 35-day window the trigger
    // refuses -- so the last step of the retention sweep would raise every
    // night and take `retention-cleanup-done` down with it for every rule that
    // had already succeeded. Nothing in this repo asserted cutoff direction on
    // any purge before this line.
    expect(source).toContain("WHERE created_at < ${cutoff.toISOString()}");
    // And it must not name the table before checking the table is there. Block
    // 0101 is defer-not-throw, so it genuinely may be absent -- and this purge
    // is the LAST step of the retention sweep, so throwing here loses the
    // retention-cleanup-done summary for every rule that already succeeded.
    const purge = body.slice(
      body.indexOf("async function purgeCapabilityInvocations"),
      at,
    );
    expect(purge).toContain("to_regclass('public.capability_invocations')");
    // The SENSE. `"?.ready) return 0;"` matches the inverted form too, and that
    // mutation survived: inverted, the purge never deletes anything (unbounded
    // growth at ~6k rows/day) AND runs the DELETE precisely when the table is
    // absent -- both of the failures this guard exists to prevent.
    expect(purge).toContain("if (!(presentRows[0]");
    expect(purge).toContain("?.ready) return 0;");
  });
});

describe("one invocation, one fact", () => {
  it("the x402 rail cannot record a call twice", () => {
    // `assertBillableOutput` throws AFTER the success fact is written, and the
    // catch block records again. Without the guard flag that is two facts for
    // one invocation, one of them saying a non-billable call succeeded -- which
    // is worse than missing it, because it inflates the completion rate the
    // floor decides on. The rail guard only counts record sites (>=2), so the
    // flag can stop working invisibly; this pins it.
    const body = readFileSync(join(SRC, "routes/x402-gateway-v2.ts"), "utf8");
    expect(body).toContain("let factRecorded = false;");
    expect(body).toContain("factRecorded = true;");
    expect(body).toContain("if (!factRecorded) {");
  });
});

describe("rail vocabulary", () => {
  it("names entry points, not payment rails", () => {
    // `/v1/do` serves both wallet-funded and X-Payment callers, so a
    // payment-rail label would be wrong for a large share of its traffic.
    // Payment rail is already on the transaction, where a billing question
    // belongs.
    expect([...INVOCATION_RAILS]).toEqual([
      "v1_do",
      "x402_gateway",
      "solution_step",
      "harness",
      "onboarding",
    ]);
  });
});
