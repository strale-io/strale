import { describe, expect, it } from "vitest";
import { EMPLOYMENT_COST_RATES_AS_OF } from "./employment-cost-estimate.js";
import { getExecutor } from "./index.js";

// Pins the employer contribution rates checked on 2026-11-06 (see the source
// note in employment-cost-estimate.ts).

interface Estimate {
  employer_contributions: {
    social_security_percent: number;
    pension_percent: number;
    total_percent: number;
  };
  breakdown_notes: string[];
}

async function estimate(country_code: string): Promise<Estimate> {
  const fn = getExecutor("employment-cost-estimate")!;
  const res = (await fn({ gross_salary: 600000, country_code })) as { output: Estimate };
  return res.output;
}

describe("employment-cost-estimate employer rates (as of 2026-11-06)", () => {
  it("carries the check date", () => {
    expect(EMPLOYMENT_COST_RATES_AS_OF).toBe("2026-11-06");
  });

  it.each([
    ["SE", 31.42],
    ["NO", 14.1],
    ["FI", 19.32],
    ["DE", 21.875],
    ["GB", 15],
    ["US", 7.65],
    ["CA", 8.232],
    ["AU", 12],
    ["IE", 11.4],
    ["ES", 30.65],
    ["PL", 20.48],
    ["PT", 23.75],
  ])("%s employer social rate is %s percent", async (cc, rate) => {
    expect((await estimate(cc)).employer_contributions.social_security_percent).toBe(rate);
  });

  it("Ireland includes the 1.5% MyFutureFund employer contribution", async () => {
    expect((await estimate("IE")).employer_contributions.pension_percent).toBe(1.5);
  });

  it("notes carry the current thresholds", async () => {
    expect((await estimate("GB")).breakdown_notes.join(" ")).toContain("GBP 5,000");
    expect((await estimate("US")).breakdown_notes.join(" ")).toContain("$184,500");
    expect((await estimate("CA")).breakdown_notes.join(" ")).toContain("1.4x");
  });
});
