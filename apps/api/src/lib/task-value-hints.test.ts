import { describe, it, expect } from "vitest";
import { recoverValuesFromTask, recoveredValuesHint } from "./task-value-hints.js";

describe("recoverValuesFromTask", () => {
  it("recovers the 2026-08-08 incident IBAN from the task text", () => {
    // Verbatim task from failed_requests row 1c331888 — the caller retried
    // three times without ever structuring inputs.iban.
    const r = recoverValuesFromTask(
      "validate this IBAN DE89370400440532013000",
      ["iban"],
    );
    expect(r).toEqual({ iban: "DE89370400440532013000" });
  });

  it("normalizes grouped/lowercase IBANs", () => {
    const r = recoverValuesFromTask(
      "check de89 3704 0044 0532 0130 00 please",
      ["iban"],
    );
    expect(r).toEqual({ iban: "DE89370400440532013000" });
  });

  it("refuses ambiguous candidates rather than guessing", () => {
    const r = recoverValuesFromTask(
      "compare DE89370400440532013000 and SE4550000000058398257466",
      ["iban"],
    );
    expect(r).toEqual({});
  });

  it("recovers a url and strips trailing sentence punctuation", () => {
    const r = recoverValuesFromTask(
      "what tech stack does https://stripe.com use?",
      ["url", "domain"],
    );
    expect(r.url).toBe("https://stripe.com");
    // The URL is stripped before domain matching, so no standalone domain remains.
    expect(r.domain).toBeUndefined();
  });

  it("recovers a bare domain but never from inside an email address", () => {
    expect(recoverValuesFromTask("detect stack for stripe.com", ["domain"]))
      .toEqual({ domain: "stripe.com" });
    expect(recoverValuesFromTask("validate bob@example.org", ["domain"]))
      .toEqual({});
  });

  it("recovers an email", () => {
    expect(recoverValuesFromTask("is bob.smith+x@example.org deliverable?", ["email"]))
      .toEqual({ email: "bob.smith+x@example.org" });
  });

  it("returns nothing for fields without a recognizer", () => {
    expect(recoverValuesFromTask("look up org 5593957979", ["org_number"]))
      .toEqual({});
  });

  it("handles null/empty task", () => {
    expect(recoverValuesFromTask(null, ["iban"])).toEqual({});
    expect(recoverValuesFromTask("", ["iban"])).toEqual({});
  });
});

describe("recoveredValuesHint", () => {
  it("renders a retry-ready inputs object", () => {
    const hint = recoveredValuesHint({ iban: "DE89370400440532013000" });
    expect(hint).toContain('"inputs": { "iban": "DE89370400440532013000" }');
  });

  it("is undefined when nothing was recovered", () => {
    expect(recoveredValuesHint({})).toBeUndefined();
  });
});
