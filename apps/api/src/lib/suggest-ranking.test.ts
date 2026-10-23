/**
 * Regression tests for the 2026-08-14 /v1/suggest solutions-only defect.
 *
 * `/v1/suggest` returned a bundled solution for every query and never a
 * capability. Production evidence at the time:
 *
 *   "validate an IBAN"                  -> solution:payment-validate
 *   "find company contact info"         -> solution:kyc-sweden
 *   "check if an email address is valid" -> solution:lead-email-verify
 *   "look up a Swedish company"         -> solution:verify-us-company  (a US
 *                                          solution for a Swedish query)
 *
 * Cause: solutions received an unconditional +3 ranking bonus while raw token
 * scores top out around 3. The bonus was therefore larger than the evidence it
 * was added to, so a solution matching one word outranked a capability matching
 * the whole query. The bonus is now withheld when a capability wins on raw
 * merit.
 *
 * These tests fail against the unconditional bonus and pass against the
 * conditional one.
 */

import { describe, it, expect } from "vitest";
import {
  applyConditionalSolutionBonus,
  isSlugFamilyMatch,
  scoreKeywordMatch,
  parseTypeaheadQuery,
  scoreTypeaheadItem,
  type KeywordScorable,
} from "./suggest.js";
import { tokenize } from "./tokenize.js";

type Row = { item: { type: "solution" | "capability"; slug: string }; score: number };

const row = (type: "solution" | "capability", slug: string, score: number): Row => ({
  item: { type, slug },
  score,
});

/** Rank after the bonus, highest first — what the caller ultimately sees. */
function winner(rows: Row[]): string {
  applyConditionalSolutionBonus(rows);
  return [...rows].sort((a, b) => b.score - a.score)[0].item.slug;
}

describe("conditional solutions bonus", () => {
  it("lets a capability that outscores every solution win (the reported defect)", () => {
    // "validate an IBAN": the capability matches both query words, the
    // solution only one. Under the old +3 the solution won anyway.
    const rows = [row("capability", "iban-validate", 4), row("solution", "payment-validate", 2)];
    expect(winner(rows)).toBe("iban-validate");
  });

  it("does not add the bonus at all when a capability leads", () => {
    const rows = [row("capability", "iban-validate", 4), row("solution", "payment-validate", 2)];
    applyConditionalSolutionBonus(rows);
    expect(rows.find((r) => r.item.slug === "payment-validate")!.score).toBe(2);
  });

  it("still prefers the solution for workflow-shaped queries", () => {
    // "onboard a new supplier with full compliance checks": the bundle matches
    // more of the query than any single step of it does.
    const rows = [row("solution", "vendor-onboard", 4), row("capability", "vat-validate", 2)];
    expect(winner(rows)).toBe("vendor-onboard");
  });

  it("breaks an exact tie in favour of the solution", () => {
    // Deliberate: an ambiguous query should surface the bundle, which lists its
    // steps, rather than one arbitrary step of it.
    const rows = [row("capability", "sanctions-check", 3), row("solution", "kyc-sweden", 3)];
    expect(winner(rows)).toBe("kyc-sweden");
  });

  it("applies the bonus to every solution, not just the top one", () => {
    const rows = [row("solution", "a", 3), row("solution", "b", 2), row("capability", "c", 1)];
    applyConditionalSolutionBonus(rows);
    expect(rows.map((r) => r.score)).toEqual([6, 5, 1]);
  });

  it("handles a field with no solutions", () => {
    const rows = [row("capability", "dns-lookup", 3)];
    expect(() => applyConditionalSolutionBonus(rows)).not.toThrow();
    expect(rows[0].score).toBe(3);
  });

  it("handles a field with no capabilities", () => {
    const rows = [row("solution", "kyb-essentials-se", 2)];
    applyConditionalSolutionBonus(rows);
    expect(rows[0].score).toBe(5);
  });

  it("handles an empty field", () => {
    const rows: Row[] = [];
    expect(() => applyConditionalSolutionBonus(rows)).not.toThrow();
  });

  it("compares negative scores honestly rather than clamping them to a tie", () => {
    // Both call sites filter to score > 0 today, so this is unreachable from
    // them — but the function is exported, and a reduce seeded at 0 would pull
    // both sides up to 0 here and manufacture a tie, handing the win to the
    // solution when the capability was ahead.
    const rows = [row("capability", "iban-validate", -1), row("solution", "payment-validate", -5)];
    applyConditionalSolutionBonus(rows);
    expect(rows.find((r) => r.item.slug === "payment-validate")!.score).toBe(-5);
  });

  it("accepts a caller-supplied bonus for the semantic path's 0-1 scale", () => {
    const rows = [row("solution", "kyb-essentials-se", 0.62), row("capability", "vat-validate", 0.55)];
    applyConditionalSolutionBonus(rows, 0.03);
    expect(rows[0].score).toBeCloseTo(0.65);
    expect(rows[1].score).toBe(0.55);
  });

  it("withholds the semantic bonus when a capability leads on similarity", () => {
    const rows = [row("capability", "dns-lookup", 0.71), row("solution", "domain-security-check", 0.64)];
    applyConditionalSolutionBonus(rows, 0.03);
    expect(rows[1].score).toBe(0.64);
  });

  it("does not lift a weak solution above a capability that outscored it", () => {
    // The original bug one rank down: with a blanket bonus, the leading
    // solution's win drags every other solution up with it, so a solution that
    // matched one word overtakes a capability that matched two. Visible in the
    // alternatives list and the typeahead dropdown.
    const rows = [
      row("solution", "vendor-onboard", 3),
      row("capability", "vat-validate", 2),
      row("solution", "invoice-process", 1),
    ];
    applyConditionalSolutionBonus(rows);
    const byScore = [...rows].sort((a, b) => b.score - a.score).map((r) => r.item.slug);
    expect(byScore).toEqual(["vendor-onboard", "vat-validate", "invoice-process"]);
    expect(rows[2].score).toBe(1); // untouched — it was already losing on merit
  });
});

