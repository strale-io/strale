import { describe, expect, it, vi } from "vitest";
import { withDatabase } from "../db/index.js";
import { onCapabilityCreated } from "./capability-onboarding.js";
import { getExecutor } from "../capabilities/index.js";
vi.mock("../capabilities/index.js", () => ({ getExecutor: vi.fn() }));
vi.mock("./capability-readiness.js", () => ({
  checkReadiness: vi.fn().mockResolvedValue({ ready: true }),
  clearReadinessCache: vi.fn(),
}));
vi.mock("./onboarding-gates.js", () => ({
  validateCapabilityStructure: () => [],
  validateCapabilitySchema: () => [],
  enforceGates: vi.fn(),
  runGate5: vi.fn().mockResolvedValue({ isMultiPath: false }),
}));
function operatorDb() {
  const row = { id: "sample", slug: "sample-tool", name: "Sample", inputSchema: {}, outputSchema: {}, transparencyTag: "api", isActive: true, visible: true, lifecycleState: "active" };
  const reads = [[row], [], [], [row]];
  const db = {
    select: vi.fn(() => {
      const value = reads.shift() ?? [];
      const query: any = { from: () => query, where: () => query, limit: async () => value, then: (ok: any) => Promise.resolve(value).then(ok) };
      return query;
    }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  };
  return db;
}
describe("onboarding hook execution scope", () => {
  it("route runs skip detached fixture validation while writing through the explicit handle", async () => {
    vi.mocked(getExecutor).mockClear();
    const db = operatorDb();
    await withDatabase(db as any, () => onCapabilityCreated("sample-tool", { db: db as any, signal: new AbortController().signal }));
    await Promise.resolve();
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(getExecutor).not.toHaveBeenCalled();
  });
  it("CLI deep hook writes still use the scoped operator handle", async () => {
    const db = operatorDb();
    await withDatabase(db as any, async () => {
      await Promise.resolve();
      await onCapabilityCreated("sample-tool");
    });
    expect(db.insert).toHaveBeenCalledTimes(2);
  });
});
