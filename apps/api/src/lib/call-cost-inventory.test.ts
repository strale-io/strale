import { expect, it } from "vitest";
import { getExecutor, registerCapability } from "../capabilities/index.js";
import { registerDataAccess } from "./data-access.js";
import { withCallCost, snapshotCallCost } from "./call-cost.js";
it("a computed LLM capability with no usage cannot be recorded as known zero", async () => {
  registerDataAccess("summarize", { acquisition_method: "computed", lane: "not_applicable" });
  registerCapability("summarize", async () => ({ output: { summary: "unmetered" }, provenance: { source: "test", fetched_at: "2026-10-27T00:00:00Z" } }));
  await withCallCost(async () => {
    await getExecutor("summarize")!({ text: "test" });
    expect(snapshotCallCost().cost_cents).toBeNull();
    expect(snapshotCallCost().cost_breakdown.unknowns).toContain("llm_in_flight_or_unmetered");
  }, 1);
});
