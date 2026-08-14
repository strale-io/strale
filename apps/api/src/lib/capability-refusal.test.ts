/**
 * Regression tests for the 2026-08-14 "a refusal is not a fault" defect.
 *
 * Reproduced in production minutes after the refusal behaviour shipped: three
 * identical `/v1/do` calls to `french-company-data` with
 * `{"company_name":"Total"}` each returned the intended refusal, and the third
 * opened the circuit breaker against a capability with 25 prior successes
 * (`state=open, consecutive_failures=3`). Every caller then received
 * `capability_unavailable`.
 *
 * Two accounting paths were counting refusals as ill health — the breaker, and
 * the quality signal feeding the quarantine/deactivation floor. Both are
 * covered here, in both directions: refusals must be ignored, and genuine
 * upstream faults must still register.
 */

import { describe, it, expect } from "vitest";
import {
  CapabilityRefusalError,
  isCapabilityRefusal,
  isRefusalMessage,
} from "./capability-refusal.js";
import { isUserInputError } from "./circuit-breaker.js";
import { pickByName, assertSingleResultMatch } from "./company-name-match.js";

/**
 * The real messages, produced by the real primitives.
 *
 * Deliberately not a list of hand-copied strings: the failure mode this guards
 * against is someone rewording a refusal and silently re-arming the breaker,
 * and a test that restates the strings would be reworded in the same commit.
 * Same arrangement tos-blocklist.test.ts uses for the ToS marker.
 */
function realRefusals(): Array<{ label: string; err: unknown }> {
  const out: Array<{ label: string; err: unknown }> = [];
  const capture = (label: string, fn: () => unknown) => {
    try {
      fn();
      throw new Error(`expected ${label} to refuse, but it returned`);
    } catch (err) {
      out.push({ label, err });
    }
  };

  type C = { title: string; number: string };
  const byTitle = (c: C) => c.title;
  const byNumber = (c: C) => c.number;
  const opts = { subjectLabel: "French", disambiguationHint: "Provide the SIREN." };

  capture("pickByName — several equally-good matches", () =>
    pickByName(
      "Total",
      [
        { title: "TOTAL", number: "111111111" },
        { title: "Total", number: "222222222" },
      ],
      byTitle,
      byNumber,
      opts,
    ),
  );

  capture("pickByName — nothing matched", () =>
    pickByName(
      "Zzzqqx Holdings",
      [{ title: "Unrelated Trading Ltd", number: "333333333" }],
      byTitle,
      byNumber,
      opts,
    ),
  );

  capture("assertSingleResultMatch — unrelated entity returned", () =>
    assertSingleResultMatch("Bank", "Nordea Danmark", {
      jurisdictionLabel: "Danish",
      sourceDescription: "cvrapi.dk",
      disambiguationHint: "Provide the CVR number (8 digits).",
    }),
  );

  return out;
}

describe("refusals are recognised as such", () => {
  it("every real refusal site throws the typed error", () => {
    for (const { label, err } of realRefusals()) {
      expect(err, label).toBeInstanceOf(CapabilityRefusalError);
    }
  });

  it("every real refusal message is recognisable from the string alone", () => {
    // /v1/do persists only the message on the async and x402 paths, so the
    // type cannot be relied on there.
    for (const { label, err } of realRefusals()) {
      expect(isRefusalMessage((err as Error).message), label).toBe(true);
    }
  });

  it("catches wording drift at the throw sites", () => {
    // The guard the whole arrangement rests on: if someone rewords a refusal
    // out of the pattern list, this fails rather than silently re-arming the
    // breaker in production.
    for (const { label, err } of realRefusals()) {
      expect(isUserInputError((err as Error).message), `${label} must not trip the breaker`).toBe(
        true,
      );
    }
  });
});

describe("the circuit breaker ignores refusals but not faults", () => {
  it("skips the refusals that opened the breaker in production", () => {
    // Verbatim from capability_health / transactions on 2026-08-14.
    const observed = [
      'Ambiguous French company name "Total": 9 distinct registered entities are exact matches — TOTAL (542051180). Provide the SIREN for an exact lookup.',
      "Could not identify a specific Canadian company name in the request. Provide the company's registration number, or a more specific company name.",
    ];
    for (const msg of observed) {
      expect(isUserInputError(msg), msg.slice(0, 40)).toBe(true);
    }
  });

  it("still trips on genuine upstream faults", () => {
    const faults = [
      "Corporations Canada API returned HTTP 503",
      "fetch failed: ETIMEDOUT",
      "Unexpected token < in JSON at position 0",
      "Browserless returned a 500",
    ];
    for (const msg of faults) {
      expect(isUserInputError(msg), `${msg} must still trip`).toBe(false);
      expect(isCapabilityRefusal(msg), `${msg} is not a refusal`).toBe(false);
    }
  });

  it("N consecutive refusals leave the breaker untouched", () => {
    // recordFailure returns early for anything isUserInputError matches, so
    // the guarantee is exactly that predicate holding for every refusal.
    const refusal = 'Ambiguous UK company name "HSBC": 4 distinct registered entities.';
    for (let i = 0; i < 10; i++) {
      expect(isUserInputError(refusal)).toBe(true);
    }
  });
});

