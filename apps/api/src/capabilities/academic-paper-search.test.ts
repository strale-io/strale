import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { abstractFromInvertedIndex } from "./academic-paper-search.js";
import { resolveWorkIdentifier } from "./paper-details.js";

const search = getDirectExecutor("academic-paper-search")!;
const details = getDirectExecutor("paper-details")!;

const WORK = {
  id: "https://openalex.org/W3035965352",
  doi: "https://doi.org/10.1038/s41586-020-2649-2",
  title: "Array programming with NumPy",
  publication_year: 2020,
  publication_date: "2020-09-16",
  type: "article",
  cited_by_count: 23533,
  referenced_works_count: 41,
  authorships: [{ author: { display_name: "Charles R. Harris" }, institutions: [{ display_name: "Google" }] }],
  primary_location: { source: { display_name: "Nature", type: "journal" }, landing_page_url: "https://doi.org/10.1038/s41586-020-2649-2" },
  open_access: { is_oa: true, oa_status: "hybrid", oa_url: "https://www.nature.com/articles/s41586-020-2649-2.pdf" },
  abstract_inverted_index: { Array: [0], programming: [1], provides: [2], a: [3], syntax: [4] },
};

describe("academic-paper-search / paper-details (OpenAlex)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("rebuilds an abstract from the inverted index in position order, bounded", () => {
    expect(abstractFromInvertedIndex(WORK.abstract_inverted_index)).toBe("Array programming provides a syntax");
    expect(abstractFromInvertedIndex(null)).toBeNull();
    expect(abstractFromInvertedIndex({ b: [1], a: [0] }, 2)).toBe("a…");
  });

  it("accepts a bare DOI, a doi.org URL, and an OpenAlex id; rejects noise", () => {
    expect(resolveWorkIdentifier("10.1038/s41586-020-2649-2")).toEqual({ kind: "doi", id: "10.1038/s41586-020-2649-2" });
    expect(resolveWorkIdentifier("https://doi.org/10.1038/S41586-020-2649-2.")).toEqual({ kind: "doi", id: "10.1038/s41586-020-2649-2" });
    expect(resolveWorkIdentifier("w3035965352")).toEqual({ kind: "openalex", id: "W3035965352" });
    expect(resolveWorkIdentifier("not-a-doi")).toBeNull();
  });

  it("search refuses an empty query without calling upstream", async () => {
    await expect(search({ query: " " })).rejects.toThrow(/'query' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("search passes filters and the polite-pool mailto, and flattens works to the documented shape", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ meta: { count: 1 }, results: [WORK] }), { status: 200 }));
    const r = await search({ query: "numpy", year_from: 2019, open_access_only: true, limit: 3 });
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain("mailto=support@strale.io");
    expect(url).toContain("from_publication_date:2019-01-01");
    expect(url).toContain("is_oa:true");
    expect(url).toContain("per-page=3");
    expect(r.output.total_results).toBe(1);
    const p = (r.output.papers as Array<Record<string, unknown>>)[0];
    expect(p.title).toBe("Array programming with NumPy");
    expect(p.authors).toEqual(["Charles R. Harris"]);
    expect(p.venue).toBe("Nature");
    expect(p.abstract).toBe("Array programming provides a syntax");
  });

  it("details cannot smuggle query parameters through the DOI (review of #518)", async () => {
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(WORK), { status: 200 }));
    await details({ doi: "10.1038/x?select=id&mailto=attacker@example.com" });
    const url = String(fetchMock.mock.calls[0][0]);
    // The DOI is cut at '?', and what remains is percent-encoded per path segment.
    expect(url).toContain("/works/https://doi.org/10.1038/x?mailto=support%40strale.io");
    expect(url).not.toContain("select=");
    expect(url).not.toContain("attacker");
    fetchMock.mockClear();
    await details({ doi: "10.1000/a&b#c" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/works/https://doi.org/10.1000/a?mailto=");
  });

  it("details turns an OpenAlex 404 into a clear not-found error", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(details({ doi: "10.9999/does-not-exist" })).rejects.toThrow(/No work found.*10\.9999\/does-not-exist/);
  });

  it("details returns author institutions, open-access status and counts", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(WORK), { status: 200 }));
    const r = await details({ doi: "https://doi.org/10.1038/s41586-020-2649-2" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/works/https://doi.org/10.1038/s41586-020-2649-2");
    expect(r.output.author_count).toBe(1);
    expect((r.output.authors as Array<Record<string, unknown>>)[0].institutions).toEqual(["Google"]);
    expect(r.output.open_access_status).toBe("hybrid");
    expect(r.output.cited_by_count).toBe(23533);
    expect(r.provenance.source).toBe("openalex.org");
  });
});
