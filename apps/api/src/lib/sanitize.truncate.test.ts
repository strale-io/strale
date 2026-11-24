import { describe, expect, it } from "vitest";
import { sanitizeFailureReason } from "./sanitize.js";
import { toStorableJson } from "./storable-json.js";

describe("sanitizeFailureReason shortening", () => {
  it("does not split an emoji at the 497-character cut", () => {
    // No space near the cut, so the hard cut applies, and it lands between
    // the two halves of the emoji at offsets 496 and 497.
    const msg = "x".repeat(496) + "\u{1F600}" + "y".repeat(100);
    const out = sanitizeFailureReason(msg);
    expect(out.endsWith("...")).toBe(true);
    expect(toStorableJson(out).removed).toBe(0);
  });
});

describe("stepFailure shortening", () => {
  it("does not split an emoji at the 200-character cut", async () => {
    const { stepFailure } = await import("./solution-step-failure.js");
    const failure = stepFailure("some-tool", new Error("x".repeat(199) + "\u{1F600}"));
    expect(toStorableJson(failure).removed).toBe(0);
  });
});
