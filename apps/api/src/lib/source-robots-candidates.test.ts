import { describe, it, expect } from "vitest";
import { sourceCandidates } from "./source-robots-candidates.js";
import { parseRobotsTxt, rulesFor, isPathAllowed } from "./robots-txt.js";
import { STRALE_ROBOTS_TOKEN } from "./site-access.js";

/**
 * The guard behind `scripts/check-source-robots-access.ts`.
 *
 * What it has to get right is one distinction: a page the customer names is not
 * checkable, a page Strale chose is. Getting that backwards either way makes
 * the sweep useless — flag every URL-taking capability and nobody reads the
 * output; skip every placeholder and the real breakages (`/eSearch/${query}`,
 * `/tracking/${number}`) are the ones it misses.
 */
describe("sourceCandidates", () => {
  it("skips a page the customer names, because its target is unknown until the call", () => {
    // How a caller-directed executor is written: the host comes from input.
    expect(sourceCandidates("const html = await fetchRenderedHtml(`https://${url}`);")).toEqual([]);
    expect(sourceCandidates("`https://${domain}/robots.txt`")).toEqual([]);
    // A placeholder TLD is still a dynamic host (price-compare's pricerunner.${tld}).
    expect(sourceCandidates("`https://www.pricerunner.${tld}/search?q=${q}`")).toEqual([]);
  });

  it("keeps a Strale-chosen source even when the path is built from input", () => {
    const [c] = sourceCandidates("`https://euipo.europa.eu/eSearch/#basic/${encodeURIComponent(query)}`");
    expect(c.host).toBe("euipo.europa.eu");
  });

  it("matches on path and query only, because robots.txt never sees the fragment", () => {
    // euipo puts the query in the fragment; the rule that blocks it is on /eSearch/.
    const [c] = sourceCandidates("`https://euipo.europa.eu/eSearch/#basic/${q}`");
    expect(c.pathAndQuery).toBe("/eSearch/");

    const [q] = sourceCandidates("`https://patents.google.com/?q=${query}&num=${n}`");
    expect(q.pathAndQuery).toBe("/?q=STRALEPLACEHOLDER&num=STRALEPLACEHOLDER");
  });

  it("ignores our own hosts, schema URLs, prompt ellipses and non-http schemes", () => {
    expect(sourceCandidates('"https://api.strale.io/v1/do"')).toEqual([]);
    expect(sourceCandidates('"https://schema.org/Organization"')).toEqual([]);
    expect(sourceCandidates('"https://patents.google.com/patent/..."')).toEqual([]);
    expect(sourceCandidates('"mailto://x"')).toEqual([]);
  });

  it("de-duplicates, so one URL built twice is reported once", () => {
    const text = "`https://www.maersk.com/tracking/${n}`\n`https://www.maersk.com/tracking/${num}`";
    expect(sourceCandidates(text)).toHaveLength(1);
  });

  /**
   * The end-to-end shape, with robots.txt bodies pinned rather than fetched —
   * the sweep's network half is not what can silently rot. These two rules are
   * the ones live on 2026-10-30 (`archive/receipts/
   * 2026-10-30-check-source-robots-access.json` records the capture).
   *
   * Each case fails if the pieces are wired up wrongly: EUIPO's rule is
   * lower-case (`disallow:`) and only matches once the fragment is dropped;
   * Maersk's is a `*` wildcard; and `/patent/${id}` must stay allowed, or the
   * sweep would condemn half of `patent-search` that still works.
   */
  it("reproduces the 2026-10-28 breakages against the real robots.txt rules", () => {
    const verdict = (robots: string, url: string) => {
      const [c] = sourceCandidates(`\`${url}\``);
      const rules = rulesFor(parseRobotsTxt(robots), STRALE_ROBOTS_TOKEN);
      return isPathAllowed(rules, c.pathAndQuery);
    };

    const euipo = "User-agent: *\ndisallow: /eSearch/\ndisallow: /eSearchCLW/\n";
    expect(verdict(euipo, "https://euipo.europa.eu/eSearch/#basic/${q}")).toBe(false);

    const maersk = "User-agent: *\nDisallow: /tracking/*\n";
    expect(verdict(maersk, "https://www.maersk.com/tracking/${n}")).toBe(false);

    const ecEuropa = "User-agent: *\nDisallow: /taxation_customs/dds2/taric/\n";
    expect(verdict(ecEuropa, "https://ec.europa.eu/taxation_customs/dds2/taric/measures.jsp?GoodsCode=${c}")).toBe(false);

    // Google Patents blocks the search form, not an individual patent page.
    const patents = "User-agent: *\nDisallow: /?\nAllow: /patent/\n";
    expect(verdict(patents, "https://patents.google.com/?q=${q}&num=${n}")).toBe(false);
    expect(verdict(patents, "https://patents.google.com/patent/${id}")).toBe(true);
  });
});
