import { describe, expect, it } from "vitest";
import {
  findRegistryNumber,
  parseNameSearchResults,
  pickByName,
  buildNameSearchBody,
  type CaNameCandidate,
} from "./canadian-company-data.js";
import { SHOPIFY_RESULTS_HTML } from "./__fixtures__/canadian-shopify-search-results.js";

// Registry-number detection for the Corporations Canada JSON API migration:
// corp IDs are NOT fixed-width (corp 1007 is real), 9 digits = business
// number, and short digit runs inside free text stay ambiguous.
describe("canadian findRegistryNumber", () => {
  it("accepts modern 7-digit corporation numbers", () => {
    expect(findRegistryNumber("3000061")).toBe("3000061");
  });

  it("accepts legacy short corporation numbers", () => {
    expect(findRegistryNumber("1007")).toBe("1007");
  });

  it("accepts 9-digit business numbers, with separators stripped", () => {
    expect(findRegistryNumber("106 679 285")).toBe("106679285");
  });

  it("extracts a 7-9 digit number embedded in free text", () => {
    expect(findRegistryNumber("look up corp 3000061 for me")).toBe("3000061");
  });

  it("does NOT extract short digit runs from free text (too ambiguous)", () => {
    expect(findRegistryNumber("founded in 2024 in Toronto")).toBeNull();
  });

  it("does not truncate longer digit runs into a wrong ID", () => {
    // The old /\d{7}/ rule matched the first 7 digits of a 10-digit run and
    // looked up an unrelated corporation.
    expect(findRegistryNumber("id 1234567890")).toBeNull();
  });

  it("returns null for pure names", () => {
    expect(findRegistryNumber("Abbotsford Chamber of Commerce")).toBeNull();
  });
});

// buildNameSearchBody: regression coverage for the #224 follow-up fix. The
// pre-fix code sent V_SEARCH.* query-string params to a GET, which the real
// controller ignores entirely (it always renders the empty search form).
// The real form at fdrlCrpSrch.html is a POST with this exact field set —
// verified live 2026-08-14 (see canadian-company-data.ts header comment).
describe("canadian buildNameSearchBody", () => {
  it("sets corpName to the query and every other visible/hidden field to empty", () => {
    const body = buildNameSearchBody("Shopify");
    expect(body.get("corpName")).toBe("Shopify");
    expect(body.get("corpNumber")).toBe("");
    expect(body.get("busNumber")).toBe("");
    expect(body.get("corpAct")).toBe("");
    expect(body.get("corpProvince")).toBe("");
    expect(body.get("corpStatus")).toBe("");
    expect(body.get("_page")).toBe("");
    expect(body.get("_pageFlowMap")).toBe("");
  });

  it("sets the submit button field the server controller dispatches on", () => {
    const body = buildNameSearchBody("Shopify");
    expect(body.get("buttonNext")).toBe("Search");
  });

  it("carries exactly the 9 fields the real form submits — no more, no less", () => {
    const body = buildNameSearchBody("Shopify");
    expect([...body.keys()].sort()).toEqual(
      ["_page", "_pageFlowMap", "busNumber", "buttonNext", "corpAct", "corpName", "corpNumber", "corpProvince", "corpStatus"].sort(),
    );
  });
});

// Full "0 results" response marker, captured live 2026-08-14 from a POST
// with corpName=Zzxqqnonexistentcorpname12345.
const NO_RESULTS_HTML = `
<h2 class="panel-title">Search Results</h2>
<section class="panel-body">
    <div class="modal-body well lt-grey">
        <div class="icBgQ padding3">
           Searched for:
            Corporate name: <strong>Zzxqqnonexistentcorpname12345</strong>
        </div>
        <div class="icBgQ padding3">
            <strong>0</strong> results were found, <strong>0</strong> returned.
        </div>
    </div>
    <section class="col-md-12">
        <ol class="list-unstyled">
        </ol>
    </section>
</section>`;

