/**
 * The sources sanctions-check and pep-check disclose in their lists_queried
 * evidence must be ones the publisher's catalogue states (checked 2026-11-07;
 * see the header of dilisense-sources.ts). A disclosure that names a list we
 * cannot show is screened overstates a compliance check.
 */
import { describe, expect, it } from "vitest";
import {
  DILISENSE_PEP_LISTS_QUERIED,
  DILISENSE_SANCTIONS_LISTS_QUERIED,
  DILISENSE_SOURCES_AS_OF,
} from "./dilisense-sources.js";

describe("Dilisense source disclosure (as of 2026-11-07)", () => {
  it("carries the date it was checked", () => {
    expect(DILISENSE_SOURCES_AS_OF).toBe("2026-11-07");
  });

  it("does not claim the paid per-client debarment lists or OFSI's retired list", () => {
    const named = DILISENSE_SANCTIONS_LISTS_QUERIED.major_lists.join(" | ");
    for (const absent of ["World Bank", "EBRD", "Asian Development Bank", "African Development Bank", "Inter-American", "OFSI — Financial Sanctions"]) {
      expect(named, absent).not.toContain(absent);
    }
  });

  it("counts the lists the catalogue marks included", () => {
    expect(DILISENSE_SANCTIONS_LISTS_QUERIED.source_count).toBe(120);
    expect(DILISENSE_SANCTIONS_LISTS_QUERIED.freshness_note).toMatch(/120 sanctions/);
    expect(DILISENSE_SANCTIONS_LISTS_QUERIED.freshness_note).toMatch(/every 60 minutes/);
  });

  it("keeps the core lists the catalogue includes", () => {
    const named = DILISENSE_SANCTIONS_LISTS_QUERIED.major_lists;
    for (const core of ["OFAC — Specially Designated Nationals (SDN)", "UN Security Council — Consolidated List", "UK Government — Sanctions List", "SECO — Switzerland Sanctions"]) {
      expect(named).toContain(core);
    }
  });

  it("PEP disclosure names no source the publisher does not state", () => {
    const named = DILISENSE_PEP_LISTS_QUERIED.major_lists.join(" | ");
    expect(named).not.toContain("Wikidata");
    expect(named).not.toContain("Bundestag");
    expect(named).toContain("Relatives and close associates");
    expect(DILISENSE_PEP_LISTS_QUERIED.freshness_note).toMatch(/daily updates/);
    expect(DILISENSE_PEP_LISTS_QUERIED.freshness_note).not.toMatch(/multiple times daily/);
  });
});
