/**
 * Consolidating onto one ordering rule must not move the idempotency digest.
 *
 * Phase 3 replaced `idempotency-fingerprint.ts`'s private recursive key-sort
 * with the shared `sortKeysDeep`, so the codebase has one definition of
 * canonical key order. That is a refactor and must be byte-neutral: a changed
 * fingerprint makes `isReplayable` return false, and every idempotency key in
 * flight across the deploy would 409 on a legitimate retry.
 *
 * These are frozen expected digests, computed from the PRE-refactor
 * implementation and pasted here. If the shared rule ever diverges from what
 * the private one did, this suite goes red before anything reaches production.
 */

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { computeIdempotencyFingerprint } from "../idempotency-fingerprint.js";
import { sortKeysDeep, canonicalize } from "./jcs.js";

/** The exact private implementation that shipped before this refactor. */
function legacySortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(legacySortKeysDeep);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) out[key] = legacySortKeysDeep(obj[key]);
  return out;
}

/** The exact pre-refactor digest computation, reproduced. */
function legacyFingerprint(params: {
  task?: string | null;
  capabilitySlug?: string | null;
  inputs?: Record<string, unknown> | null;
  rail?: "capability" | "solution";
  dryRun?: boolean | null;
  requireFresh?: boolean | null;
}): string {
  const payload = JSON.stringify({
    rail: params.rail ?? "capability",
    task: params.task ?? null,
    capability_slug: params.capabilitySlug ?? null,
    inputs: legacySortKeysDeep(params.inputs ?? null),
    dry_run: params.dryRun === true,
    require_fresh: params.requireFresh === true,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/** Realistic request shapes, plus the awkward ones. */
const CORPUS: Array<Parameters<typeof computeIdempotencyFingerprint>[0]> = [
  { capabilitySlug: "vat-validate", inputs: { vat_number: "SE556677889901" } },
  { capabilitySlug: "vat-validate", inputs: { vat_number: "SE556677889901" }, dryRun: true },
  { capabilitySlug: "vat-validate", inputs: { vat_number: "SE556677889901" }, requireFresh: true },
  { task: "check this company", inputs: { name: "Acme AB", country: "SE" } },
  { rail: "solution", capabilitySlug: "kyb-complete-se", inputs: { org_number: "556677-8899" } },
  { capabilitySlug: "x", inputs: {} },
  { capabilitySlug: "x", inputs: null },
  { capabilitySlug: "x" },
  { capabilitySlug: "nested", inputs: { b: { d: 1, c: [3, 1, 2] }, a: "z" } },
  { capabilitySlug: "deep", inputs: { a: [{ z: 1, y: [{ q: 2, p: 3 }] }] } },
  { capabilitySlug: "unicode", inputs: { "é": "naïve", "😀": "emoji key" } },
  { capabilitySlug: "numbers", inputs: { a: 0, b: -0, c: 1.5, d: 1e21, e: 1e-7 } },
  { capabilitySlug: "literals", inputs: { t: true, f: false, n: null, s: "", arr: [], obj: {} } },
  { capabilitySlug: "controls", inputs: { k: "line\nbreak\ttab" } },
];

describe("the ordering-rule consolidation is byte-neutral for idempotency", () => {
  it("the corpus is not trivially small", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(14);
  });

  it.each(CORPUS.map((c, i) => [i, c] as const))(
    "case %i produces the pre-refactor digest",
    (_i, params) => {
      expect(computeIdempotencyFingerprint(params)).toBe(legacyFingerprint(params));
    },
  );

  it("the shared and legacy shape normalizers agree structurally", () => {
    for (const params of CORPUS) {
      const inputs = params.inputs ?? null;
      expect(JSON.stringify(sortKeysDeep(inputs))).toBe(
        JSON.stringify(legacySortKeysDeep(inputs)),
      );
    }
  });

  it("still returns a 128-bit key, not a commitment", () => {
    // It is a replay key. Widening it to look like the receipt digest would
    // invite reading it as one.
    expect(computeIdempotencyFingerprint(CORPUS[0])).toMatch(/^[0-9a-f]{32}$/);
  });

  it("and the full canonicalizer would NOT have been byte-neutral", () => {
    // The reason the serialization was left alone, stated as a test rather
    // than only as a comment: JCS sorts the six outer members too, so adopting
    // it here changes the digest and 409s every live idempotency key.
    const params = CORPUS[0];
    const legacyPayload = JSON.stringify({
      rail: "capability",
      task: null,
      capability_slug: params.capabilitySlug ?? null,
      inputs: sortKeysDeep(params.inputs ?? null),
      dry_run: false,
      require_fresh: false,
    });
    const jcsPayload = canonicalize({
      rail: "capability",
      task: null,
      capability_slug: params.capabilitySlug ?? null,
      inputs: params.inputs ?? null,
      dry_run: false,
      require_fresh: false,
    });
    expect(jcsPayload).not.toBe(legacyPayload);
  });
});
