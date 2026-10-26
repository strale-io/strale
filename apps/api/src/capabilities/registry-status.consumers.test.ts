import { describe, expect, it } from "vitest";
import { resolveInputRef, isSuccessfulStepOutput } from "../lib/solution-executor.js";
import { enrichCompanyOutput } from "./lib/enrich-company-output.js";
import { outcomeFromOutput } from "../lib/execution-outcome.js";

// A successful registry lookup of a dead company is still a purchased answer.
// It must survive solution plumbing unchanged, without becoming "active".
describe("registry statuses through shared solution consumers", () => {
  it.each([
    ["norwegian-company-data", "deleted"], ["norwegian-company-data", "compulsory_dissolution"],
    ["polish-company-data", "deregistered"], ["cz-company-data", "liquidation"],
    ["cz-company-data", "insolvency"], ["cz-company-data", "unknown"],
    ["greek-company-data", "inactive"], ["finnish-company-data", "bankrupt"],
    ["finnish-company-data", "restructuring"], ["finnish-company-data", "pending"],
  ])("%s %s survives $steps / $all_results / enrichment / outcome", (slug, status) => {
    const output = { company_name: "Synthetic company", status, business_id: "0112038-9" };
    expect(resolveInputRef("$steps[0].status", {}, [output], { [slug]: output })).toBe(status);
    expect(resolveInputRef("$all_results", {}, [output], { [slug]: output })).toEqual({ [slug]: output });
    expect(enrichCompanyOutput(slug, output).status).toBe(status);
    expect(isSuccessfulStepOutput(output)).toBe(true);
    expect(outcomeFromOutput(slug, output)).toMatchObject({ success: true, billable: true });
  });
});
