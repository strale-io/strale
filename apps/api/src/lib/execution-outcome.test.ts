/**
 * WP4 acceptance tests for the canonical outcome.
 *
 * The first describe block is the package's whole reason for existing: it
 * asserts the two rails agree. It is written against the shared function rather
 * than against either route so that it keeps meaning after the routes are
 * rewired — if someone reintroduces a rail-local billing predicate, the guard
 * test below catches that, and this one keeps proving what the shared answer
 * should be.
 */

import { describe, expect, it } from "vitest";

import {
  aggregateSolutionOutcome,
  assessOutput,
  outcomeFromError,
  outcomeFromGate,
  outcomeFromOutput,
  transactionStatusFor,
} from "./execution-outcome.js";
import {
  BudgetExhaustedError,
  CapabilityInvocationRefusedError,
  CapabilityNotClassifiedError,
} from "../capabilities/guarded-executor.js";

const okStep = outcomeFromOutput("x", { answer: 1 });
const failStep = outcomeFromOutput("x", { error: "upstream 503" });

describe("the two rails bill a gated solution identically", () => {
  // Before WP4: routes/solution-execute.ts refunded in full
  // (`refundRequired = allFailed || gated !== undefined`) while
  // routes/x402-gateway-v2.ts settled in full (`anyStepSucceeded`, and the gate
  // step IS a successful output). Same run, opposite billing.
  const gate = { capabilitySlug: "site-availability", field: "reachable" };

  it("is not billable even when steps behind the gate succeeded", () => {
    const outcome = aggregateSolutionOutcome([okStep, okStep, okStep], gate);

    expect(outcome.billable).toBe(false);
    expect(outcome.failure_class).toBe("gate_tripped");
    expect(outcome.steps_succeeded).toBe(3);
  });

  it("gives one answer, so no rail can reach a different one", () => {
    // The property that actually matters: billability is a function of the
    // execution, not of the caller's payment method. Any rail passing the same
    // steps gets the same boolean.
    const walletView = aggregateSolutionOutcome([okStep, okStep], gate);
    const x402View = aggregateSolutionOutcome([okStep, okStep], gate);

    expect(x402View.billable).toBe(walletView.billable);
    expect(x402View.failure_class).toBe(walletView.failure_class);
  });

  it("still bills a partially-successful run with no gate", () => {
    // The correction must not swing the other way: a bundle that answered is
    // charged, with the shortfall disclosed rather than priced per step.
    const outcome = aggregateSolutionOutcome([okStep, failStep]);
    expect(outcome.billable).toBe(true);
    expect(outcome.steps_succeeded).toBe(1);
  });

  it("bills nothing when no step produced usable output", () => {
    const outcome = aggregateSolutionOutcome([failStep, failStep]);
    expect(outcome.billable).toBe(false);
    expect(transactionStatusFor(outcome)).toBe("failed");
  });
});

