import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { parseArxivFeed } from "./arxiv-search.js";

const exec = getDirectExecutor("arxiv-search")!;

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">258539</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/2209.15001v3</id>
    <updated>2023-01-16T18:58:58Z</updated>
    <published>2022-09-29T17:57:08Z</published>
    <title>Dilated Neighborhood
  Attention Transformer</title>
    <summary>Transformers are quickly becoming &amp; one of the most heavily applied deep learning architectures.</summary>
    <author><name>Ali Hassani</name></author>
    <author><name>Humphrey Shi</name></author>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1000/xyz123</arxiv:doi>
    <link href="http://arxiv.org/abs/2209.15001v3" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2209.15001v3" rel="related" type="application/pdf"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CV" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.CV" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

describe("arxiv-search", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("parses an Atom entry without an XML library: id, version, whitespace-folded title, entities, authors, categories, pdf, doi", () => {
    const { total, entries } = parseArxivFeed(FEED);
    expect(total).toBe(258539);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.arxiv_id).toBe("2209.15001");
    expect(e.version).toBe(3);
    expect(e.title).toBe("Dilated Neighborhood Attention Transformer");
    expect(e.summary).toContain("& one of the most");
    expect(e.authors).toEqual(["Ali Hassani", "Humphrey Shi"]);
    expect(e.primary_category).toBe("cs.CV");
    expect(e.categories).toEqual(["cs.CV", "cs.LG"]);
    expect(e.pdf_url).toBe("http://arxiv.org/pdf/2209.15001v3");
    expect(e.doi).toBe("10.1000/xyz123");
  });

  it("refuses a missing query before any upstream call", async () => {
    await expect(exec({})).rejects.toThrow(/'query' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds an https export.arxiv.org query with the category ANDed in, and returns the documented shape", async () => {
    fetchMock.mockResolvedValue(new Response(FEED, { status: 200, headers: { "Content-Type": "application/atom+xml" } }));
    const r = await exec({ query: "attention", category: "cs.CV", limit: 5, sort: "date" });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith("https://export.arxiv.org/api/query?")).toBe(true);
    expect(decodeURIComponent(url.replace(/\+/g, " "))).toContain("all:attention AND cat:cs.CV");
    expect(url).toContain("max_results=5");
    expect(url).toContain("sortBy=submittedDate");
    expect(r.output.total_results).toBe(258539);
    expect(r.output.returned).toBe(1);
    expect(r.provenance.source).toBe("arxiv.org");
  });

  it("surfaces arXiv throttling as a retryable upstream error, not a parse crash", async () => {
    fetchMock.mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(exec({ query: "attention" })).rejects.toThrow(/throttling.*503/);
  });
});
