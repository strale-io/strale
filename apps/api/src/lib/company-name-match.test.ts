/**
 * Regression tests for company-name matching.
 *
 * These primitives gate every registry name lookup. Before them, each registry
 * took the first result from a fuzzy search and returned it as fact:
 *
 *   Finland  "Nokia"       -> Fysios Mehiläinen Oy   (PRH orders by business ID)
 *   Norway   "Telenor"     -> NITO TELENOR           (Brreg orders alphabetically)
 *   Norway   "Norsk Hydro" -> NORSK HYDROGENBILFORENING
 *
 * A wrong legal entity from a KYB lookup is undetectable by the caller, which
 * makes it worse than an error. Two properties must hold together, and pulling
 * on either one alone breaks the other:
 *
 *   1. Real single-token queries must RESOLVE. Every genuine customer query in
 *      the 90 days to 2026-08-09 was one bare token — LEGO, Maersk, Nokia,
 *      Telenor — while registries return the full legal name. That only works
 *      if local legal forms (ASA, Oyj, AB, GmbH...) are stripped first.
 *   2. Unrelated entities sharing a token must be REFUSED, which is the whole
 *      point of rating a single shared token as `low`.
 */

import { describe, it, expect } from "vitest";
import { normalizeCompanyName, classifyNameMatch } from "./company-name-match.js";

describe("normalizeCompanyName", () => {
  it("strips English corporate suffixes", () => {
    expect(normalizeCompanyName("Apple Inc.")).toBe("apple");
    expect(normalizeCompanyName("Acme Corporation")).toBe("acme");
    expect(normalizeCompanyName("Barclays PLC")).toBe("barclays");
  });

  it("strips Nordic and continental legal forms", () => {
    expect(normalizeCompanyName("TELENOR ASA")).toBe("telenor");
    expect(normalizeCompanyName("Nokia Oyj")).toBe("nokia");
    expect(normalizeCompanyName("Volvo AB")).toBe("volvo");
    expect(normalizeCompanyName("SAP AG")).toBe("sap");
    expect(normalizeCompanyName("Siemens GmbH")).toBe("siemens");
    expect(normalizeCompanyName("Heineken NV")).toBe("heineken");
  });

  it("does NOT strip a bare 'as' — it is an ordinary English word", () => {
    // Stripping it would corrupt unrelated names, so "AS" is deliberately
    // absent from the suffix list.
    expect(normalizeCompanyName("Clear As Day")).toContain("as");
  });

  it("is punctuation- and case-insensitive", () => {
    expect(normalizeCompanyName("A/S  Dampskibsselskabet")).toBe(
      normalizeCompanyName("a s dampskibsselskabet"),
    );
  });
});

describe("classifyNameMatch — must resolve real single-token queries", () => {
  const resolves: Array<[string, string]> = [
    ["Telenor", "TELENOR ASA"],
    ["Equinor", "EQUINOR ASA"],
    ["Nokia", "Nokia Oyj"],
    ["Kone", "Kone Oyj"],
    ["Maersk", "Maersk"],
    ["Apple", "Apple Inc."],
  ];
  for (const [query, registryName] of resolves) {
    it(`"${query}" matches "${registryName}"`, () => {
      const { match_confidence } = classifyNameMatch(query, registryName);
      expect(match_confidence).toBe("exact");
    });
  }

  it('"Norsk Hydro" matches "Norsk Hydro ASA"', () => {
    expect(classifyNameMatch("Norsk Hydro", "Norsk Hydro ASA").match_confidence).toBe("exact");
  });
});

describe("classifyNameMatch — must refuse the wrong entities", () => {
  // Every case below is a real first-result a registry returned before the fix.
  const refuses: Array<[string, string, string]> = [
    ["Nokia", "Fysios Mehiläinen Oy", "PRH returned this for Nokia"],
    ["Nokia", "Nokian Vuokrakodit Oy", "different company, similar prefix"],
    ["Telenor", "NITO TELENOR", "union chapter, not the operator"],
    ["Telenor", "TEKNA TELENOR", "union chapter"],
    ["Norsk Hydro", "NORSK HYDROGENBILFORENING", "hydrogen-car association"],
    ["Statoil", "NEGOTIA STATOIL", "union chapter"],
    ["Stripe", "Stripe Financial Holdings", "single shared token, different entity"],
  ];
  for (const [query, wrong, why] of refuses) {
    it(`"${query}" does NOT confidently match "${wrong}" (${why})`, () => {
      const { match_confidence, is_exact_match } = classifyNameMatch(query, wrong);
      expect(is_exact_match).toBe(false);
      expect(match_confidence).toBe("low");
    });
  }
});

