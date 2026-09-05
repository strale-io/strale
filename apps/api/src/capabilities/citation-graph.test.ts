import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { resolveWorkPath, shortId, normalizeWork } from "./citation-graph.js";

const exec = getDirectExecutor("citation-graph")!;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const WORK = {
  id: "https://openalex.org/W2159974629",
  doi: "https://doi.org/10.1038/nature12373",
  title: "Nanometre-scale thermometry in a living cell",
  publication_year: 2013,
  cited_by_count: 1989,
  referenced_works: ["https://openalex.org/W1557405337", "https://openalex.org/W1963514592"],
  type: "article",
  authorships: [{ author: { display_name: "Georg Kucsko" } }],
  primary_location: { source: { display_name: "Nature" } },
  best_oa_location: { pdf_url: "https://www.nature.com/articles/nature12373.pdf" },
};

describe("citation-graph", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("resolves every accepted identifier namespace", () => {
    expect(resolveWorkPath("W2159974629")).toBe("W2159974629");
    expect(resolveWorkPath("w2159974629")).toBe("W2159974629");
    expect(resolveWorkPath("10.1038/nature12373")).toBe("doi:10.1038/nature12373");
    expect(resolveWorkPath("https://doi.org/10.1038/nature12373")).toBe("doi:10.1038/nature12373");
    // arXiv has no OpenAlex namespace; it routes via the registered DataCite DOI.
    expect(resolveWorkPath("2209.15001")).toBe("doi:10.48550/arXiv.2209.15001");
    expect(resolveWorkPath("arXiv:2209.15001v3")).toBe("doi:10.48550/arXiv.2209.15001");
    expect(resolveWorkPath("33244136")).toBe("pmid:33244136");
    expect(resolveWorkPath("???")).toBeNull();
  });

  it("extracts the bare work id from an OpenAlex URL", () => {
    expect(shortId("https://openalex.org/W2159974629")).toBe("W2159974629");
    expect(shortId("https://openalex.org/A123")).toBeNull();
    expect(shortId(undefined)).toBeNull();
  });

  it("strips the doi.org prefix and flattens authorships", () => {
    const n = normalizeWork(WORK)!;
    expect(n.doi).toBe("10.1038/nature12373");
    expect(n.venue).toBe("Nature");
    expect(n.authors).toEqual(["Georg Kucsko"]);
    expect(normalizeWork(null)).toBeNull();
  });

  it("refuses an unrecognised identifier and an unknown direction", async () => {
    await expect(exec({ paper_id: "???" })).rejects.toThrow(/not a recognised paper identifier/);
    await expect(exec({ paper_id: "10.1038/nature12373", direction: "sideways" })).rejects.toThrow(/'direction' must be one of/);
    await expect(exec({})).rejects.toThrow(/'paper_id' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns both edges and reports the two citation totals separately", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("filter=cites:")) {
        return ok({ meta: { count: 1990 }, results: [{ id: "https://openalex.org/W3037447387", title: "Quantum sensing", cited_by_count: 4067 }] });
      }
      if (url.includes("filter=openalex_id:")) {
        return ok({ meta: { count: 2 }, results: [{ id: "https://openalex.org/W1557405337", title: "Quantum correlation" }] });
      }
      return ok(WORK);
    });

    const { output } = await exec({ paper_id: "10.1038/nature12373", limit: 5 });
    expect(output.resolved_id).toBe("W2159974629");
    expect(output.citation_count).toBe(1989);
    expect(output.citing_works_total).toBe(1990);
    expect(output.reference_count).toBe(2);
    expect((output.citations as unknown[]).length).toBe(1);
    expect((output.references as unknown[]).length).toBe(1);
    expect(output.citations_unavailable).toBe(false);
    expect(output.references_unavailable).toBe(false);
  });

  it("honours direction=references and issues no citations query", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("filter=openalex_id:") ? ok({ results: [] }) : ok(WORK));
    const { output } = await exec({ paper_id: "W2159974629", direction: "references" });
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("filter=cites:"))).toBe(true);
    expect(output.citations).toEqual([]);
  });

  // A failed edge query must be distinguishable from a work that genuinely
  // has no edges, or a caller reads "0 citations" from an outage.
  it("flags an edge as unavailable when its query fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("filter=")) return new Response("{}", { status: 500 });
      return ok(WORK);
    });
    const { output } = await exec({ paper_id: "W2159974629" });
    expect(output.citations).toEqual([]);
    expect(output.citations_unavailable).toBe(true);
    expect(output.references_unavailable).toBe(true);
    expect(output.citation_count).toBe(1989);
  });
});
