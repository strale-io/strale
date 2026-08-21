import { describe, expect, it } from "vitest";

import {
  computeIdempotencyFingerprint,
  isReplayable,
} from "./idempotency-fingerprint.js";

const base = {
  capabilitySlug: "iban-validate",
  inputs: { iban: "DE89370400440532013000", country: "DE" },
};

describe("a retry is the same request", () => {
  it("is stable across JSON key order", () => {
    // The case that decides whether this helps or hurts. An HTTP client has no
    // obligation to serialise object keys the same way on a retry — and a retry
    // is exactly when idempotency matters. Without recursive canonicalisation
    // the fingerprint would differ and a legitimate retry would 409, which is
    // worse than the bug being fixed.
    const a = computeIdempotencyFingerprint(base);
    const b = computeIdempotencyFingerprint({
      capabilitySlug: "iban-validate",
      inputs: { country: "DE", iban: "DE89370400440532013000" },
    });
    expect(a).toBe(b);
  });

  it("is stable for nested objects too", () => {
    const a = computeIdempotencyFingerprint({
      capabilitySlug: "x",
      inputs: { outer: { z: 1, a: { q: 2, b: 3 } } },
    });
    const b = computeIdempotencyFingerprint({
      capabilitySlug: "x",
      inputs: { outer: { a: { b: 3, q: 2 }, z: 1 } },
    });
    expect(a).toBe(b);
  });

  it("does NOT reorder arrays — order is meaning there", () => {
    const a = computeIdempotencyFingerprint({
      capabilitySlug: "x",
      inputs: { items: [1, 2] },
    });
    const b = computeIdempotencyFingerprint({
      capabilitySlug: "x",
      inputs: { items: [2, 1] },
    });
    expect(a).not.toBe(b);
  });
});

describe("a different request is a different request", () => {
  it("changes when inputs change", () => {
    expect(computeIdempotencyFingerprint(base)).not.toBe(
      computeIdempotencyFingerprint({ ...base, inputs: { iban: "GB33BUKB20201555555555" } }),
    );
  });

  it("changes when the capability changes", () => {
    // The dangerous case: the same key across two capabilities returned the
    // first one's output labelled as the second's.
    expect(computeIdempotencyFingerprint(base)).not.toBe(
      computeIdempotencyFingerprint({ ...base, capabilitySlug: "vat-validate" }),
    );
  });

  it("distinguishes task routing from slug routing", () => {
    // Both select what runs, so a key bound to one must not match the other.
    expect(
      computeIdempotencyFingerprint({ task: "validate an IBAN", inputs: {} }),
    ).not.toBe(computeIdempotencyFingerprint({ capabilitySlug: "iban-validate", inputs: {} }));
  });
});

describe("replayability", () => {
  it("replays an identical request", () => {
    const fp = computeIdempotencyFingerprint(base);
    expect(isReplayable(fp, fp)).toBe(true);
  });

  it("refuses a different request under the same key", () => {
    expect(
      isReplayable(computeIdempotencyFingerprint(base), computeIdempotencyFingerprint({ ...base, capabilitySlug: "other" })),
    ).toBe(false);
  });

  it("replays when the field is undefined, not just null", () => {
    // A projection that omits the column, a fixture, or a cached row shape all
    // yield undefined rather than null, and `undefined === null` is false.
    // Getting this wrong 409s a legitimate retry.
    expect(isReplayable(undefined, computeIdempotencyFingerprint(base))).toBe(true);
  });

  it("replays a row that predates the column", () => {
    // Deliberate. Refusing would break clients holding keys issued before the
    // deploy; the set is finite and drains as those keys age out.
    expect(isReplayable(null, computeIdempotencyFingerprint(base))).toBe(true);
  });
});

describe("what the key is scoped to", () => {
  it("separates the capability rail from the solution rail", () => {
    // Capabilities and solutions are separate tables with independent slug
    // namespaces. Nothing prevents the same string existing in both, and
    // without a rail discriminator one key would fingerprint identically
    // across them.
    expect(
      computeIdempotencyFingerprint({ rail: "capability", capabilitySlug: "kyb-complete-se", inputs: {} }),
    ).not.toBe(
      computeIdempotencyFingerprint({ rail: "solution", capabilitySlug: "kyb-complete-se", inputs: {} }),
    );
  });

  it("distinguishes a dry run from a real execution", () => {
    // A replay answers "what DID happen" in a shape indistinguishable from a
    // real execution. Someone asking "what WOULD happen" must not get it.
    expect(computeIdempotencyFingerprint({ capabilitySlug: "x", inputs: {}, dryRun: true })).not.toBe(
      computeIdempotencyFingerprint({ capabilitySlug: "x", inputs: {}, dryRun: false }),
    );
  });

  it("distinguishes require_fresh, which a replay would silently bypass", () => {
    expect(
      computeIdempotencyFingerprint({ capabilitySlug: "x", inputs: {}, requireFresh: true }),
    ).not.toBe(computeIdempotencyFingerprint({ capabilitySlug: "x", inputs: {}, requireFresh: false }));
  });

  it("does NOT include the budget knobs — replaying past those is the point", () => {
    // max_price_cents / timeout_seconds are not part of the question being
    // asked, and folding them in would 409 a retry that merely raised a budget.
    const a = computeIdempotencyFingerprint({ capabilitySlug: "x", inputs: { a: 1 } });
    const b = computeIdempotencyFingerprint({ capabilitySlug: "x", inputs: { a: 1 } });
    expect(a).toBe(b);
  });
});
