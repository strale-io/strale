import { describe, expect, it } from "vitest";
import { pickByName } from "./french-company-data.js";

// Regression coverage for the #161 wrong-company class applied to France:
// recherche-entreprises.api.gouv.fr's /search does its own relevance
// scoring, but the pre-fix code took per_page=1 (results[0]) unconditionally
// regardless of whether that scoring was an identity match.

function candidate(nom_complet: string, siren: string) {
  return { nom_complet, siren };
}

describe("french pickByName", () => {
  it("resolves an unambiguous exact match (a company literally named TOTAL)", () => {
    // Live-verified 2026-08-13: searching "Total" surfaces the small SAS
    // literally named TOTAL (siren 904765369), not any TotalEnergies entity —
    // this IS the correct exact match, not a bug.
    const r = pickByName("Total", [candidate("TOTAL", "904765369"), candidate("OLIVIA DANON", "111111111")]);
    expect(r).toEqual({ company: candidate("TOTAL", "904765369"), matchConfidence: "exact" });
  });

  it("refuses when two distinct entities tie at the same confidence", () => {
    const dup = [candidate("Acme Consulting SAS", "222222222"), candidate("Acme Consulting SAS", "333333333")];
    expect(() => pickByName("Acme Consulting", dup)).toThrow(/Ambiguous French company name "Acme Consulting": 2 distinct/);
  });

  it("a duplicate listing of the SAME siren is not a tie", () => {
    const c = candidate("TOTAL", "904765369");
    const r = pickByName("Total", [c, { ...c }]);
    expect(r.company.siren).toBe("904765369");
  });

  it("refuses a single-token partial overlap (Stripe-vs-Stripe-Holdings guard)", () => {
    expect(() => pickByName("Stripe", [candidate("Stripe Financial Holdings SAS", "444444444")]))
      .toThrow(/No confident French registry match for "Stripe"/);
  });

  it("refuses when nothing in the page matches, naming the closest", () => {
    expect(() => pickByName("Siemens", [candidate("Fysio France SAS", "555555555")]))
      .toThrow(/No confident French registry match for "Siemens".*Fysio France SAS/s);
  });

  it("accepts a high-confidence multi-token match", () => {
    // "Danone Produits Frais" (query) vs "DANONE PRODUITS FRAIS FRANCE
    // (D.P.F.F.)" (registry name) — real candidate observed live 2026-08-13
    // for the query "Danone". 3/4 token overlap after punctuation flattening
    // and single-letter-token drop (D.P.F.F. shatters into stray letters).
    const r = pickByName("Danone Produits Frais", [
      candidate("DANONE PRODUITS FRAIS FRANCE (D.P.F.F.)", "666666666"),
    ]);
    expect(r.matchConfidence).toBe("high");
    expect(r.company.siren).toBe("666666666");
  });
});