describe("keyword item scoring", () => {
  const item = (
    slug: string,
    name: string,
    description: string,
    tokens: string[],
  ): KeywordScorable => ({
    slug,
    name,
    description,
    tokens: new Set(tokens),
    primaryTokens: new Set(tokens),
  });

  const score = (it: KeywordScorable, query: string) =>
    scoreKeywordMatch(it, tokenize(query), []);

  it("reaches a capability through a word stem the token index misses", () => {
    // "check if an email address is valid" tokenizes "valid", never "validate".
    // Before prefix matching, email-validate scored on "email" alone and the
    // query resolved live to eori-validate, an unrelated customs identifier.
    const emailValidate = item(
      "email-validate",
      "Email Validate",
      "Validate an email address for syntax and deliverability.",
      ["email", "validate", "address"],
    );
    const eoriValidate = item(
      "eori-validate",
      "EORI Validate",
      "Validate an EU customs EORI number.",
      ["eori", "validate", "customs"],
    );
    const q = "check if an email address is valid";
    expect(score(emailValidate, q)).toBeGreaterThan(score(eoriValidate, q));
  });

  it("scores an item the query names in full above one sharing a single word", () => {
    const ibanValidate = item("iban-validate", "IBAN Validate", "Validate an IBAN.", [
      "iban",
      "validate",
    ]);
    const paymentValidate = item(
      "payment-validate",
      "Payment Validate",
      "Validate payment details end to end.",
      ["payment", "validate"],
    );
    const q = "validate an iban";
    expect(score(ibanValidate, q)).toBeGreaterThan(score(paymentValidate, q));
  });

  it("awards the identity bonus only when every slug word is named", () => {
    const it1 = item("iban-validate", "IBAN Validate", "Validate an IBAN.", ["iban", "validate"]);
    // "validate" alone must not earn it — that is a partial name, not an identity.
    expect(score(it1, "validate")).toBeLessThan(score(it1, "validate iban"));
  });

  it("gives a single-word slug no identity bonus on top of the exact-slug match", () => {
    // Guard on slugTokens.length > 1. A one-word slug already earns the
    // exact-slug +2, so without the guard it would collect the identity +2 as
    // well and outrank multi-word items on a single common word.
    const solo = item("weather", "Weather", "Current weather.", ["weather"]);
    // 1 token match + 2 exact-slug, and no identity bonus on top.
    expect(score(solo, "weather")).toBe(3);
  });

  it("returns zero for a query sharing nothing with the item", () => {
    const dns = item("dns-lookup", "DNS Lookup", "Query DNS records.", ["dns", "lookup", "records"]);
    expect(score(dns, "sanctions screening")).toBe(0);
  });
});

/**
 * Slug-shaped queries. Website visitors typed "invoice-verify" and
 * "company-data" into the typeahead box in October 2026 and got zero results,
 * although 22 invoice-verify-{cc} solutions and 34 *-company-data capabilities
 * exist. The query was split only on whitespace while the token index splits
 * on hyphens, so a hyphenated word matched no token, no prefix, and no slug
 * unless it was one slug exactly.
 */
