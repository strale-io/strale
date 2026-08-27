import { describe, it, expect } from "vitest";
import { handoffIsAtRisk, preservationReason, type PreservationEvidence } from "./handoff-preservation.js";

const BLOB = "c97235f13e76c981a20e5906b0f503a6a30da688";
const OTHER = "9d9f630dc00eb4d7ada3997adb9015ce5c3ccb30";

function evidence(over: Partial<PreservationEvidence> = {}): PreservationEvidence {
  return { workingBlob: BLOB, trackedHere: false, mainBlob: null, upstreamBlob: null, ...over };
}

describe("handoffIsAtRisk", () => {
  it("flags a file git has never been shown", () => {
    expect(handoffIsAtRisk(evidence())).toBe(true);
    expect(preservationReason(evidence())).toBeNull();
  });

  it("clears a file tracked on the current branch — the old check's only test", () => {
    expect(handoffIsAtRisk(evidence({ trackedHere: true }))).toBe(false);
  });

  // The 2026-08-27 incident. The old check asked only `trackedHere`, so this
  // case answered "at risk" for two incident records that were byte-identical
  // to the copies on main. Against the un-fixed predicate this expectation is
  // false: that is what makes the test discriminate.
  it("clears an untracked file whose content is already on origin/main", () => {
    const e = evidence({ trackedHere: false, mainBlob: BLOB });
    expect(handoffIsAtRisk(e)).toBe(false);
    expect(preservationReason(e)).toBe("identical copy on origin/main");
  });

  it("clears an untracked file preserved on the branch's pushed upstream", () => {
    const e = evidence({ trackedHere: false, upstreamBlob: BLOB });
    expect(handoffIsAtRisk(e)).toBe(false);
    expect(preservationReason(e)).toBe("identical copy on this branch's upstream");
  });

  it("still flags a file whose path exists on main carrying DIFFERENT content", () => {
    // Same filename, edited locally. The stored copy is not this record, so
    // the local edits really would be lost. Matching on path alone would have
    // silenced this, which is the failure mode in the other direction.
    const e = evidence({ mainBlob: OTHER, upstreamBlob: OTHER });
    expect(handoffIsAtRisk(e)).toBe(true);
    expect(preservationReason(e)).toBeNull();
  });

  it("treats an absent path as no evidence rather than as a match", () => {
    expect(handoffIsAtRisk(evidence({ mainBlob: null, upstreamBlob: null }))).toBe(true);
  });
});
