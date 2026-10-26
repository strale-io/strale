import { describe, expect, it, vi } from "vitest";
vi.mock("./capability-onboarding.js", () => ({ onCapabilityCreated: vi.fn() }));
import { diffAndUpdateLimitations } from "./capability-persistence.js";

describe("onboarding limitation accounting", () => {
  it("reports names only for actual inserts, deletions and moves", async () => {
    const old = {
      id: "old",
      title: "Removed",
      limitationText: "Old coverage",
      category: "coverage",
      severity: "info",
      workaround: null,
      sortOrder: 0,
    };
    const kept = {
      id: "kept",
      title: "Moved",
      limitationText: "Existing coverage",
      category: "coverage",
      severity: "info",
      workaround: null,
      sortOrder: 0,
    };
    const db = {
      select: () => ({ from: () => ({ where: async () => [old, kept] }) }),
      delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
      insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }),
      update: () => ({
        set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    const observe = vi.fn();
    const added = {
      title: "New",
      limitationText: "New coverage",
      category: "coverage",
      severity: "info",
      workaround: null,
    };
    const result = await diffAndUpdateLimitations(
      db as any,
      "sample-tool",
      [added, kept],
      observe
    );
    expect(result).toEqual({ inserted: 1, deleted: 1, reordered: 1 });
    expect(observe.mock.calls).toEqual([
      ["deleted", ["Removed"]],
      ["created", ["New"]],
      ["updated", ["Moved"]],
    ]);
  });
});
