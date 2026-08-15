import { describe, it, expect } from "vitest";
import {
  recoverValuesFromTask,
  recoveredValuesHint,
  unsatisfiedGroupFields,
} from "./task-value-hints.js";

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

  it("never scans past the cap, so adversarial megabyte tasks stay cheap", () => {
    // Value placed beyond the 2000-char scan window is not recovered…
    const far = "x".repeat(3000) + " DE89370400440532013000";
    expect(recoverValuesFromTask(far, ["iban"])).toEqual({});
    // …and a hostile dotted string doesn't hang the recognizers.
    const hostile = ("a".repeat(60) + ".").repeat(50_000) + "!";
    const start = Date.now();
    recoverValuesFromTask(hostile, ["domain", "email", "url"]);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe("unsatisfiedGroupFields", () => {
  const schema = {
    anyOf: [{ required: ["url"] }, { required: ["domain"] }],
    properties: { url: {}, domain: {}, verbose: {} },
  };

  it("returns only fields from the group branches, not all properties", () => {
    expect(unsatisfiedGroupFields(schema, {}).sort()).toEqual(["domain", "url"]);
  });

  it("excludes fields the caller already sent", () => {
    expect(unsatisfiedGroupFields(schema, { url: "https://x.com" })).toEqual(["domain"]);
  });

  it("handles schemas without groups", () => {
    expect(unsatisfiedGroupFields({ properties: { a: {} } }, {})).toEqual([]);
    expect(unsatisfiedGroupFields(null, {})).toEqual([]);
  });
});

describe("recoveredValuesHint", () => {
  it("renders a retry-ready inputs object", () => {
    const hint = recoveredValuesHint({ iban: "DE89370400440532013000" });
    expect(hint).toContain('"inputs": {"iban":"DE89370400440532013000"}');
  });

  it("merges the caller's existing inputs so following the hint loses nothing", () => {
    const hint = recoveredValuesHint(
      { url: "https://stripe.com" },
      { verbose: true },
    );
    expect(hint).toContain('{"verbose":true,"url":"https://stripe.com"}');
  });

  it("JSON-encodes recovered values so they cannot break the example", () => {
    const hint = recoveredValuesHint({ url: 'https://x.com/a"b\\' });
    expect(hint).toContain(JSON.stringify({ url: 'https://x.com/a"b\\' }));
  });

  it("is undefined when nothing was recovered", () => {
    expect(recoveredValuesHint({})).toBeUndefined();
  });
});
