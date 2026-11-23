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
