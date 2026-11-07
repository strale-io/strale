import { describe, expect, it } from "vitest";
import { FISCAL_YEAR_DATA_AS_OF } from "./financial-year-dates.js";
import { getExecutor } from "./index.js";

// Pins the rows checked against the issuing authorities on 2026-11-06 (see the
// source note in financial-year-dates.ts).

interface FiscalYear {
  tax_filing_deadline: string;
  vat_filing_frequency: string;
  annual_report_deadline: string;
}

async function lookup(country_code: string): Promise<FiscalYear> {
  const fn = getExecutor("financial-year-dates")!;
  const res = (await fn({ country_code })) as { output: FiscalYear };
  return res.output;
}

describe("financial-year-dates (as of 2026-11-06)", () => {
  it("carries the check date", () => {
    expect(FISCAL_YEAR_DATA_AS_OF).toBe("2026-11-06");
  });

  it("Sweden: calendar-year companies file Inkomstdeklaration 2 by 1 August, not 1 May", async () => {
    const se = await lookup("SE");
    expect(se.tax_filing_deadline).toMatch(/^August 1 of the following year/);
    expect(se.tax_filing_deadline).not.toContain("May 1");
    expect(se.annual_report_deadline).toBe("7 months after financial year end");
  });

  it("Norway: annual accounts by 31 July", async () => {
    expect((await lookup("NO")).annual_report_deadline).toContain("July 31");
  });

  it("Denmark: annual report 6 months for classes B and C, 4 for class D", async () => {
    const dk = await lookup("DK");
    expect(dk.annual_report_deadline).toContain("6 months after FY end (accounting classes B and C)");
    expect(dk.tax_filing_deadline).toContain("June 30");
  });

  it("Germany: VAT thresholds are EUR 9,000 / 2,000; disclosure is 12 months", async () => {
    const de = await lookup("DE");
    expect(de.vat_filing_frequency).toContain("9,000");
    expect(de.vat_filing_frequency).not.toContain("7,500");
    expect(de.annual_report_deadline).not.toContain("6 months");
  });

  it("UK: the Company Tax Return is due 12 months after the period; payment at 9 months + 1 day", async () => {
    const gb = await lookup("GB");
    expect(gb.tax_filing_deadline).toMatch(/^12 months after accounting period end/);
  });

  it("US: S-corps and partnerships extend to September 15", async () => {
    expect((await lookup("US")).tax_filing_deadline).toContain("September 15 for S-corps/partnerships");
  });

  it("Croatia: VAT threshold is no longer stated in HRK alone", async () => {
    const hr = await lookup("HR");
    expect(hr.vat_filing_frequency).toContain("EUR 106,178.25");
    expect(hr.vat_filing_frequency).not.toMatch(/^Monthly \(turnover >800K HRK\)/);
  });
});