describe("an {error, status} shaped output is not billable", () => {
  // The second defect: isSuccessfulStepOutput matched EXACTLY {error: string},
  // so an executor resolving with an error plus transport metadata converted a
  // failure into a billable success on the strength of a second key.
  it("treats error + status as the failure it is", () => {
    const outcome = outcomeFromOutput("x", { error: "not found", status: 404 });
    expect(outcome.billable).toBe(false);
    expect(outcome.output_assessment?.semantically_usable).toBe(false);
  });

  it.each(["statusCode", "code", "http_status"])(
    "also covers error + numeric %s",
    (key) => {
      const outcome = outcomeFromOutput("x", { error: "boom", [key]: 500 });
      expect(outcome.billable).toBe(false);
    },
  );

  it.each(["statusCode", "code", "http_status"])(
    "but a non-numeric %s is a verdict, and stays billable",
    (key) => {
      const outcome = outcomeFromOutput("x", { error: "boom", [key]: "degraded" });
      expect(outcome.billable).toBe(true);
    },
  );

  it("does NOT unbill an uptime check reporting a site down", () => {
    // {status:"down", error:"timeout"} is the deliverable. Keying the widening
    // on the KEY NAME rather than a numeric value would have turned this
    // correct answer into an unbilled failure — caught because the pre-existing
    // solution-executor suite already pinned it.
    const outcome = outcomeFromOutput("uptime-check", {
      status: "down",
      error: "timeout",
    });
    expect(outcome.billable).toBe(true);
  });

  it("does NOT swallow a soft verdict that carries an error string", () => {
    // The line that keeps the correction honest. {valid:false, error:"..."} is
    // the purchased answer — a true negative from a check that ran. Billing it
    // as a failure would refund correct work and, through the shared quality
    // signal, eventually delist a capability for being right.
    const outcome = outcomeFromOutput("x", {
      valid: false,
      error: "Invalid IBAN checksum",
    });
    expect(outcome.billable).toBe(true);
    expect(outcome.success).toBe(true);
  });

  it("treats skipped and unavailable as unbillable, and skipped as unretryable", () => {
    const skipped = outcomeFromOutput("x", { skipped: true, reason: "no input" });
    expect(skipped.billable).toBe(false);
    // Its inputs were starved by an earlier failure; retrying it alone is noise.
    expect(skipped.retryable).toBe(false);
    expect(skipped.counts_against_capability).toBe(false);

    const unavailable = outcomeFromOutput("x", { unavailable: true });
    expect(unavailable.billable).toBe(false);
    expect(unavailable.fault).toBe("strale");
  });

  it.each([null, undefined, "a string", 42, []])(
    "refuses to bill a structurally invalid output (%s)",
    (value) => {
      const outcome = outcomeFromOutput("x", value);
      expect(outcome.billable).toBe(false);
      expect(outcome.output_assessment?.structurally_valid).toBe(false);
    },
  );
});

describe("contract validation informs quality without blocking the charge", () => {
  // The third defect was that capability-output-contracts.ts was imported only
  // by startup-migrations.ts, so output validation never reached a billing
  // decision at all. It reaches one now — as a recorded observation.
  // company-id-detect guarantees BOTH `input` and `detected`. Chosen over
  // iso-country-lookup, whose only guaranteed field is `query` because its
  // response shape is bimodal — a reminder that most fields in this table are
  // deliberately `common`, so `contract_valid: false` is rare by design.
  it("reports a contract violation on a slug that declares one", () => {
    const assessment = assessOutput("company-id-detect", { input: "5593957979" });
    expect(assessment.contract_valid).toBe(false);
    expect(assessment.quality_flags.join()).toMatch(/contract_missing:detected/);
  });

  it("passes a contract-satisfying output", () => {
    const assessment = assessOutput("company-id-detect", {
      input: "5593957979",
      detected: { country: "SE" },
    });
    expect(assessment.contract_valid).toBe(true);
  });

  it("does not treat a `common` field's absence as a violation", () => {
    // iso-country-lookup returns EITHER `match` or `matches`; demanding both
    // would recreate the harness false-alarm this table was written to fix.
    expect(assessOutput("iso-country-lookup", { query: "Sweden" }).contract_valid).toBe(true);
  });

  it("reports null — never false — when no contract is declared", () => {
    // Absence of a contract is not a violation. Most slugs have none, so a
    // false here would make the majority of the catalog look non-compliant.
    expect(assessOutput("slug-with-no-contract", { a: 1 }).contract_valid).toBe(null);
  });

  it("does not block billing on a contract violation", () => {
    // Deliberate: the table exists to correct declarations that drifted away
    // from working executors. Refusing the charge would hand money back on the
    // strength of a declaration we already know to be the unreliable side.
    const outcome = outcomeFromOutput("company-id-detect", { input: "5593957979" });
    expect(outcome.billable).toBe(true);
    expect(outcome.output_assessment?.contract_valid).toBe(false);
  });
});

describe("a refusal is not a capability fault", () => {
  it.each([
    // Constructed with the REAL signatures. Review finding: the first version
    // passed the wrong arity to all three, and tsconfig excludes *.test.ts so
    // `tsc --noEmit` never caught it. The assertions held via `instanceof`, so
    // it was not a false green — but it did not exercise the shapes production
    // throws, which is the only reason to build them at all.
    [
      "refused",
      new CapabilityInvocationRefusedError("x", "paid_external", "scheduled_test"),
      "capability_refused",
      "caller",
    ],
    [
      "budget",
      new BudgetExhaustedError(
        "x",
        { slug: "x", cost_class: "paid_external", quota_window: "daily", quota_cap: 10 } as never,
        { kind: "scheduled_test" } as never,
      ),
      "budget_exhausted",
      "strale",
    ],
    [
      "unclassified",
      new CapabilityNotClassifiedError("x", { kind: "scheduled_test" } as never),
      "not_classified",
      "strale",
    ],
  ])("%s: unbillable, not retryable, not counted", (_label, err, cls, fault) => {
    const outcome = outcomeFromError(err);
    expect(outcome.failure_class).toBe(cls);
    expect(outcome.billable).toBe(false);
    expect(outcome.retryable).toBe(false);
    expect(outcome.fault).toBe(fault);
    // The taxonomy gap that let the armed quality floor delist capabilities
    // for correctly refusing bad input.
    expect(outcome.counts_against_capability).toBe(false);
  });
});

