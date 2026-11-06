import { describe, expect, it } from "vitest";
import { TAX_DATA_AS_OF } from "./country-tax-rates.js";
import { getExecutor } from "./index.js";

// Pins the values re-verified on 2026-11-06 (see the source note in
// country-tax-rates.ts). When a rate changes, update TAX_DATA,
// TAX_DATA_AS_OF and this test together.

type Out = {
  corporate_tax_rate: number;
  vat_standard_rate: number;
  vat_reduced_rates: number[];
  withholding_tax: { dividend: number; interest: number; royalty: number };
  social_security: { employer: number; employee: number };
  currency: string;
};

async function rates(country_code: string): Promise<Out> {
  const fn = getExecutor("country-tax-rates")!;
  const res = (await fn({ country_code })) as { output: Out };
  return res.output;
}

describe("country-tax-rates (as of 2026-11-06)", () => {
  it("carries the verification date", () => {
    expect(TAX_DATA_AS_OF).toBe("2026-11-06");
  });

  it("Estonia: VAT 24% / 13% / 9%, corporate 22%", async () => {
    const o = await rates("EE");
    expect(o.vat_standard_rate).toBe(24);
    expect(o.vat_reduced_rates).toEqual([13, 9]);
    expect(o.corporate_tax_rate).toBe(22);
  });

  it("Lithuania: corporate 17% from 2026, VAT reduced 12% / 5%", async () => {
    const o = await rates("LT");
    expect(o.corporate_tax_rate).toBe(17);
    expect(o.vat_reduced_rates).toEqual([12, 5]);
  });

  it("Romania: VAT 21% / 11%, dividend tax 16%", async () => {
    const o = await rates("RO");
    expect(o.vat_standard_rate).toBe(21);
    expect(o.vat_reduced_rates).toEqual([11]);
    expect(o.withholding_tax.dividend).toBe(16);
  });

  it("Finland and Slovakia reduced VAT rates", async () => {
    expect((await rates("FI")).vat_reduced_rates).toEqual([13.5, 10]);
    expect((await rates("SK")).vat_reduced_rates).toEqual([19, 5]);
  });

  it("corporate rates corrected against TEDB", async () => {
    const cases: [string, number][] = [
      ["CY", 15],
      ["IE", 12.5],
      ["PT", 19],
      ["LU", 23.87],
      ["DE", 30.13],
    ];
    for (const [cc, want] of cases) {
      expect((await rates(cc)).corporate_tax_rate, cc).toBe(want);
    }
  });

  it("Bulgaria reports the euro", async () => {
    expect((await rates("BG")).currency).toBe("EUR");
  });

  it("UK employer National Insurance is 15% (2026-27)", async () => {
    expect((await rates("GB")).social_security.employer).toBe(15);
  });
});
