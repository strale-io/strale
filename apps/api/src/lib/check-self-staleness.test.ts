/**
 * The case that matters is `unknown`, and it is the one a naive predicate
 * omits. "Compare two hashes and warn if they differ" handles current and
 * stale correctly and silently reports a failed comparison as agreement —
 * which is the same silence the module exists to break.
 *
 * Verified failing against the un-fixed state: with the null-guard removed so
 * that two nulls compare equal, the two `unknown` tests fail and the rest pass.
 */
import { describe, it, expect } from "vitest";
import { selfStaleness } from "./check-self-staleness.js";

const BASE = { commitsBehind: 0, branch: "main" };

describe("selfStaleness", () => {
  it("reports an unmakeable comparison as unknown, never as current", () => {
    // Both null — e.g. offline, so origin/main could not be resolved. A
    // hash-equality check reads null === null as agreement and stays silent.
    const v = selfStaleness({ ...BASE, localBlob: null, mainBlob: null });
    expect(v.kind).toBe("unknown");
    if (v.kind !== "unknown") throw new Error("narrowing");
    expect(v.why).toMatch(/unverified/);
  });

  it("reports a missing origin/main copy as unknown", () => {
    const v = selfStaleness({ ...BASE, localBlob: "aaa", mainBlob: null });
    expect(v.kind).toBe("unknown");
  });

  it("is current when the content matches, however far behind the checkout is", () => {
    // 68 commits behind but an identical script: the findings are sound and
    // warning about them would be noise. Content, never commit distance.
    const v = selfStaleness({
      localBlob: "same", mainBlob: "same", commitsBehind: 68, branch: "remediation/wp9-artifacts",
    });
    expect(v.kind).toBe("current");
  });

  it("calls local divergence 'diverged', not 'stale'", () => {
    // A session editing this very check gets a content difference with zero
    // commits behind. Reporting that as "running stale logic" would be false,
    // and a warning that misdescribes itself is how this family started.
    const v = selfStaleness({
      localBlob: "mine", mainBlob: "theirs", commitsBehind: 0, branch: "feat/bundle-sales-instrument",
    });
    expect(v.kind).toBe("diverged");
    if (v.kind !== "diverged") throw new Error("narrowing");
    expect(v.why).toMatch(/not a missing repair/);
  });

  it("is stale when the content differs, even one commit behind", () => {
    const v = selfStaleness({
      localBlob: "old", mainBlob: "new", commitsBehind: 1, branch: "feat/x",
    });
    expect(v.kind).toBe("stale");
    if (v.kind !== "stale") throw new Error("narrowing");
    expect(v.commitsBehind).toBe(1);
    expect(v.branch).toBe("feat/x");
    expect(v.why).toMatch(/may be false/);
  });

  it("reproduces the 2026-08-29 morning exactly", () => {
    // The primary checkout on a branch that predates handoff-preservation.ts.
    // The run reported five orphaned handoffs; three were already on main.
    const v = selfStaleness({
      localBlob: "pre-407", mainBlob: "post-407",
      commitsBehind: 68, branch: "remediation/wp9-artifacts",
    });
    expect(v.kind).toBe("stale");
    if (v.kind !== "stale") throw new Error("narrowing");
    expect(v.why).toMatch(/already merged to main may not be applied here/);
  });
});