describe("the quality signal does not treat a refusal as a fault", () => {
  it("classifies a refusal as client_refusal, not internal_error", async () => {
    const { categorizeError } = await import("./quality-capture.js");
    for (const { label, err } of realRefusals()) {
      expect(categorizeError(err as Error), label).toBe("client_refusal");
    }
  });

  it("still classifies genuine faults into their fault buckets", async () => {
    const { categorizeError } = await import("./quality-capture.js");
    expect(categorizeError("upstream returned 503")).toBe("upstream_error");
    expect(categorizeError("request timed out")).toBe("upstream_timeout");
    expect(categorizeError("rate limit exceeded")).toBe("rate_limited");
    expect(categorizeError(null)).toBeNull();
  });

  it("does not let a company name push a refusal into a fault bucket", async () => {
    const { categorizeError } = await import("./quality-capture.js");
    // The refusal quotes the caller's query back. "Timeout Ltd" is a plausible
    // company name, and matching on substrings would file this as an upstream
    // timeout — which is why the refusal check runs first.
    const err = new CapabilityRefusalError(
      'Ambiguous UK company name "Timeout Ltd": 2 distinct registered entities.',
    );
    expect(categorizeError(err)).toBe("client_refusal");
  });
});

describe("the quality floor does not count refusals against completion", () => {
  it("classifies every real refusal as caller-attributable", async () => {
    const { classifyTransactionFailure, CALLER_ATTRIBUTABLE } = await import(
      "./transaction-failure-taxonomy.js"
    );
    for (const { label, err } of realRefusals()) {
      const cls = classifyTransactionFailure((err as Error).message);
      expect(CALLER_ATTRIBUTABLE.has(cls), `${label} classified ${cls}`).toBe(true);
    }
  });

  it("classifies the ambiguity refusal the old pattern silently missed", async () => {
    const { classifyTransactionFailure } = await import("./transaction-failure-taxonomy.js");
    // The list intended to cover this with "distinct .* entities match", but
    // the real message says "entities ARE EXACT matches" — no literal
    // "entities match" to hit — so every ambiguity refusal was landing in
    // `internal` ("our bug until proven otherwise") and counting against the
    // completion rate the floor quarantines on.
    const real =
      'Ambiguous French company name "Total": 9 distinct registered entities are exact matches — TOTAL (542051180). Provide the SIREN for an exact lookup.';
    expect(classifyTransactionFailure(real)).toBe("caller_input");
  });

  it("still counts genuine faults against the capability", async () => {
    const { classifyTransactionFailure, CALLER_ATTRIBUTABLE } = await import(
      "./transaction-failure-taxonomy.js"
    );
    const faults: Array<[string, string]> = [
      ["Corporations Canada API returned HTTP 503", "upstream"],
      ["Request timed out after 10000ms", "timeout"],
      ["Cannot read properties of undefined (reading 'x')", "internal"],
      ["Vendor quota exceeded", "upstream"],
    ];
    for (const [msg, expected] of faults) {
      const cls = classifyTransactionFailure(msg);
      expect(cls, msg).toBe(expected);
      expect(CALLER_ATTRIBUTABLE.has(cls), `${msg} must still count`).toBe(false);
    }
  });
});

describe("isCapabilityRefusal", () => {
  it("recognises the typed error", () => {
    expect(isCapabilityRefusal(new CapabilityRefusalError("Ambiguous X"))).toBe(true);
  });

  it("recognises a structurally-tagged object across a module boundary", () => {
    // The async paths can re-import modules; instanceof is not guaranteed.
    expect(isCapabilityRefusal({ isCapabilityRefusal: true, message: "x" })).toBe(true);
  });

  it("recognises a bare message", () => {
    expect(isCapabilityRefusal("No confident Danish registry match for \"Bank\".")).toBe(true);
  });

  it("does not fire on ordinary errors, null or undefined", () => {
    expect(isCapabilityRefusal(new Error("upstream exploded"))).toBe(false);
    expect(isCapabilityRefusal(null)).toBe(false);
    expect(isCapabilityRefusal(undefined)).toBe(false);
    expect(isCapabilityRefusal("")).toBe(false);
  });
});
