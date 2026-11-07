import { describe, expect, it } from "vitest";
import { EU_AI_ACT_AS_OF } from "./eu-ai-act-classify.js";
import { getExecutor } from "./index.js";

// Pins the application dates to Regulation (EU) 2024/1689 as amended by
// Regulation (EU) 2026/1744 (Digital Omnibus on AI; see the source note in
// eu-ai-act-classify.ts). Update with the next amending act.

interface Classification {
  risk_level: string;
  applicable_articles: string[];
  obligations: string[];
  timeline: string;
  classification_reason: string;
}

async function classify(description: string): Promise<Classification> {
  const fn = getExecutor("eu-ai-act-classify")!;
  const res = (await fn({ description })) as { output: Classification };
  return res.output;
}

describe("eu-ai-act-classify dates (as of 2026-11-06)", () => {
  it("carries the check date", () => {
    expect(EU_AI_ACT_AS_OF).toBe("2026-11-06");
  });

  it("Annex III high-risk obligations apply from 2 December 2027, not 2 August 2026", async () => {
    for (const d of [
      "AI for cv screening of job applicants",
      "credit scoring model for consumer loans",
      "biometric access control",
      "student assessment tool",
    ]) {
      const out = await classify(d);
      expect(out.risk_level, d).toBe("high");
      expect(out.timeline, d).toContain("2 December 2027");
      expect(out.timeline, d).not.toContain("2 August 2026");
    }
  });

  it("prohibitions keep 2 February 2025", async () => {
    const out = await classify("a social scoring platform for citizens");
    expect(out.risk_level).toBe("unacceptable");
    expect(out.timeline).toBe("Prohibited from 2 February 2025");
  });

  it("social scoring cites Article 5(1)(c) only, without a public-authority limit", async () => {
    const out = await classify("a social scoring platform");
    expect(out.applicable_articles).toEqual(["Article 5(1)(c)"]);
    expect(out.classification_reason).toBe("Matches prohibited AI practice: Social scoring");
  });

  it("Article 50 transparency obligations keep 2 August 2026", async () => {
    const out = await classify("customer service bot for a webshop");
    expect(out.risk_level).toBe("limited");
    expect(out.timeline).toBe("Transparency obligations apply from 2 August 2026");
  });

  it("minimal risk does not claim the Act imposes no obligations at all (Article 4 applies to all)", async () => {
    const out = await classify("spam filter for email");
    expect(out.risk_level).toBe("minimal");
    expect(out.obligations).not.toContain("No mandatory obligations under the EU AI Act.");
    expect(out.obligations[0]).toBe("No obligations specific to this risk level under the EU AI Act.");
  });
});