describe("canadian parseNameSearchResults", () => {
  it("extracts corpId, name, and status from real result rows", () => {
    const results = parseNameSearchResults(SHOPIFY_RESULTS_HTML);
    expect(results).toEqual([
      { corpId: "4261607", name: "SHOPIFY INC.", status: "Active" },
      { corpId: "4368525", name: "Shopify Commerce Inc.", status: "Dissolved for non-compliance (s. 212)" },
    ]);
  });

  it("returns an empty array for a genuine zero-results page", () => {
    expect(parseNameSearchResults(NO_RESULTS_HTML)).toEqual([]);
  });

  it("returns an empty array for the bare empty search form (pre-fix GET response shape)", () => {
    // This is what the OLD (broken) GET-based lookupByName always received:
    // the empty search form has no fdrlCrpDtls links at all. Asserting this
    // stays empty documents why the GET path was silently returning nothing.
    expect(parseNameSearchResults("<html><body><form id=\"verticalForm\"></form></body></html>")).toEqual([]);
  });
});

describe("canadian pickByName", () => {
  it("resolves an unambiguous exact match (SHOPIFY vs Shopify Commerce/Quebec/etc.)", () => {
    const candidates: CaNameCandidate[] = [
      { corpId: "4261607", name: "SHOPIFY INC.", status: "Active" },
      { corpId: "4368525", name: "Shopify Commerce Inc.", status: "Dissolved for non-compliance (s. 212)" },
      { corpId: "13480640", name: "Shopify Quebec Inc.", status: "Active" },
    ];
    const r = pickByName("Shopify", candidates);
    expect(r).toEqual({ corpId: "4261607", matchedName: "SHOPIFY INC.", matchConfidence: "exact" });
  });

  it("refuses when two distinct corporations tie at the same confidence", () => {
    // Two DIFFERENT corpIds both named (after normalization) identically to
    // the query — e.g. a dissolved entity re-registered under the same name.
    // Choosing one silently is the #161 wrong-company class; the caller must
    // disambiguate with the corporation number.
    const dup: CaNameCandidate[] = [
      { corpId: "1111111", name: "Acme Widgets Inc.", status: "Active" },
      { corpId: "2222222", name: "Acme Widgets Inc.", status: "Dissolved" },
    ];
    expect(() => pickByName("Acme Widgets", dup)).toThrow(
      /Ambiguous Canadian company name "Acme Widgets": 2 distinct/,
    );
  });

  it("a duplicate listing of the SAME corpId is not a tie", () => {
    const candidates: CaNameCandidate[] = [
      { corpId: "4261607", name: "SHOPIFY INC.", status: "Active" },
      { corpId: "4261607", name: "SHOPIFY INC.", status: "Active" },
    ];
    const r = pickByName("Shopify", candidates);
    expect(r.corpId).toBe("4261607");
  });

  it("refuses a single-token partial overlap (Stripe-vs-Stripe-Holdings guard)", () => {
    const candidates: CaNameCandidate[] = [
      { corpId: "5555555", name: "Stripe Financial Holdings Inc.", status: "Active" },
    ];
    expect(() => pickByName("Stripe", candidates)).toThrow(
      /No confident Canadian federal registry match for "Stripe"/,
    );
  });

  it("refuses when nothing matches, naming the closest candidate and the disambiguation hint", () => {
    const candidates: CaNameCandidate[] = [
      { corpId: "6666666", name: "Totally Unrelated Holdings Inc.", status: "Active" },
    ];
    expect(() => pickByName("Siemens", candidates)).toThrow(
      /No confident Canadian federal registry match for "Siemens".*Totally Unrelated Holdings Inc\..*corporation number/s,
    );
  });

  it("refuses on a genuinely empty candidate list (no results)", () => {
    expect(() => pickByName("Nonexistent Corp Xyz", [])).toThrow(
      /No confident Canadian federal registry match for "Nonexistent Corp Xyz"/,
    );
  });

  it("accepts a high-confidence multi-token match", () => {
    const candidates: CaNameCandidate[] = [
      { corpId: "7165897", name: "Shopify Payments (Canada) Inc.", status: "Active" },
    ];
    const r = pickByName("Shopify Payments", candidates);
    expect(r.matchConfidence).toBe("high");
    expect(r.corpId).toBe("7165897");
  });
});
