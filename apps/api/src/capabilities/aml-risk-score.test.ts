import { describe, expect, it } from "vitest";
import {
  EU_HIGH_RISK,
  EU_HIGH_RISK_AS_OF,
  FATF_BLACK_LIST,
  FATF_COUNTERMEASURES,
  FATF_GREY_LIST,
  FATF_LISTS_AS_OF,
} from "./aml-risk-score.js";
import { getExecutor } from "./index.js";

// Pins the FATF lists to the 30 October 2026 publication (see the source note
// in aml-risk-score.ts). When FATF publishes after its next plenary, update the
// lists, FATF_LISTS_AS_OF and this test together.

async function score(country_code: string) {
  const fn = getExecutor("aml-risk-score")!;
  const res = (await fn({ entity_name: "Example Holdings", entity_type: "company", country_code })) as {
    output: { jurisdiction_risk: string; risk_factors: { factor: string }[]; risk_level: string; recommendation: string };
  };
  return res.output;
}

describe("aml-risk-score FATF lists (as of 2026-10-30)", () => {
  it("carries the publication date", () => {
    expect(FATF_LISTS_AS_OF).toBe("2026-10-30");
  });

  it("the grey list is the 18 jurisdictions after the October 2026 plenary", () => {
    expect([...FATF_GREY_LIST].sort()).toEqual(
      ["AO", "BA", "BO", "CM", "HT", "IQ", "KE", "KW", "LA", "LB", "NP", "PG", "SS", "SY", "VE", "VG", "VN", "YE"],
    );
  });

  it("the call-for-action list is DPRK, Iran and Myanmar", () => {
    expect([...FATF_BLACK_LIST].sort()).toEqual(["IR", "KP", "MM"]);
  });

  it("no jurisdiction is on both lists", () => {
    for (const cc of FATF_BLACK_LIST) expect(FATF_GREY_LIST.has(cc)).toBe(false);
  });

  it("jurisdictions FATF has removed are no longer scored as grey-listed", async () => {
    // Removed October 2026 (BG, CD), June 2025 (HR, ML, TZ), October 2025
    // (BF, MZ, NG, ZA) and earlier (PH, SN).
    for (const cc of ["BG", "CD", "HR", "ML", "TZ", "BF", "MZ", "NG", "ZA", "PH", "SN"]) {
      const out = await score(cc);
      expect(out.risk_factors.map((f) => f.factor), cc).not.toContain("fatf_greylist");
    }
  });

  it("grey-listed and call-for-action jurisdictions score as such", async () => {
    const grey = await score("LB");
    expect(grey.jurisdiction_risk).toBe("high");
    expect(grey.risk_factors.map((f) => f.factor)).toContain("fatf_greylist");
    const black = await score("KP");
    expect(black.jurisdiction_risk).toBe("prohibited");
    expect(black.risk_factors.map((f) => f.factor)).toContain("fatf_blacklist");
  });

  it("only countermeasure jurisdictions are prohibited; Myanmar (enhanced due diligence) is high", async () => {
    expect([...FATF_COUNTERMEASURES].sort()).toEqual(["IR", "KP"]);
    for (const cc of FATF_COUNTERMEASURES) expect(FATF_BLACK_LIST.has(cc)).toBe(true);
    expect((await score("IR")).jurisdiction_risk).toBe("prohibited");
    const mm = await score("MM");
    expect(mm.jurisdiction_risk).toBe("high");
    expect(mm.risk_factors.map((f) => f.factor)).toContain("fatf_blacklist");
  });
});

describe("aml-risk-score EU high-risk list (consolidated 2026-01-29)", () => {
  it("carries the consolidation date", () => {
    expect(EU_HIGH_RISK_AS_OF).toBe("2026-01-29");
  });

  it("is the 26 jurisdictions of the Annex to Delegated Regulation (EU) 2016/1675", () => {
    expect([...EU_HIGH_RISK].sort()).toEqual([
      "AF", "AO", "BO", "CD", "CI", "CM", "DZ", "HT", "IR", "KE", "KP", "LA", "LB",
      "MC", "MM", "NA", "NP", "RU", "SS", "SY", "TT", "VE", "VG", "VN", "VU", "YE",
    ]);
  });

  it("jurisdictions the EU removed are no longer scored as EU high-risk", async () => {
    // Removed by (EU) 2025/1184: BB, GI, JM, PA, UG (also PH, SN, AE); by
    // 2026/83: BF, ML, MZ, NG, ZA, TZ. Earlier entries in the old list (BS,
    // BW, KH, GH, MU, NI, PK, ZW) are not on the current Annex either.
    for (const cc of ["BB", "GI", "JM", "PA", "UG", "BS", "BW", "KH", "GH", "MU", "NI", "PK", "ZW"]) {
      const out = await score(cc);
      expect(out.risk_factors.map((f) => f.factor), cc).not.toContain("eu_high_risk");
    }
  });

  it("an EU-only listing (not on a FATF list) scores as EU high-risk and elevated", async () => {
    for (const cc of ["RU", "DZ", "NA", "TT", "VU", "AF"]) {
      expect(FATF_GREY_LIST.has(cc) || FATF_BLACK_LIST.has(cc), cc).toBe(false);
      const out = await score(cc);
      expect(out.risk_factors.map((f) => f.factor), cc).toContain("eu_high_risk");
      expect(out.jurisdiction_risk, cc).toBe("elevated");
    }
  });
});

describe("aml-risk-score due-diligence floor for listed countries", () => {
  it("an EU-listed country with no other factor gets EDD, not 'SDD sufficient'", async () => {
    for (const cc of ["RU", "DZ", "NA"]) {
      const out = await score(cc);
      expect(out.risk_level, cc).toBe("low");
      expect(out.recommendation, cc).toMatch(/^Enhanced Due Diligence \(EDD\) required/);
      expect(out.recommendation, cc).toContain("Art. 18a");
      expect(out.recommendation, cc).not.toMatch(/SDD/);
    }
  });

  it("Myanmar (FATF call for action, enhanced due diligence) gets EDD", async () => {
    const out = await score("MM");
    expect(out.risk_level).toBe("medium");
    expect(out.recommendation).toMatch(/^Enhanced Due Diligence \(EDD\) required/);
    expect(out.recommendation).toContain("FATF call for action");
  });

  it("a grey-listed country not on the EU list keeps the score-based recommendation", async () => {
    // Kuwait: FATF increased monitoring, not on the EU Annex of 2026-01-29.
    expect(EU_HIGH_RISK.has("KW")).toBe(false);
    const out = await score("KW");
    expect(out.recommendation).toMatch(/^Standard Due Diligence/);
  });

  it("an unlisted country keeps 'SDD sufficient'", async () => {
    const out = await score("SE");
    expect(out.risk_level).toBe("low");
    expect(out.recommendation).toBe("Standard Due Diligence (SDD) sufficient. Review per normal schedule.");
  });
});
