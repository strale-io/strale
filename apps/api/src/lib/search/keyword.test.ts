import { describe, it, expect } from "vitest";
import {
  createKeywordIndex,
  editDistance,
  stem,
  RELEVANCE_RATIO,
  type SearchItem,
} from "./keyword.js";
import { extractCountries, itemCountries } from "./countries.js";
const item = (
  slug: string,
  name: string,
  description = "",
  search_tags: string[] = [],
  geography: string | null = "global"
): SearchItem => ({
  type: "capability",
  slug,
  name,
  description,
  search_tags,
  geography,
  category: "",
});
describe("keyword relevance constraints", () => {
  it("removes question words and stop words", () => {
    expect(
      createKeywordIndex([item("company-data", "Company Data")]).search(
        "how what who which is a the"
      )
    ).toEqual([]);
  });
  it("uses prefix only for the final token and only in name/slug/tags", () => {
    const index = createKeywordIndex([
      item("email-validate", "Email Validation", "Deliverability"),
      item("other", "Other", "Email validation checks"),
      item("tagged", "Tagged", "", ["email"]),
    ]);
    expect(index.search("em").map((r) => r.item.slug)).toEqual(
      expect.arrayContaining(["email-validate", "tagged"])
    );
    expect(index.search("em").some((r) => r.item.slug === "other")).toBe(false);
    expect(index.search("em unknown")).toEqual([]);
    expect(index.search("deli")).toEqual([]);
    expect(index.search("e")).toEqual([]);
  });
  it("does not prefix GDP into GDPR when the catalogue has an exact GDP token", () => {
    const index = createKeywordIndex([
      item("indicators", "Economic Indicators", "GDP and inflation"),
      item("gdpr-audit", "GDPR Audit"),
    ]);
    expect(index.search("gdp").map((r) => r.item.slug)).toEqual(["indicators"]);
  });
  it("weights names/slugs above tags, descriptions and categories", () => {
    const rows = [
      item("exact", "Quantum Processor"),
      item("tagged", "Other", "", ["quantum"]),
      item("description", "Another", "Quantum"),
      { ...item("category", "Another"), category: "quantum" },
    ];
    for (let i = 0; i < rows.length - 1; i++)
      expect(
        createKeywordIndex(rows.slice(i)).search("quantum")[0].item.slug
      ).toBe(rows[i].slug);
  });
  it("matches transpositions and bounds tolerance by token length", () => {
    expect(editDistance("sanctoins", "sanctions", 2)).toBe(1);
    expect(editDistance("adress", "address", 1)).toBe(1);
    const index = createKeywordIndex([
      item("sanctions-check", "Sanctions Check"),
      item("dns-lookup", "DNS Lookup"),
    ]);
    expect(index.search("sanctoins")[0].item.slug).toBe("sanctions-check");
    expect(index.search("dms")).toEqual([]);
  });
  it("stems symmetrically and keeps acronyms intact", () => {
    expect(stem("validation")).toBe(stem("validate"));
    expect(stem("valid")).toBe(stem("validate"));
    expect(stem("tracking")).toBe(stem("track"));
    expect(stem("gdp")).not.toBe(stem("gdpr"));
    for (const [noun, verb] of [["validator", "validate"], ["converter", "convert"], ["extractor", "extract"], ["generator", "generate"], ["parser", "parse"]])
      expect(stem(noun)).toBe(stem(verb));
    expect(createKeywordIndex([item("email-validate", "Email Validation")]).search("email validator")[0].coverage).toBe(1);
  });
  it("demotes another single-country registry even when its lexical score is stronger", () => {
    const index = createKeywordIndex([
      item("swedish-company-data", "Swedish Company Data", "", [], "nordic"),
      item("german-company-data", "German Company Data", "Company", ["company"], "eu"),
    ]);
    const base = index.search("company");
    expect(base[0].item.slug).toBe("german-company-data");
    const swedish = index.search("swedish company");
    expect(swedish[0].item.slug).toBe("swedish-company-data");
    const wrong = swedish.find((r) => r.item.slug === "german-company-data");
    if (wrong) expect(wrong.score).toBeCloseTo(base[0].score * 0.15);
  });
  it("never infers a country by edit distance", () => {
    const index = createKeywordIndex([item("mt-company-data", "Malta Company Data", "", [], "MT")]);
    expect(index.search("malt", { prefix: false })).toEqual([]);
    expect(extractCountries("malt").codes.size).toBe(0);
    expect(index.search("malta")[0].item.slug).toBe("mt-company-data");
  });
  it("recognizes US only with explicit case or country context", () => {
    for (const query of ["contact us", "send us an email", "us"])
      expect([...extractCountries(query).codes]).toEqual([]);
    for (const query of ["US", "us company", "company us", "the us", "united states"])
      expect([...extractCountries(query).codes]).toEqual(["US"]);
    const index = createKeywordIndex([
      item("us-company-data", "US Company Data", "Email contact", [], "US"),
      item("swedish-company-data", "Swedish Company Data", "Email contact", [], "SE"),
    ]);
    const score = (query: string) => index.search(query).map((r) => [r.item.slug, r.score]);
    expect(score("contact us")).toEqual(score("contact"));
    expect(score("send us an email")).toEqual(score("send an email"));
  });
  it("ignores pasted long numbers without diluting coverage or scores", () => {
    const index = createKeywordIndex([item("swedish-company-data", "Swedish Company Data", "", [], "SE")]);
    expect(index.search("orgnr 1234567890")).toEqual(index.search("orgnr"));
    expect(index.search("company 1234567890")).toEqual(index.search("company"));
  });
  it.each([["cvr", "DK"], ["organisationsnummer", "SE"]])("recognizes the explicit registry alias %s", (alias, code) => {
    const index = createKeywordIndex([item("registry-identity", "Company Registry Identity", "", [], code)]);
    expect(index.search(`${alias} lookup`)[0]?.item.slug).toBe("registry-identity");
    expect([...extractCountries(alias).registryCodes]).toEqual([code]);
  });
  it("limits distinct content tokens and typo-eligible tokens independently", () => {
    const index = createKeywordIndex([
      item("gold", "Gold"), item("alpha", "Alpha"), item("bravo", "Bravo"),
      item("charlie", "Charlie"), item("delta", "Delta"), item("echo", "Echo"), item("foxtrot", "Foxtrot"),
    ]);
    const twelve = "alpha bravo charlie delta echo foxtrot one two three four five six";
    expect(index.search(`${twelve} gold`, { prefix: false })).toEqual(index.search(twelve, { prefix: false }));
    const typos = "alpa brav charli delt echox foxtro";
    expect(index.search(`${typos} golx`, { prefix: false }).some((r) => r.item.slug === "gold")).toBe(false);
    expect(index.search("golx", { prefix: false })[0]?.item.slug).toBe("gold");
  });
  it("treats aliases as weaker than a direct hit", () => {
    const index = createKeywordIndex([
      item("fx-feed", "FX Feed"),
      item("exchange-rate", "Exchange Rate"),
      item("aside", "Aside", "Mentions currency"),
    ]);
    const results = index.search("fx");
    expect(results[0].item.slug).toBe("fx-feed");
    expect(results.some((r) => r.item.slug === "exchange-rate")).toBe(true);
  });
  it("does not turn genuine catalogue terms into country typos", () => {
    const index = createKeywordIndex([
      item("cron-explain", "Cron Explain"),
      item("fear-greed-index", "Fear and Greed Index"),
      item("irish-company-data", "Irish Company Data"),
      item("greek-company-data", "Greek Company Data"),
    ]);
    expect(index.search("cron")[0].item.slug).toBe("cron-explain");
    expect(index.search("greed")[0].item.slug).toBe("fear-greed-index");
  });
  it("understands registry phrases, accents, and broad geography labels", () => {
    expect([...extractCountries("Companies House").codes]).toEqual(["UK"]);
    expect([...extractCountries("Brønnøysund").codes]).toEqual(["NO"]);
    expect([
      ...itemCountries(
        item(
          "swedish-company-data",
          "Swedish Company Data",
          "",
          [],
          "nordic"
        ) as SearchItem
      ),
    ]).toEqual(["SE"]);
    const index = createKeywordIndex([
      item("swedish-company-data", "Swedish Company Data", "", [], "nordic"),
      item("german-company-data", "German Company Data", "", [], "eu"),
      item("global-company", "Global Company"),
    ]);
    expect(index.search("swedsih company")[0].item.slug).toBe(
      "swedish-company-data"
    );
    expect(index.search("Bolagsverket")[0].item.slug).toBe(
      "swedish-company-data"
    );
    expect(index.search("company", { geo: "DE" })[0].item.slug).toBe(
      "german-company-data"
    );
  });
  it("keeps regional geography hints and ignores invalid country codes", () => {
    const index = createKeywordIndex([
      item("german-company-data", "German Company Data", "", [], "eu"),
      item("swedish-company-data", "Swedish Company Data", "", [], "nordic"),
      item("global-company-data", "Global Company Data", "", [], "global"),
    ]);
    const base = index.search("company");
    const score = (geo: string, slug: string) =>
      index.search("company", { geo }).find((r) => r.item.slug === slug)!.score;
    const initial = (slug: string) =>
      base.find((r) => r.item.slug === slug)!.score;
    expect(score("eu", "german-company-data")).toBeCloseTo(
      initial("german-company-data") * 1.25
    );
    expect(score("nordic", "swedish-company-data")).toBeCloseTo(
      initial("swedish-company-data") * 1.25
    );
    expect(index.search("company", { geo: "zz" })).toEqual(base);
  });
  it("uses one relevance cutoff consistently for returned rows and total", () => {
    const results = createKeywordIndex([
      item("sanctions-check", "Sanctions Check"),
      item("aside", "Aside", "Sanctions"),
      item("none", "None"),
    ]).search("sanctions-check");
    expect(
      results.every((r) => r.score >= results[0].score * RELEVANCE_RATIO)
    ).toBe(true);
    expect(results.map((r) => r.item.slug)).toEqual(["sanctions-check"]);
  });
});

