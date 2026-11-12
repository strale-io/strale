import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getExecutor } from "../capabilities/index.js";

const source = readFileSync(new URL("../../../web/src/content/tool-pages.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const content = { exports: {} as { toolPages: Record<string, { example: { input: Record<string, unknown>; output: Record<string, unknown> } }> } };
runInNewContext(compiled.outputText, content);
const { toolPages } = content.exports;

vi.mock("./safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./safe-fetch.js")>()),
  safeFetch: vi.fn(),
}));
vi.mock("./url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./url-validator.js")>()),
  validateUrl: vi.fn(async () => {}),
}));
import { safeFetch } from "./safe-fetch.js";
import { validateUrl } from "./url-validator.js";
import "../capabilities/header-security-check.js";
import "../capabilities/doi-resolve.js";

it("the DOI page and guide inputs resolve to the shown metadata without inventing optional fields", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: {
    DOI: "10.1038/nature12373", title: ["Nanometre-scale thermometry in a living cell"],
    "container-title": ["Nature"], issued: { "date-parts": [[2013, 7, 31]] }, "is-referenced-by-count": 0,
  } })));
  vi.stubGlobal("fetch", fetcher);
  try {
    const example = toolPages["doi-resolve"]!.example;
    const result = await getExecutor("doi-resolve")!(example.input);
    expect(fetcher).toHaveBeenCalledWith("https://api.crossref.org/works/10.1038%2Fnature12373", expect.any(Object));
    expect(result.output).toMatchObject(example.output);
    expect(result.output).toMatchObject({ authors: [], issn: [], referenced_by_count: 0, reference_count: null, license_url: null });
    const guide = readFileSync(new URL("../../../web/src/data/guides/doi-lookup-api.md", import.meta.url), "utf8");
    const urlInput = JSON.parse(guide.match(/`(\{"doi":[^`]+\})`/)![1]!);
    expect((await getExecutor("doi-resolve")!(urlInput)).output).toMatchObject(example.output);
  } finally { vi.unstubAllGlobals(); }
});

it("DataCite fallback preserves year-only dates and missing fields; only a Crossref 404 triggers it", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("not found", { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { attributes: {
      doi: "10.1234/synthetic-dataset", titles: [{ title: "Synthetic dataset" }], publicationYear: 2024,
      creators: [{ name: "Example Research Group" }], publisher: { name: "Example repository" }, citationCount: 0,
    } } })));
  vi.stubGlobal("fetch", fetcher);
  try {
    const result = await getExecutor("doi-resolve")!({ doi: "10.1234/synthetic-dataset" });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["https://api.crossref.org/works/10.1234%2Fsynthetic-dataset", "https://api.datacite.org/dois/10.1234%2Fsynthetic-dataset"]);
    expect(result.output).toMatchObject({ registration_agency: "DataCite", published: "2024", authors: ["Example Research Group"], referenced_by_count: 0, reference_count: null, issn: [], abstract: null, license_url: null, container_title: null });
    fetcher.mockReset().mockResolvedValue(new Response("limited", { status: 429 }));
    await expect(getExecutor("doi-resolve")!({ doi: "10.1234/test" })).rejects.toThrow("rate-limiting");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockReset().mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(getExecutor("doi-resolve")!({ doi: "10.1234/test" })).rejects.toThrow("registered with Crossref or DataCite");
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});

it("the security-header illustration matches the executor and its grade counts presence, not policy strength", async () => {
  const example = toolPages["header-security-check"]!.example;
  // Deliberately ineffective HSTS earns presence credit: the page must not call this a policy audit.
  const headers: Record<string, string> = {
    "strict-transport-security": "max-age=0", "x-frame-options": "SAMEORIGIN",
    "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "permissions-policy": "camera=()",
  };
  const fetcher = vi.mocked(safeFetch);
  fetcher.mockResolvedValue(new Response(null, { headers }));
  try {
    const result = await getExecutor("header-security-check")!(example.input);
    expect(validateUrl).toHaveBeenCalledWith(example.input.url);
    expect(fetcher).toHaveBeenCalledWith(example.input.url, expect.objectContaining({ method: "GET" }));
    expect(result.output).toMatchObject(example.output);
    expect(result.output.cors).toBeNull();
    expect(result.output.missing).toHaveLength(1);
    headers["content-security-policy"] = "x".repeat(250);
    headers["access-control-allow-origin"] = "*";
    fetcher.mockResolvedValue(new Response(null, { headers, status: 404 }));
    const errorPage = await getExecutor("header-security-check")!(example.input);
    expect(errorPage.output).toMatchObject({ score: 100, grade: "A", response_status: 404, missing: [], cors: { "access-control-allow-origin": "*" } });
    expect((errorPage.output.present as Array<{ header: string; value: string }>).find(h => h.header === "content-security-policy")!.value).toHaveLength(200);
    for (const [remove, score, grade] of [
      [["x-frame-options", "x-content-type-options"], 80, "B"],
      [["strict-transport-security", "content-security-policy"], 50, "D"],
      [Object.keys(headers), 10, "F"],
    ] as const) {
      const subset = Object.fromEntries(Object.entries(headers).filter(([key]) => !(remove as readonly string[]).includes(key)));
      fetcher.mockResolvedValue(new Response(null, { headers: subset }));
      expect((await getExecutor("header-security-check")!(example.input)).output).toMatchObject({ score, grade });
    }
    fetcher.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    // A timeout is the caller's site not answering (promise-audit T1 follow-up 30).
    await expect(getExecutor("header-security-check")!(example.input)).rejects.toThrow("URL did not answer (timeout)");
  } finally { vi.clearAllMocks(); }
});
