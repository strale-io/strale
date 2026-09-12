import { describe, expect, it } from "vitest";

import {
  canonicalise,
  findFixtureDrift,
  type ManifestFixture,
  type SuiteRow,
} from "./fixture-drift.js";

function suite(over: Partial<SuiteRow> = {}): SuiteRow {
  return {
    suiteId: "suite-1",
    capabilitySlug: "cap",
    testType: "dependency_health",
    input: { id: "old" },
    runs: 10,
    passed: 0,
    sampleFailure: "Execution error: not found",
    capabilityActive: true,
    ...over,
  };
}

const manifest = (over: Partial<ManifestFixture> = {}): ManifestFixture => ({
  slug: "cap",
  healthCheckInput: { id: "new" },
  ...over,
});

describe("findFixtureDrift", () => {
  it("reports a suite whose production fixture differs from the manifest and never passes", () => {
    const found = findFixtureDrift([suite()], [manifest()]);
    expect(found).toHaveLength(1);
    expect(found[0].slug).toBe("cap");
    expect(found[0].productionInput).toBe('{"id":"old"}');
    expect(found[0].manifestInput).toBe('{"id":"new"}');
  });

  // The real canadian-company-data shape, as production held it on 2026-09-12.
  it("reports the canadian-company-data case", () => {
    const found = findFixtureDrift(
      [
        suite({
          capabilitySlug: "canadian-company-data",
          input: { corporation_number: "2408951" },
          runs: 173,
          passed: 0,
        }),
      ],
      [{ slug: "canadian-company-data", healthCheckInput: { corporation_number: "1007" } }],
    );
    expect(found.map((f) => f.slug)).toEqual(["canadian-company-data"]);
  });

  // The discriminating half. 36 suites on 2026-09-12 differed from their
  // manifest and passed anyway — for several reasons, not one: --discover
  // improving the DB row, self-heal.ts rewriting an input at runtime, and in
  // at least two cases the manifest being the better or fresher side. They are
  // excluded because a passing suite is not the actionable signal, not because
  // production is known to be right.
  it("does NOT report a differing fixture that passes", () => {
    expect(findFixtureDrift([suite({ passed: 3 })], [manifest()])).toEqual([]);
  });

  it("does NOT report a failing suite whose fixture matches its manifest", () => {
    // A real upstream failure: the vendor tower owns it, not this check.
    expect(findFixtureDrift([suite({ input: { id: "new" } })], [manifest()])).toEqual([]);
  });

  it("does NOT report a suite with no runs in the window", () => {
    expect(findFixtureDrift([suite({ runs: 0, passed: 0 })], [manifest()])).toEqual([]);
  });

  it("does NOT report when the manifest has no health_check_input to compare against", () => {
    expect(findFixtureDrift([suite()], [manifest({ healthCheckInput: undefined })])).toEqual([]);
  });

  it("ignores test types other than the one asked for", () => {
    expect(findFixtureDrift([suite({ testType: "known_answer" })], [manifest()])).toEqual([]);
    expect(
      findFixtureDrift([suite({ testType: "known_answer" })], [manifest()], {
        testType: "known_answer",
      }),
    ).toHaveLength(1);
  });

  it("treats key order as meaningless, so a reordered fixture is not drift", () => {
    const found = findFixtureDrift(
      [suite({ input: { b: 2, a: 1 } })],
      [manifest({ healthCheckInput: { a: 1, b: 2 } })],
    );
    expect(found).toEqual([]);
  });

  it("sorts active capabilities first, then by how many runs have been wasted", () => {
    const found = findFixtureDrift(
      [
        suite({ capabilitySlug: "quiet", runs: 2 }),
        suite({ capabilitySlug: "off", capabilityActive: false, runs: 999 }),
        suite({ capabilitySlug: "loud", runs: 173 }),
      ],
      [manifest({ slug: "quiet" }), manifest({ slug: "off" }), manifest({ slug: "loud" })],
    );
    expect(found.map((f) => f.slug)).toEqual(["loud", "quiet", "off"]);
  });

  it("carries the suite id so a finding names the row to fix", () => {
    // Two active suites for one capability is real (risk-narrative-generate),
    // and a finding that cannot say which one is not actionable.
    const found = findFixtureDrift(
      [suite({ suiteId: "a" }), suite({ suiteId: "b", input: { id: "other" } })],
      [manifest()],
    );
    expect(found.map((f) => f.suiteId).sort()).toEqual(["a", "b"]);
  });

  it("carries the latest failure through to the finding", () => {
    // The SQL goes out of its way to select the LATEST failure rather than
    // MAX(); nothing downstream was checking that it survived the mapping.
    const found = findFixtureDrift(
      [suite({ sampleFailure: "corporation does not exist" })],
      [manifest()],
    );
    expect(found[0].sampleFailure).toBe("corporation does not exist");
  });

  it("reports a null failure as null rather than dropping the field", () => {
    const found = findFixtureDrift([suite({ sampleFailure: undefined })], [manifest()]);
    expect(found[0].sampleFailure).toBeNull();
  });

  it("pins last-wins when two manifests claim one slug", () => {
    // There are no duplicate slugs across the 350 manifests today. Pinning the
    // behaviour means a future duplicate changes a test rather than silently
    // changing which fixture counts as correct.
    const found = findFixtureDrift(
      [suite({ input: { id: "second" } })],
      [manifest({ healthCheckInput: { id: "first" } }), manifest({ healthCheckInput: { id: "second" } })],
    );
    expect(found).toEqual([]);
  });
});

describe("canonicalise", () => {
  it("sorts nested objects, not only the top level", () => {
    // A shallow sort called these two different, which would have reported
    // every fixture carrying an options object as drifted.
    expect(canonicalise({ a: { z: 1, y: 2 } })).toBe(canonicalise({ a: { y: 2, z: 1 } }));
  });

  it("keeps array order, which does carry meaning", () => {
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it("renders null, and renders undefined as null rather than returning undefined", () => {
    // The `?? null` in canonicalise had no test: removing it left every test
    // green while the function returned `undefined` from a `string` signature.
    expect(canonicalise(null)).toBe("null");
    expect(canonicalise({ a: null })).toBe('{"a":null}');
    expect(canonicalise(undefined)).toBe("null");
  });
});
