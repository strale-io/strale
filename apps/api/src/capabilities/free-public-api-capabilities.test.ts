/**
 * Shape and refusal tests for the 2026-09-04 free public-API batch that has
 * no bespoke parsing: pubmed-search (two-call E-utilities flow),
 * hacker-news-search, cve-details, usgs-earthquake-search. Fetch is stubbed;
 * nothing here reaches the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import "./pubmed-search.js";
import "./hacker-news-search.js";
import "./cve-details.js";
import "./usgs-earthquake-search.js";

const pubmed = getDirectExecutor("pubmed-search")!;
const hn = getDirectExecutor("hacker-news-search")!;
const cve = getDirectExecutor("cve-details")!;
const usgs = getDirectExecutor("usgs-earthquake-search")!;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("free public-API batch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  describe("pubmed-search", () => {
    it("refuses a bad date shape and an empty query before calling NCBI", async () => {
      await expect(pubmed({ query: "" })).rejects.toThrow(/'query' is required/);
      await expect(pubmed({ query: "crispr", min_date: "12-2024" })).rejects.toThrow(/YYYY, YYYY\/MM or YYYY\/MM\/DD/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("runs esearch then esummary, and maps ids to articles in search order with DOI and PMC ids", async () => {
      fetchMock
        .mockResolvedValueOnce(json({ esearchresult: { count: "2", idlist: ["2", "1"] } }))
        .mockResolvedValueOnce(json({ result: { uids: ["2", "1"],
          "1": { uid: "1", title: "One", authors: [{ name: "A B" }], source: "J1", fulljournalname: "Journal One", pubdate: "2020 Jan", articleids: [{ idtype: "doi", value: "10.1/one" }, { idtype: "pmc", value: "PMC1" }] },
          "2": { uid: "2", title: "Two", authors: [], source: "J2", pubdate: "2021", articleids: [] } } }));
      const r = await pubmed({ query: "crispr", limit: 2, min_date: "2020", sort: "date" });
      const first = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
      expect(first).toContain("esearch.fcgi");
      expect(first).toContain("mindate=2020");
      expect(first).toContain("sort=pub_date");
      expect(first).toContain("email=support@strale.io");
      expect(String(fetchMock.mock.calls[1][0])).toContain("esummary.fcgi");
      expect(r.output.total_results).toBe(2);
      const articles = r.output.articles as Array<Record<string, unknown>>;
      expect(articles.map((a) => a.pmid)).toEqual(["2", "1"]);
      expect(articles[1].doi).toBe("10.1/one");
      expect(articles[1].pmc_id).toBe("PMC1");
      expect(articles[1].url).toBe("https://pubmed.ncbi.nlm.nih.gov/1/");
    });

    it("an empty id list makes exactly one upstream call and returns zero articles", async () => {
      fetchMock.mockResolvedValueOnce(json({ esearchresult: { count: "0", idlist: [] } }));
      const r = await pubmed({ query: "zzzz-no-such-term" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(r.output.returned).toBe(0);
    });
  });

  describe("hacker-news-search", () => {
    it("uses search_by_date for sort=date, tags for type, and strips HTML from comment text", async () => {
      fetchMock.mockResolvedValueOnce(json({ nbHits: 1, hits: [{ objectID: "9", author: "pg", comment_text: "<p>Hello &amp; <i>world</i></p>", story_title: "Story", story_id: 1, _tags: ["comment"], created_at: "2020-01-01T00:00:00Z" }] }));
      const r = await hn({ query: "hello", type: "comment", sort: "date", since_days: 7 });
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain("/search_by_date?");
      expect(url).toContain("tags=comment");
      expect(url).toContain("numericFilters=created_at_i");
      const hit = (r.output.results as Array<Record<string, unknown>>)[0];
      expect(hit.type).toBe("comment");
      expect(hit.text).toBe("Hello & world");
      expect(hit.title).toBe("Story");
      expect(hit.hn_url).toBe("https://news.ycombinator.com/item?id=9");
    });

    it("refuses an empty query", async () => {
      await expect(hn({ query: "x" })).rejects.toThrow(/'query' is required/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("cve-details", () => {
    it("validates the CVE id shape before calling NVD", async () => {
      await expect(cve({})).rejects.toThrow(/'cve_id' is required/);
      await expect(cve({ cve_id: "CVE-21-1" })).rejects.toThrow(/must look like CVE-YYYY-NNNN/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("prefers CVSS 3.1 over 2.0, flattens CWE ids, and reports KEV status", async () => {
      fetchMock.mockResolvedValueOnce(json({ totalResults: 1, vulnerabilities: [{ cve: {
        id: "CVE-2021-44228", published: "2021-12-10T10:15:09.143", lastModified: "2026-08-11T19:33:44.513", vulnStatus: "Analyzed",
        descriptions: [{ lang: "es", value: "hola" }, { lang: "en", value: "Log4j JNDI" }],
        metrics: { cvssMetricV2: [{ cvssData: { version: "2.0", baseScore: 9.3 }, baseSeverity: "HIGH" }], cvssMetricV31: [{ cvssData: { version: "3.1", baseScore: 10, baseSeverity: "CRITICAL", vectorString: "CVSS:3.1/AV:N" } }] },
        weaknesses: [{ description: [{ lang: "en", value: "CWE-20" }, { lang: "en", value: "CWE-502" }] }, { description: [{ lang: "en", value: "CWE-20" }] }],
        references: [{ url: "https://x", source: "s", tags: ["Patch"] }],
        configurations: [{ nodes: [{ cpeMatch: [{ criteria: "cpe:2.3:a:apache:log4j:*", vulnerable: true }, { criteria: "cpe:2.3:a:other:x:*", vulnerable: false }] }] }],
        cisaExploitAdd: "2021-12-10", cisaActionDue: "2021-12-24",
      } }] }));
      const r = await cve({ cve_id: "cve-2021-44228" });
      expect(String(fetchMock.mock.calls[0][0])).toContain("cveId=CVE-2021-44228");
      expect(r.output.description).toBe("Log4j JNDI");
      expect((r.output.cvss as Record<string, unknown>).version).toBe("3.1");
      expect((r.output.cvss as Record<string, unknown>).severity).toBe("CRITICAL");
      expect(r.output.cwe_ids).toEqual(["CWE-20", "CWE-502"]);
      expect(r.output.known_exploited).toBe(true);
      expect(r.output.affected_cpe_count).toBe(1);
    });

    it("an empty vulnerabilities array is a not-found, and 429 is a retryable throttle", async () => {
      fetchMock.mockResolvedValueOnce(json({ totalResults: 0, vulnerabilities: [] }));
      await expect(cve({ cve_id: "CVE-1999-99999" })).rejects.toThrow(/No NVD record for CVE-1999-99999/);
      fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
      await expect(cve({ cve_id: "CVE-2021-44228" })).rejects.toThrow(/throttling.*5 requests per 30 seconds/);
    });
  });

  describe("usgs-earthquake-search", () => {
    it("requires latitude and longitude together and validates dates", async () => {
      await expect(usgs({ latitude: 10 })).rejects.toThrow(/must be given together/);
      await expect(usgs({ start_time: "yesterday" })).rejects.toThrow(/'start_time' must be an ISO date/);
      await expect(usgs({ min_magnitude: 99 })).rejects.toThrow(/'min_magnitude' must be a number between/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("defaults to a 30-day window, passes a radius search through, and flattens GeoJSON features", async () => {
      fetchMock.mockResolvedValueOnce(json({ metadata: { count: 1 }, features: [{ id: "us1", properties: { mag: 5.4, place: "Kermadec", time: 1788523198323, updated: 1788524380040, tsunami: 0, alert: null, sig: 449, status: "reviewed", type: "earthquake", magType: "mww", url: "https://e/us1" }, geometry: { coordinates: [-176.6452, -28.5616, 10] } }] }));
      const r = await usgs({ latitude: -28, longitude: -176, max_radius_km: 300, order: "magnitude" });
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain("maxradiuskm=300");
      expect(url).toContain("orderby=magnitude");
      expect(url).toMatch(/starttime=\d{4}-\d{2}-\d{2}/);
      const q = (r.output.earthquakes as Array<Record<string, unknown>>)[0];
      expect(q.magnitude).toBe(5.4);
      expect(q.latitude).toBe(-28.5616);
      expect(q.depth_km).toBe(10);
      expect(q.tsunami_warning).toBe(false);
      expect(q.time).toBe("2026-09-04T11:59:58.323Z");
      expect(r.output.count).toBe(1);
    });
  });
});