describe("slug-family matching", () => {
  const catalogItem = (slug: string, name: string, description: string): KeywordScorable => ({
    slug,
    name,
    description,
    tokens: tokenize(`${name} ${description} ${slug}`),
    primaryTokens: tokenize(`${name} ${slug}`),
  });

  const invoiceVerifySe = catalogItem(
    "invoice-verify-se",
    "Invoice Verify — Sweden",
    "Invoice fraud detection for Swedish suppliers.",
  );
  const belgianCompanyData = catalogItem(
    "belgian-company-data",
    "Belgian Company Data",
    "Look up a Belgian company in the KBO registry.",
  );
  const ukCompanyData = catalogItem(
    "uk-company-data",
    "UK Company Data",
    "Look up a UK company at Companies House.",
  );
  const vatValidate = catalogItem("vat-validate", "VAT Validate", "Validate an EU VAT number.");

  const ibanValidate = catalogItem("iban-validate", "IBAN Validate", "Validate an IBAN and its checksum.");
  const ensResolve = catalogItem("ens-resolve", "ENS Resolve", "Resolve a web3 ENS name to an address.");
  const emailValidate = catalogItem(
    "email-validate",
    "Email Validate",
    "Validate an email address for syntax and deliverability.",
  );
  const annualReport = catalogItem(
    "annual-report-extract",
    "Annual Report Extract",
    "Extract figures from an annual report.",
  );

  const typeaheadScore = (it: KeywordScorable, query: string) =>
    scoreTypeaheadItem(it, parseTypeaheadQuery(query), []).score;
  const keywordScore = (it: KeywordScorable, query: string) =>
    scoreKeywordMatch(
      it,
      tokenize(query),
      [],
      parseTypeaheadQuery(query).hyphenated.map((h) => h.word),
    );

  it("names a family by a hyphenated run of whole slug segments", () => {
    expect(isSlugFamilyMatch("invoice-verify-se", "invoice-verify")).toBe(true);
    expect(isSlugFamilyMatch("belgian-company-data", "company-data")).toBe(true);
    expect(isSlugFamilyMatch("uk-company-data", "company-data")).toBe(true);
    expect(isSlugFamilyMatch("swedish-company-data", "swedish-company-data")).toBe(true);
  });

  it("does not treat partial segments or bare words as a family", () => {
    expect(isSlugFamilyMatch("invoice-verify-se", "voice-ver")).toBe(false);
    expect(isSlugFamilyMatch("invoice-verify-se", "invoice-")).toBe(false);
    expect(isSlugFamilyMatch("vat-validate", "validate")).toBe(false);
    expect(isSlugFamilyMatch("vat-validate", "web3-assurance")).toBe(false);
  });

  it("still matches a one-word slug exactly", () => {
    expect(isSlugFamilyMatch("translate", "translate")).toBe(true);
  });

  it("finds the invoice-verify family from the typed slug", () => {
    expect(typeaheadScore(invoiceVerifySe, "invoice-verify")).toBeGreaterThan(0);
    expect(typeaheadScore(invoiceVerifySe, "invoice-verify")).toBeGreaterThan(
      typeaheadScore(vatValidate, "invoice-verify"),
    );
  });

  it("finds every *-company-data capability from \"company-data\"", () => {
    for (const it of [belgianCompanyData, ukCompanyData]) {
      expect(typeaheadScore(it, "company-data")).toBeGreaterThan(0);
    }
    expect(typeaheadScore(vatValidate, "company-data")).toBe(0);
  });

  it("matches nothing for a slug nobody sells", () => {
    // "web3-assurance" and "eu-company-due-diligence" were typed in October
    // 2026 and name no slug. Scoring their parts independently matched every
    // item mentioning web3, or eu, or company; those are coverage gaps.
    for (const it of [ensResolve, vatValidate, belgianCompanyData, invoiceVerifySe]) {
      expect(typeaheadScore(it, "web3-assurance")).toBe(0);
      expect(typeaheadScore(it, "eu-company-due-diligence")).toBe(0);
    }
  });

  it("keeps an exact hyphenated slug a precise lookup", () => {
    expect(typeaheadScore(vatValidate, "vat-validate")).toBeGreaterThan(0);
    // shares "validate" only: no longer trails the exact hit
    expect(typeaheadScore(ibanValidate, "vat-validate")).toBe(0);
  });

  it("does not let a one-letter part prefix-match everything", () => {
    // "e-mail" used to return nothing; splitting it naively matched every item
    // with a word starting in "e" (174 of them, led by *-extract).
    expect(typeaheadScore(annualReport, "e-mail")).toBe(0);
  });

  it("reaches a joined spelling the catalog uses", () => {
    expect(typeaheadScore(emailValidate, "e-mail")).toBeGreaterThan(0);
  });

  it("still names the family while the slug is half typed", () => {
    expect(typeaheadScore(invoiceVerifySe, "invoice-verify-")).toBe(
      typeaheadScore(invoiceVerifySe, "invoice-verify"),
    );
    expect(typeaheadScore(invoiceVerifySe, "invoice--verify")).toBe(
      typeaheadScore(invoiceVerifySe, "invoice-verify"),
    );
  });

  it("scores a hyphenated query at least as high as the spaced one", () => {
    expect(typeaheadScore(invoiceVerifySe, "invoice-verify")).toBeGreaterThan(
      typeaheadScore(invoiceVerifySe, "invoice verify"),
    );
  });

  it("gives the keyword path the same family bonus, once", () => {
    // belgian-company-data misses the identity bonus ("belgian" is not typed),
    // so before the family match it trailed uk-company-data, whose two long
    // slug words were both named.
    expect(keywordScore(belgianCompanyData, "company-data")).toBe(
      keywordScore(ukCompanyData, "company-data"),
    );
    // Slug hit and identity both mean "names this item": +2, not +4.
    const spaced = scoreKeywordMatch(invoiceVerifySe, tokenize("invoice verify"), []);
    expect(keywordScore(invoiceVerifySe, "invoice-verify")).toBe(spaced);
  });
});
