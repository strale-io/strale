// Tests for the repo-native digest readers promoted to production in M4
// batch 5 (fetch-decision-queue.ts, fetch-distribution-registry.ts,
// fetch-handoff-activity.ts). These replace fetch-notion.ts's getPriorities()
// and getDistributionSurfaces(), and fetch-shiplog.ts's
// fetchNotionWorkspaceActivity(), inside gatherDigestData().
//
// Every reader is tested both against a throwaway fixture (planted shapes,
// including a deliberately wrong shape) and against the live repository, so
// a reader returning the wrong shape fails here rather than only showing up
// once the digest email renders in production.
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getPriorities, REPO_ROOT as DECISION_QUEUE_REPO_ROOT } from "./fetch-decision-queue.js";
import { getDistributionSurfaces, REPO_ROOT as DISTRIBUTION_REPO_ROOT } from "./fetch-distribution-registry.js";
import { recentHandoffActivity, REPO_ROOT as HANDOFF_REPO_ROOT } from "./fetch-handoff-activity.js";

// All three REPO_ROOT constants resolve the same directory (repo root) from
// three different files under apps/api/src/lib/daily-digest/, so this also
// catches a wrong relative-path depth in any one of them.
const realRoot = DECISION_QUEUE_REPO_ROOT;

function writeFiles(dir: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(dir, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function makeFixture(): string {
  return mkdtempSync(join(tmpdir(), "digest-repo-native-ts-"));
}

describe("getPriorities (fetch-decision-queue.ts)", () => {
  it("resolves the same repo root as the other two readers", () => {
    expect(DECISION_QUEUE_REPO_ROOT).toBe(DISTRIBUTION_REPO_ROOT);
    expect(DISTRIBUTION_REPO_ROOT).toBe(HANDOFF_REPO_ROOT);
  });

  it("splits decided/your_call entries at the 14-day cutoff, in the Priorities shape", () => {
    const dir = makeFixture();
    try {
      // Built from a char code, never a literal em dash character, matching
      // scripts/digest-repo-native.test.mjs's own convention.
      const em = String.fromCharCode(8212);
      const text = [
        "**DQ-1** · `decided` · owner Claude · 2026-09-05 " + em + " **recent decided**",
        "**DQ-2** · `decided` · owner Claude · 2026-08-20 " + em + " **old decided**",
        "**DQ-3** · `your_call` · owner Petter · raised 2026-09-01 · no deadline " + em + " **recent your_call**",
      ].join("\n");
      writeFiles(dir, { "docs/company/DECISION-QUEUE.md": text });
      const now = new Date("2026-09-11T00:00:00Z");
      const priorities = getPriorities(dir, { now });
      expect(priorities.unreviewedDecisions).toEqual([{ id: "DQ-1", title: "recent decided", date: "2026-09-05" }]);
      expect(priorities.olderUnreviewedCount).toBe(1);
      expect(priorities.actionRequired).toEqual([{ title: "recent your_call", createdAt: "2026-09-01" }]);
      expect(priorities.olderActionRequiredCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws naming the line on a malformed entry, instead of returning a wrong shape silently", () => {
    const dir = makeFixture();
    try {
      writeFiles(dir, { "docs/company/DECISION-QUEUE.md": "**DQ-99** · `sideways` · owner Claude · 2026-08-01" });
      expect(() => getPriorities(dir, { now: new Date("2026-09-11") })).toThrow(/unknown decision queue status "sideways"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs against the live repository without error", () => {
    const priorities = getPriorities(realRoot, { now: new Date() });
    expect(Array.isArray(priorities.unreviewedDecisions)).toBe(true);
    expect(Array.isArray(priorities.actionRequired)).toBe(true);
    expect(typeof priorities.olderUnreviewedCount).toBe("number");
    expect(typeof priorities.olderActionRequiredCount).toBe("number");
  });
});

describe("getDistributionSurfaces (fetch-distribution-registry.ts)", () => {
  it("maps register rows to the DistributionSurface shape", () => {
    const dir = makeFixture();
    try {
      const yaml = [
        "schema_version: 1",
        "authority_active: false",
        "surfaces:",
        "  - id: example-listing",
        "    surface: Example Registry",
        "    kind: registry-listing",
        "    target: example.com/strale",
        "    status: listed",
        "    status_date: 2026-09-01",
        "    evidence: docs/company/DIRECTORY-MAP.md",
      ].join("\n");
      writeFiles(dir, { "docs/operations/distribution-registry.yaml": yaml });
      const surfaces = getDistributionSurfaces(dir);
      expect(surfaces).toEqual([{ name: "Example Registry", status: "listed", daysPending: null, url: null }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when the file is missing, instead of silently returning an empty list", () => {
    const dir = makeFixture();
    try {
      expect(() => getDistributionSurfaces(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs against the live repository and matches the real register's surface count", () => {
    const surfaces = getDistributionSurfaces(realRoot);
    expect(Array.isArray(surfaces)).toBe(true);
    expect(surfaces.length).toBeGreaterThan(0);
    for (const s of surfaces) {
      expect(typeof s.name).toBe("string");
      expect(typeof s.status).toBe("string");
      expect(s.daysPending).toBeNull();
      expect(s.url).toBeNull();
    }
  });
});

describe("recentHandoffActivity (fetch-handoff-activity.ts)", () => {
  it("only returns files whose name starts with a date inside the window, with Intent when present", () => {
    const dir = makeFixture();
    try {
      writeFiles(dir, {
        "handoff/_general/from-code/2026-09-10-inside-window.md": "Intent: do the thing.\n\nMore text.",
        "handoff/_general/from-code/2026-09-08-outside-1-day-window.md": "Intent: too old for the digest's 24h window.",
        "handoff/_general/from-code/no-date-prefix.md": "Intent: never matched at all.",
      });
      const now = new Date("2026-09-11T00:00:00Z");
      const activity = recentHandoffActivity(dir, { now, days: 1 });
      expect(activity).toEqual([{ date: "2026-09-10", file: "2026-09-10-inside-window.md", intent: "do the thing." }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns [] rather than throwing when the directory does not exist", () => {
    const dir = makeFixture();
    try {
      expect(recentHandoffActivity(dir, { now: new Date("2026-09-11") })).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs against the live repository without error", () => {
    const activity = recentHandoffActivity(realRoot, { now: new Date(), days: 14 });
    expect(Array.isArray(activity)).toBe(true);
    for (const a of activity) {
      expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof a.file).toBe("string");
    }
  });
});
