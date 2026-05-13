/**
 * Tests for the failure-reason classifier (DEC-20260513-F-prep).
 *
 * Focus: the new `manifest_drift` category for PR #109's sentinel
 * emissions (`guaranteed_field_missing:*`) introduced as part of the
 * Phase 3 closure for DEC-20260513-B + DEC-20260513-C. Existing
 * categories are smoke-checked to ensure the new clause doesn't
 * regress them.
 *
 * Per Rule 12 (audit-follow-up test coverage): the new branch in
 * categorizeFailureReason is paired with regression tests for both
 * legitimate suffix shapes the sentinel emits, plus a sanity check
 * that genuine upstream failures still classify as retryable
 * external-service errors.
 */

import { describe, it, expect } from "vitest";
import { categorizeFailureReason, isRetryableFailure, toLegacyCategory } from "./trust-helpers.js";

describe("categorizeFailureReason — manifest_drift (DEC-20260513-B/C)", () => {
  it("classifies guaranteed_field_missing:<field-path> as manifest_drift", () => {
    // The dominant shape emitted by checkGuaranteedFieldsPresent
    // (lib/guaranteed-fields-sentinel.ts) when a key declared
    // `guaranteed` in output_field_reliability is absent from
    // actual_output. The breaker must skip this category — see
    // circuit-breaker.ts recordFailure.
    expect(categorizeFailureReason("guaranteed_field_missing:company_name")).toBe("manifest_drift");
    expect(categorizeFailureReason("guaranteed_field_missing:income")).toBe("manifest_drift");
    expect(categorizeFailureReason("guaranteed_field_missing:corporate_number")).toBe("manifest_drift");
  });

  it("classifies guaranteed_field_missing:<root-not-object> as manifest_drift", () => {
    // The second legitimate suffix shape the sentinel emits, when the
    // executor's actual_output isn't a plain object at all (the CH
    // 2026-05-13 bad-fixture root-shape failure mode). Same category;
    // same breaker-skip path.
    expect(categorizeFailureReason("guaranteed_field_missing:<root-not-object>")).toBe("manifest_drift");
  });

  it("genuine upstream failures still classify as their existing categories (no regression)", () => {
    // Sanity check: the new clause is prefix-anchored, so it doesn't
    // accidentally catch unrelated failure_reason strings. The breaker
    // continues to trip on real HTTP 5xx, timeouts, auth failures, etc.
    expect(categorizeFailureReason("HTTP 502 Bad Gateway")).toBe("transient");
    expect(categorizeFailureReason("Request timed out after 30000ms")).toBe("transient");
    expect(categorizeFailureReason("HTTP 401 Unauthorized")).toBe("auth_expired");
    expect(categorizeFailureReason("HTTP 404 not found")).toBe("endpoint_gone");
    expect(categorizeFailureReason("TypeError: Cannot read property 'foo' of undefined"))
      .toBe("internal");
  });

  it("manifest_drift is not retryable (no point retrying a manifest bug)", () => {
    // isRetryableFailure returns true only for transient/unknown.
    // manifest_drift is neither — but the circuit-breaker entry skips
    // the category entirely (recordFailure returns early), so the
    // retryable bit is never read for this category in practice.
    // Asserting it here so the contract stays stable if a future
    // caller starts consuming isRetryableFailure on manifest_drift.
    expect(isRetryableFailure("manifest_drift")).toBe(false);
  });

  it("manifest_drift maps to legacy 'internal' for backward-compat consumers", () => {
    // toLegacyCategory is used by the 3-value compat layer for older
    // API consumers. manifest_drift is bucketed as `internal` because
    // the underlying cause is in Strale's own manifest authorship,
    // not the upstream service.
    expect(toLegacyCategory("manifest_drift")).toBe("internal");
  });

  it("null / empty failure_reason still classifies as unknown", () => {
    // Defensive: the prefix-match must not false-trigger on null or
    // empty strings (early-return path).
    expect(categorizeFailureReason(null)).toBe("unknown");
    expect(categorizeFailureReason("")).toBe("unknown");
  });
});
