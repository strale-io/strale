import { describe, expect, it } from "vitest";
import { US_VWP, WORK_PERMIT_RULES_AS_OF } from "./work-permit-requirements.js";
import { getExecutor } from "./index.js";

// Pins the reference values checked on 2026-11-06 (see the source note in
// work-permit-requirements.ts). Update the values, WORK_PERMIT_RULES_AS_OF and
// this test together.

interface Permit {
  visa_required: boolean;
  permit_type: string;
  free_movement: boolean;
  requirements_summary: string;
  notes: string[];
}

async function check(nationality: string, destination: string, purpose = "work"): Promise<Permit> {
  const fn = getExecutor("work-permit-requirements")!;
  const res = (await fn({ nationality, destination, purpose })) as { output: Permit };
  return res.output;
}

describe("work-permit-requirements reference data (as of 2026-11-06)", () => {
  it("carries the check date", () => {
    expect(WORK_PERMIT_RULES_AS_OF).toBe("2026-11-06");
  });

  it("UK Skilled Worker threshold is GBP 41,700 or the going rate", async () => {
    for (const nat of ["DE", "IN"]) {
      const notes = (await check(nat, "GB")).notes.join(" ");
      expect(notes, nat).toContain("GBP 41,700");
      expect(notes, nat).not.toContain("26,200");
    }
  });

  it("Germany EU Blue Card uses the 2026 thresholds", async () => {
    const notes = (await check("IN", "DE")).notes.join(" ");
    expect(notes).toContain("EUR 50,700");
    expect(notes).toContain("EUR 45,934.20");
    expect(notes).not.toContain("45,300");
  });

  it("Sweden states the 90%-of-median salary requirement", async () => {
    const notes = (await check("IN", "SE")).notes.join(" ");
    expect(notes).toContain("90% of the median salary");
    expect(notes).toContain("SEK 34,470");
  });

  it("Irish and British citizens can work in each other's country (Common Travel Area)", async () => {
    for (const [nat, dest] of [["IE", "GB"], ["GB", "IE"]]) {
      const out = await check(nat, dest);
      expect(out.visa_required, `${nat}->${dest}`).toBe(false);
      expect(out.permit_type, `${nat}->${dest}`).toBe("none");
    }
  });

  it("UK visits: Colombian and Ukrainian citizens need a visa; Swiss do not; ETA noted", async () => {
    expect((await check("CO", "GB", "visit")).visa_required).toBe(true);
    expect((await check("UA", "GB", "visit")).visa_required).toBe(true);
    const ch = await check("CH", "GB", "visit");
    expect(ch.visa_required).toBe(false);
    expect(ch.notes.join(" ")).toContain("Electronic Travel Authorisation");
  });

  it("US visits follow the DHS Visa Waiver Program list", async () => {
    expect(US_VWP.size).toBe(42);
    const de = await check("DE", "US", "visit");
    expect(de.visa_required).toBe(false);
    expect(de.permit_type).toBe("esta_waiver");
    for (const nat of ["BR", "MX", "AR", "AE", "UA", "BG"]) {
      expect((await check(nat, "US", "visit")).visa_required, nat).toBe(true);
    }
    const ca = await check("CA", "US", "visit");
    expect(ca.visa_required).toBe(false);
    expect(ca.permit_type).toBe("none");
  });

  it("Canada visits follow the canada.ca eTA list; US citizens need no eTA", async () => {
    const se = await check("SE", "CA", "visit");
    expect(se.visa_required).toBe(false);
    expect(se.permit_type).toBe("eta_waiver");
    expect((await check("US", "CA", "visit")).permit_type).toBe("none");
    expect((await check("IN", "CA", "visit")).visa_required).toBe(true);
  });
});
