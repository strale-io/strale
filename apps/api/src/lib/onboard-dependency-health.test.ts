/**
 * A generated dependency_health suite must not assert a field the capability
 * does not promise.
 *
 * The unconditional `status` check pinned every capability without a `status`
 * output at a permanent 80% — four of five suites passing — against
 * `capability-promotion`'s 95% bar. Scheduled, healthy, unpromotable. Hit by
 * six capabilities on 2026-09-05 (patched by a hardcoded startup-migration
 * block) and eight more on 2026-09-06 before the generator was fixed.
 *
 * Both directions matter: dropping the check for a capability that DOES
 * promise `status` would silently weaken a correct assertion, which is how a
 * broken dependency stops being detected.
 */
import { describe, expect, it } from "vitest";
import { dependencyHealthChecks } from "./onboard-dependency-health.js";

const STATUS_CHECK = [{ field: "status", operator: "not_null" }];

describe("dependencyHealthChecks", () => {
  // The legitimate case. cve-details declares status: guaranteed (NVD's
  // "Analyzed"), as do the registry capabilities returning a company status.
  it("asserts status when the manifest declares it guaranteed", () => {
    expect(dependencyHealthChecks({ output_field_reliability: { cve_id: "guaranteed", status: "guaranteed" } }))
      .toEqual(STATUS_CHECK);
  });

  // The bug. Eight capabilities on 2026-09-06 declared no status at all and
  // failed this suite on every single run.
  it("asserts nothing when the manifest never mentions status", () => {
    expect(dependencyHealthChecks({ output_field_reliability: { query: "guaranteed", studies: "guaranteed" } }))
      .toEqual([]);
  });

  // A field that is only sometimes present is exactly the "expected non-null
  // on an optional field" trap; `guaranteed` is the whole discriminator.
  it.each(["common", "rare"])("asserts nothing when status is only %s", (reliability) => {
    expect(dependencyHealthChecks({ output_field_reliability: { status: reliability } })).toEqual([]);
  });

  it("tolerates a manifest with no declared output fields", () => {
    expect(dependencyHealthChecks({})).toEqual([]);
    expect(dependencyHealthChecks({ output_field_reliability: null })).toEqual([]);
    expect(dependencyHealthChecks({ output_field_reliability: {} })).toEqual([]);
  });

  // Fail closed: an unrecognised reliability word is not a promise.
  it("does not assert on an unrecognised reliability value", () => {
    expect(dependencyHealthChecks({ output_field_reliability: { status: "GUARANTEED" } })).toEqual([]);
    expect(dependencyHealthChecks({ output_field_reliability: { status: "always" } })).toEqual([]);
  });
});
