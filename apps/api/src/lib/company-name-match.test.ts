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
import {
  normalizeCompanyName,
  classifyNameMatch,
  pickByName,
  assertSingleResultMatch,
} from "./company-name-match.js";

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

// Shared generic scoring-and-refuse primitive used by officer-search.ts and
// uk-filing-events.ts (both Companies House name-search callers, 2026-08-14
// same wrong-company class as #161). Candidates are plain objects here; the
// callers themselves supply getName/getId accessors for their own shapes.
describe("pickByName", () => {
  type Candidate = { title: string; number: string };
  const byTitle = (c: Candidate) => c.title;
  const byNumber = (c: Candidate) => c.number;
  const opts = { subjectLabel: "UK Companies House", disambiguationHint: "Provide the Companies House number (8 digits) to disambiguate." };

  it("resolves an unambiguous exact match", () => {
    const candidates: Candidate[] = [
      { title: "HSBC Holdings plc", number: "00617987" },
      { title: "Totally Unrelated Ltd", number: "99999999" },
    ];
    const r = pickByName("HSBC Holdings plc", candidates, byTitle, byNumber, opts);
    expect(r).toEqual({ id: "00617987", matchedName: "HSBC Holdings plc", matchConfidence: "exact" });
  });

  it("refuses when two distinct entities tie at the same confidence", () => {
    const candidates: Candidate[] = [
      { title: "Acme Consulting Ltd", number: "11111111" },
      { title: "Acme Consulting Ltd", number: "22222222" },
    ];
    expect(() => pickByName("Acme Consulting", candidates, byTitle, byNumber, opts)).toThrow(
      /Ambiguous UK Companies House name "Acme Consulting": 2 distinct/,
    );
  });

  it("a duplicate listing of the SAME id is not a tie", () => {
    const candidates: Candidate[] = [
      { title: "HSBC Holdings plc", number: "00617987" },
      { title: "HSBC Holdings plc", number: "00617987" },
    ];
    const r = pickByName("HSBC Holdings plc", candidates, byTitle, byNumber, opts);
    expect(r.id).toBe("00617987");
  });

  it("refuses a single-token partial overlap (Stripe-vs-Stripe-Holdings guard)", () => {
    const candidates: Candidate[] = [{ title: "Stripe Financial Holdings Ltd", number: "44444444" }];
    expect(() => pickByName("Stripe", candidates, byTitle, byNumber, opts)).toThrow(
      /No confident UK Companies House match for "Stripe"/,
    );
  });

  it("refuses when nothing in the page matches, naming the closest and the disambiguator", () => {
    const candidates: Candidate[] = [{ title: "Totally Unrelated Ltd", number: "55555555" }];
    expect(() => pickByName("Nokia", candidates, byTitle, byNumber, opts)).toThrow(
      /No confident UK Companies House match for "Nokia".*Totally Unrelated Ltd.*Companies House number \(8 digits\)/s,
    );
  });

  it("accepts a high-confidence multi-token match", () => {
    const candidates: Candidate[] = [{ title: "Novo Nordisk Pharma UK Ltd", number: "66666666" }];
    const r = pickByName("Novo Nordisk Pharma", candidates, byTitle, byNumber, opts);
    expect(r.matchConfidence).toBe("high");
    expect(r.id).toBe("66666666");
  });

  it("skips candidates missing a name or id rather than throwing", () => {
    const candidates: Candidate[] = [
      { title: "", number: "77777777" },
      { title: "HSBC Holdings plc", number: "00617987" },
    ];
    const r = pickByName("HSBC Holdings plc", candidates, byTitle, byNumber, opts);
    expect(r.id).toBe("00617987");
  });
});

describe("assertSingleResultMatch", () => {
  // Shared by danish-company-data.ts and canadian-company-data.ts, whose
  // upstream searches each return a single best-guess result rather than a
  // ranked candidate pool — there's nothing to bucket, but the returned name
  // still has to be checked against what was asked before it's trusted.
  const dkOpts = {
    jurisdictionLabel: "Danish",
    sourceDescription: "cvrapi.dk",
    extraClause: " with no ranked alternatives to fall back on",
    disambiguationHint: "Provide the CVR number (8 digits) for an exact lookup.",
  };
  const caOpts = {
    jurisdictionLabel: "Canadian",
    sourceDescription: "The Corporations Canada site search",
    disambiguationHint:
      "Provide the corporation number (older corporations have fewer than 7 digits) or the 9-digit business number for an exact lookup.",
  };

  it("returns the confidence band on a genuine match", () => {
    expect(assertSingleResultMatch("Novo Nordisk", "NOVO NORDISK A/S", dkOpts)).toBe("exact");
  });

  it("refuses a low-confidence single result, naming it and the extra clause (Danish shape)", () => {
    // Live-verified 2026-08-13: cvrapi.dk's search=Consulting resolves to an
    // arbitrary single hit ("Redmark Consulting ApS") with zero relevance
    // signal — the #161 wrong-company class with no candidate pool to score.
    expect(() => assertSingleResultMatch("Consulting", "Redmark Consulting ApS", dkOpts)).toThrow(
      'No confident Danish registry match for "Consulting". cvrapi.dk returned an unrelated entity ' +
        '("Redmark Consulting ApS") with no ranked alternatives to fall back on. ' +
        "Provide the CVR number (8 digits) for an exact lookup.",
    );
  });

  it("refuses a low-confidence single result without the extra clause (Canadian shape)", () => {
    expect(() => assertSingleResultMatch("Shopify Inc", "Unrelated Holdings Ltd", caOpts)).toThrow(
      'No confident Canadian registry match for "Shopify Inc". The Corporations Canada site search ' +
        'returned an unrelated entity ("Unrelated Holdings Ltd"). ' +
        "Provide the corporation number (older corporations have fewer than 7 digits) or the 9-digit business number for an exact lookup.",
    );
  });

  it("refuses cleanly when nothing was extracted at all (empty/null returned name)", () => {
    // Live-verified 2026-08-13: the Canadian Browserless extraction can come
    // back with company_name: null (e.g. the rendered page was the search
    // form, not results) — must refuse, not throw on string ops or emit a
    // dangling '("null")'.
    expect(() => assertSingleResultMatch("Abbotsford Chamber of Commerce", "", caOpts)).toThrow(
      /No confident Canadian registry match for "Abbotsford Chamber of Commerce"\. The Corporations Canada site search returned an unrelated entity\. Provide/,
    );
    let nullCaseMessage = "";
    try {
      assertSingleResultMatch("Abbotsford Chamber of Commerce", null, caOpts);
    } catch (err) {
      nullCaseMessage = err instanceof Error ? err.message : String(err);
    }
    expect(nullCaseMessage).not.toContain("null");
  });
});