describe("classifyNameMatch — edge cases", () => {
  it("rates a genuine multi-token overlap as high", () => {
    expect(classifyNameMatch("Novo Nordisk Pharma", "Novo Nordisk").match_confidence).toBe("high");
  });

  it("returns low for empty input on either side", () => {
    expect(classifyNameMatch("", "Nokia Oyj").match_confidence).toBe("low");
    expect(classifyNameMatch("Nokia", "").match_confidence).toBe("low");
  });

  it("returns low when a name is nothing but a legal form", () => {
    // Normalises to "" on one side — must not be treated as an exact match.
    expect(classifyNameMatch("Oyj", "ASA").match_confidence).toBe("low");
  });
});

describe("normalizeCompanyName — diacritics and punctuated legal forms", () => {
  // Registries return the native spelling; callers type ASCII. Without folding,
  // "Nestle" vs "Nestlé S.A." scores as a non-match and a valid query is refused.
  const folds: Array<[string, string]> = [
    ["Nestlé S.A.", "nestle"],
    ["Ørsted A/S", "orsted"],
    ["Mehiläinen Oy", "mehilainen"],
    ["Ålandsbanken Abp", "alandsbanken"],
    ["Heineken N.V.", "heineken"],
    ["Société Générale", "societe generale"],
  ];
  for (const [input, expected] of folds) {
    it(`"${input}" -> "${expected}"`, () => {
      expect(normalizeCompanyName(input)).toBe(expected);
    });
  }

  it("keeps a single-letter name rather than normalising it away", () => {
    // The stray-letter cleanup only fires when a longer token survives, so a
    // company genuinely named one character does not become "".
    expect(normalizeCompanyName("X")).toBe("x");
  });

  it("keeps an alphanumeric short name", () => {
    expect(normalizeCompanyName("3M Company")).toBe("3m");
  });
});

describe("classifyNameMatch — ASCII query against native spelling", () => {
  const resolves: Array<[string, string]> = [
    ["Nestle", "Nestlé S.A."],
    ["Orsted", "Ørsted A/S"],
    ["Mehilainen", "Mehiläinen Oy"],
  ];
  for (const [query, registryName] of resolves) {
    it(`"${query}" matches "${registryName}"`, () => {
      expect(classifyNameMatch(query, registryName).match_confidence).toBe("exact");
    });
  }

  it("folding does not make unrelated entities match", () => {
    // Guard against over-folding: these must still be refused.
    expect(classifyNameMatch("Nokia", "Fysios Mehiläinen Oy").match_confidence).toBe("low");
    expect(classifyNameMatch("Norsk Hydro", "NORSK HYDROGENBILFORENING").match_confidence).toBe("low");
  });
});

describe("normalizeCompanyName — German legal forms (P1 2026-08-12)", () => {
  it("strips German forms so bare queries match full legal names", () => {
    expect(classifyNameMatch("SAP", "SAP SE").match_confidence).toBe("exact");
    expect(classifyNameMatch("RATIONAL Aktiengesellschaft", "RATIONAL Aktiengesellschaft").match_confidence).toBe("exact");
  });

  it("a name made entirely of suffix-list tokens must not normalize to empty", () => {
    // A company literally named "SE" (or any all-suffix-token name) must not
    // normalize to "" — an empty side classifies `low` forever, making the
    // company unresolvable on every registry. Fallback keeps the raw form.
    expect(normalizeCompanyName("SE")).toBe("se");
  });

  it("sibling German entities must NOT collapse into a false exact match", () => {
    // "Muster GmbH" and "Muster GmbH & Co. KG" are two distinct legal
    // registrations. Review caught that stripping "kg" made them normalize
    // identically → exact → silent wrong-company. They must stay ambiguous.
    expect(classifyNameMatch("Muster GmbH", "Muster GmbH & Co. KG").match_confidence).toBe("low");
    // Bare "ev" must not be stripped: real names begin with it.
    expect(classifyNameMatch("Metals Group", "EV Metals Group").match_confidence).not.toBe("exact");
    // But the punctuated e.V. still normalizes away via the single-letter drop.
    expect(normalizeCompanyName("Musikverein e.V.")).toBe("musikverein");
  });

  it("leading suffix-shaped tokens in real names survive comparison", () => {
    // "kg" is not stripped, so both sides keep it and still match exactly.
    expect(classifyNameMatch("KG Knutsson", "KG Knutsson AB").match_confidence).toBe("exact");
    // Fresenius-style SE & Co. KGaA: se/kgaa/co strip, kg is not present.
    expect(classifyNameMatch("Fresenius", "Fresenius SE & Co. KGaA").match_confidence).not.toBe("low");
  });
});
