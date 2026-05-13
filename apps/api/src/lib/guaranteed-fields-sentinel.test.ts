/**
 * Unit tests for the canonical-input sentinel (Gate 3).
 *
 * Phase 3 Harden for DEC-20260513-B + DEC-20260513-C. Per Rule 12
 * (audit-follow-up test coverage): each new code path is paired with a
 * regression test. Three positive failure cases + one negative
 * non-failure case satisfy the rule.
 */

import { describe, it, expect } from "vitest";
import { checkGuaranteedFieldsPresent } from "./guaranteed-fields-sentinel.js";

describe("checkGuaranteedFieldsPresent (Gate 3 — strict-missing-only)", () => {
  it("passes when every guaranteed field is present as a key", () => {
    // Happy path. Values can be anything — the gate only checks key presence.
    const result = checkGuaranteedFieldsPresent(
      {
        company_name: "Roche Holding AG",
        uid: "CHE101602521",
        status: "ACTIVE",
        data_attribution: "Zefix",
      },
      {
        company_name: "guaranteed",
        uid: "guaranteed",
        status: "guaranteed",
        data_attribution: "guaranteed",
        canton: "common",
        purpose: "rare",
      },
    );
    expect(result.passed).toBe(true);
    expect(result.failureReason).toBeUndefined();
  });

  it("fails when actual_output is an array (CH bad-fixture root shape)", () => {
    // The CH 2026-05-13 incident class: Zefix returned 200 OK [] for an
    // invalid UID; the parser path that handled "no match" yielded an
    // output value that wasn't a plain object. v1 of the sentinel would
    // have caught this too, but only via the missing-keys branch. v2's
    // root-shape branch surfaces the explicit signal.
    const result = checkGuaranteedFieldsPresent(
      [],
      { company_name: "guaranteed", uid: "guaranteed" },
    );
    expect(result.passed).toBe(false);
    expect(result.failureReason).toBe("guaranteed_field_missing:<root-not-object>");
  });

  it("fails when a declared guaranteed field key is absent (the 4 real-bug class)", () => {
    // The exact pattern surfaced in v1's backfill check for
    // charity-lookup-uk.income, japanese-company-data.corporate_number,
    // llm-output-validate.auto_fixed_output, openapi-validate.stats.
    // Every other declared field is present; one is missing entirely.
    const result = checkGuaranteedFieldsPresent(
      { uid: "CHE-..." },
      {
        company_name: "guaranteed",
        uid: "guaranteed",
      },
    );
    expect(result.passed).toBe(false);
    expect(result.failureReason).toBe("guaranteed_field_missing:company_name");
  });

  it("passes when guaranteed fields are present with empty / null values (the validator/scanner semantic)", () => {
    // Critical non-failure case. v1's "non-empty" rule would have failed
    // here and flipped 35+ healthy capabilities (security scans,
    // validators, deduplicators) to degraded. v2 must explicitly pass:
    // findings=[] means no secrets, severity_counts={} means no findings
    // bucketed, scanner_version="" is implausible but allowed by this gate
    // (null/empty governance lives in DEC-20260409-A, not here).
    const result = checkGuaranteedFieldsPresent(
      {
        findings: [],
        severity_counts: {},
        scanner_version: null,
        scan_completed_at: "",
      },
      {
        findings: "guaranteed",
        severity_counts: "guaranteed",
        scanner_version: "guaranteed",
        scan_completed_at: "guaranteed",
      },
    );
    expect(result.passed).toBe(true);
  });

  it("passes when no field is declared guaranteed (no-op on caps without reliability data)", () => {
    // Defensive: capabilities authored before output_field_reliability
    // was introduced have no guaranteed entries; the gate must not fire.
    expect(checkGuaranteedFieldsPresent({}, null).passed).toBe(true);
    expect(checkGuaranteedFieldsPresent({}, undefined).passed).toBe(true);
    expect(checkGuaranteedFieldsPresent({}, {}).passed).toBe(true);
    expect(
      checkGuaranteedFieldsPresent({}, { foo: "common", bar: "rare" }).passed,
    ).toBe(true);
  });

  it("fails when output is null and at least one field is guaranteed", () => {
    // Defensive: a capability that throws before returning output yields
    // capResult === null upstream; if test-runner happens to reach this
    // gate with a null output and guaranteed declarations present, the
    // root-not-object failure path catches it. Belt-and-braces — the
    // ahead-of-gate `if (!capResult)` check in test-runner already
    // prevents this in practice.
    const result = checkGuaranteedFieldsPresent(null, {
      company_name: "guaranteed",
    });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toBe("guaranteed_field_missing:<root-not-object>");
  });
});