describe("misspelt country names and trailing us", () => {
  const catalogue = [
    item("norwegian-company-data", "Norwegian Company Data", "Company register lookup", [], "NO"),
    item("german-company-data", "German Company Data", "Company register lookup", [], "DE"),
    item("swedish-company-data", "Swedish Company Data", "Company register lookup", [], "SE"),
    item("us-company-data", "US Company Data", "Company register lookup", [], "US"),
    item("austrian-company-data", "Austrian Company Data", "Company register lookup", [], "AT"),
    item("malt-recipe", "Malt Recipe", "Brewing helper"),
  ];
  const index = createKeywordIndex(catalogue);
  it.each([
    ["norwegain company", "norwegian-company-data"],
    ["germnay company", "german-company-data"],
    ["swedsih company", "swedish-company-data"],
    ["company data us", "us-company-data"],
  ])("%s resolves the country", (q, slug) => {
    expect(index.search(q)[0]?.item.slug).toBe(slug);
  });
  it.each(["finish", "trench", "vanish", "hungry", "brutish", "germane", "finish the report"])(
    "does not read the English word in %s as a country", (q) => {
      expect(extractCountries(q, () => false).codes.size).toBe(0);
    });
  it.each(["finish company setup", "trench company", "hungry business", "vanish business", "inland shipping company"])(
    "does not read the English word in %s as a country even next to a cue", (q) => {
      expect(extractCountries(q, () => false).codes.size).toBe(0);
    });
  it.each(["business card for us", "corporate gifts for us", "tell the company about us"])(
    "keeps us a pronoun in %s", (q) => {
      expect(extractCountries(q, () => false).codes.has("US")).toBe(false);
    });
  it("leaves short words and catalogue words alone", () => {
    expect(extractCountries("malt", () => false).codes.size).toBe(0);
    expect(extractCountries("recipe", () => true).codes.size).toBe(0);
    expect(index.search("malt")[0]?.item.slug).toBe("malt-recipe");
  });
});
