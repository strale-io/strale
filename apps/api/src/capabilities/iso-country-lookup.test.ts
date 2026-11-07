import { describe, expect, it } from "vitest";
import "./iso-country-lookup.js";
import { getExecutor } from "./index.js";
import { COUNTRIES, COUNTRIES_AS_OF } from "./lib/iso-3166.js";

// Pins the membership flags and currencies re-verified on 2026-11-06 (see the
// source note in lib/iso-3166.ts). When an accession or currency change takes
// effect, update the table, COUNTRIES_AS_OF and this test together.

type Match = { alpha_2: string; currency_code: string; currency_name: string; eu_member: boolean; schengen: boolean; eurozone: boolean };

async function country(query: string): Promise<Match> {
  const fn = getExecutor("iso-country-lookup")!;
  const res = (await fn({ query })) as { output: { match: Match } };
  return res.output.match;
}

const codes = (pred: (c: (typeof COUNTRIES)[number]) => boolean) =>
  COUNTRIES.filter(pred).map((c) => c.alpha_2).sort();

describe("iso-country-lookup membership and currency (as of 2026-11-06)", () => {
  it("carries the verification date", () => {
    expect(COUNTRIES_AS_OF).toBe("2026-11-06");
  });

  it("Bulgaria is in Schengen and the euro area, priced in euro", async () => {
    const bg = await country("BG");
    expect(bg).toMatchObject({ schengen: true, eurozone: true, currency_code: "EUR", currency_name: "Euro" });
  });

  it("Romania is in Schengen but not the euro area", async () => {
    const ro = await country("RO");
    expect(ro).toMatchObject({ schengen: true, eurozone: false, currency_code: "RON" });
  });

  it("Zimbabwe's currency code is ZWG", async () => {
    expect((await country("ZW")).currency_code).toBe("ZWG");
  });

  it("the EU has 27 members", () => {
    expect(codes((c) => c.eu_member)).toHaveLength(27);
  });

  it("Schengen is 25 EU members plus IS, LI, NO and CH; not CY or IE", () => {
    const schengen = codes((c) => c.schengen);
    expect(schengen).toHaveLength(29);
    expect(codes((c) => c.schengen && !c.eu_member)).toEqual(["CH", "IS", "LI", "NO"]);
    expect(codes((c) => c.eu_member && !c.schengen)).toEqual(["CY", "IE"]);
  });

  it("the euro area has 21 members, all priced in EUR", () => {
    const euro = COUNTRIES.filter((c) => c.eurozone);
    expect(euro).toHaveLength(21);
    for (const c of euro) {
      expect(c.eu_member, c.alpha_2).toBe(true);
      expect(c.currency_code, c.alpha_2).toBe("EUR");
    }
  });
});
