import { describe, expect, it } from "vitest";
import { FATF_BLACK_LIST, FATF_GREY_LIST, FATF_LISTS_AS_OF } from "./aml-risk-score.js";
import { getExecutor } from "./index.js";

// Pins the FATF lists to the 30 October 2026 publication (see the source note
// in aml-risk-score.ts). When FATF publishes after its next plenary, update the
// lists, FATF_LISTS_AS_OF and this test together.

async function score(country_code: string) {
  const fn = getExecutor("aml-risk-score")!;
  const res = (await fn({ entity_name: "Example Holdings", entity_type: "company", country_code })) as {
    output: { jurisdiction_risk: string; risk_factors: { factor: string }[] };
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
});