describe("error classification drives retry and blame", () => {
  it.each([
    "Request timed out after 15000ms",
    "The operation was aborted",
    "fetch failed: ECONNRESET",
    "connect ECONNREFUSED 10.0.0.1:443",
    "getaddrinfo ENOTFOUND registry.example",
    "socket hang up",
    "Upstream returned 503 Service Unavailable",
  ])("treats %s as retryable provider unavailability", (message) => {
    const outcome = outcomeFromError(new Error(message));
    expect(outcome.failure_class).toBe("provider_unavailable");
    expect(outcome.retryable).toBe(true);
    expect(outcome.fault).toBe("provider");
  });

  it("treats a definitive rejection as non-retryable", () => {
    const outcome = outcomeFromError(new Error("Upstream returned 400 Bad Request"));
    expect(outcome.failure_class).toBe("provider_rejected");
    expect(outcome.retryable).toBe(false);
  });

  it("never bills a thrown error, whatever its class", () => {
    for (const e of [new Error("x"), "a string", null, { weird: true }]) {
      expect(outcomeFromError(e).billable).toBe(false);
    }
  });
});

describe("gate outcome", () => {
  it("does not blame the gate capability for answering", () => {
    const outcome = outcomeFromGate({ capabilitySlug: "s", field: "f" });
    expect(outcome.billable).toBe(false);
    expect(outcome.counts_against_capability).toBe(false);
    expect(outcome.error_message).toBe("gate tripped: s.f");
  });
});

/**
 * LESSONS.md F1 step 4, at the fact writer.
 *
 * This function writes `counts_against_capability` into the durable fact
 * table, so what it decides here outlives the request. Before the change an
 * unrecognised error string fell through to the provider branch and was
 * recorded `counts_against_capability: true` — a permanent assertion that the
 * capability was at fault, made on the strength of no rule having matched.
 *
 * Both tests fail against the un-fixed module: the first reads
 * `provider_rejected` / `true`, and the second is the guard that the repair
 * did not quietly change what customers are charged.
 */
describe("an unrecognised failure is recorded as unattributed, not as a defect (F1 step 4)", () => {
  it("does not blame the capability for a string no rule claims", () => {
    const outcome = outcomeFromError(new Error("fetch failed"));
    expect(outcome.failure_class).toBe("unattributed");
    expect(outcome.counts_against_capability).toBe(false);
    // Not "provider", not "strale", not "caller". The absence is the record.
    expect(outcome.fault).toBeNull();
    // No evidence it was transient either, so retrying on this basis would be
    // a second guess resting on the same absent evidence.
    expect(outcome.retryable).toBe(false);
  });

  it("moves no money — the reclassification is not billable either way", () => {
    // F1 step 3's falsification attempt was economic: CALLER_ATTRIBUTABLE is
    // read by this module as well as by the floor, so widening what leaves the
    // denominator could in principle change a charge. It does not, and this
    // pins it: both the old destination (provider_rejected) and the new one
    // are unbillable.
    expect(outcomeFromError(new Error("fetch failed")).billable).toBe(false);
    expect(outcomeFromError(new Error("Upstream returned 400 Bad Request")).billable).toBe(false);
  });

  it("a positively identified crash still counts against the capability", () => {
    // The boundary that keeps the floor useful. A V8 error name is evidence,
    // so it keeps its verdict.
    const outcome = outcomeFromError(new Error("TypeError: Cannot read properties of undefined"));
    expect(outcome.failure_class).not.toBe("unattributed");
    expect(outcome.counts_against_capability).toBe(true);
  });
});
