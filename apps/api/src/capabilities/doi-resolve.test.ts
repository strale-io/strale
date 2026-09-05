import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { extractDoi, formatIssued, stripJats } from "./doi-resolve.js";

const exec = getDirectExecutor("doi-resolve")!;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const CROSSREF = {
  message: {
    DOI: "10.1038/nature12373",
    type: "journal-article",
    title: ["Nanometre-scale thermometry in a living cell"],
    "container-title": ["Nature"],
    publisher: "Springer Science and Business Media LLC",
    author: [{ given: "G.", family: "Kucsko" }, { name: "Consortium X" }],
    issued: { "date-parts": [[2013, 7, 31]] },
    volume: "500",
    page: "54-58",
    ISSN: ["0028-0836"],
    "is-referenced-by-count": 1815,
    "reference-count": 30,
    language: "en",
    URL: "https://doi.org/10.1038/nature12373",
  },
};

describe("doi-resolve", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("extracts a DOI from a bare string, a URL, and trailing prose punctuation", () => {
    expect(extractDoi("10.1038/nature12373")).toBe("10.1038/nature12373");
    expect(extractDoi("https://doi.org/10.1038/nature12373")).toBe("10.1038/nature12373");
    expect(extractDoi("doi:10.1038/nature12373")).toBe("10.1038/nature12373");
    expect(extractDoi("see 10.1038/nature12373.")).toBe("10.1038/nature12373");
    expect(extractDoi("(10.1038/nature12373)")).toBe("10.1038/nature12373");
    expect(extractDoi("not-a-doi")).toBeNull();
  });

  it("formats partial Crossref date-parts without inventing precision", () => {
    expect(formatIssued([[2013, 7, 31]])).toBe("2013-07-31");
    expect(formatIssued([[2013, 7]])).toBe("2013-07");
    expect(formatIssued([[2013]])).toBe("2013");
    expect(formatIssued(undefined)).toBeNull();
  });

  it("flattens JATS abstract markup", () => {
    expect(stripJats("<jats:p>Hello  world</jats:p>")).toBe("Hello world");
    expect(stripJats("<jats:p></jats:p>")).toBeNull();
    expect(stripJats(undefined)).toBeNull();
  });

  it("refuses a missing or unparseable DOI before any upstream call", async () => {
    await expect(exec({})).rejects.toThrow(/'doi' is required/);
    await expect(exec({ doi: "not-a-doi" })).rejects.toThrow(/does not contain a DOI/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("projects a Crossref work, joining structured and free-form author names", async () => {
    fetchMock.mockResolvedValue(ok(CROSSREF));
    const { output } = await exec({ doi: "https://doi.org/10.1038/nature12373" });
    expect(output.registration_agency).toBe("Crossref");
    expect(output.title).toBe("Nanometre-scale thermometry in a living cell");
    expect(output.container_title).toBe("Nature");
    expect(output.authors).toEqual(["G. Kucsko", "Consortium X"]);
    expect(output.published).toBe("2013-07-31");
    expect(output.referenced_by_count).toBe(1815);
  });

  // A 404 at Crossref is not "no such DOI" — datasets and software are
  // registered with DataCite instead.
  it("falls back to DataCite when Crossref has no record", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("crossref")) return new Response("{}", { status: 404 });
      return ok({ data: { attributes: { doi: "10.5061/dryad.x", titles: [{ title: "A dataset" }], publisher: { name: "Dryad" }, publicationYear: 2021, types: { resourceTypeGeneral: "Dataset" }, creators: [{ givenName: "A", familyName: "B" }], url: "https://example.org/d" } } });
    });
    const { output, provenance } = await exec({ doi: "10.5061/dryad.x" });
    expect(output.registration_agency).toBe("DataCite");
    expect(output.title).toBe("A dataset");
    expect(output.publisher).toBe("Dryad");
    expect(output.published).toBe("2021");
    expect(output.authors).toEqual(["A B"]);
    // Journal-only fields must be null on this path, not absent.
    expect(output.container_title).toBeNull();
    expect(output.volume).toBeNull();
    expect(provenance.source).toMatch(/DataCite/);
  });

  it("reports a DOI neither agency registers", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(exec({ doi: "10.9999/nope" })).rejects.toThrow(/not registered with Crossref or DataCite/);
  });
});
