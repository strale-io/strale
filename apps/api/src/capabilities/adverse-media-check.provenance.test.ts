/**
 * adverse-media-check names the vendor that answered each call
 * (DEC-20261023-A: vendor and acquisition method on every answer).
 *
 * It has two paths: Dilisense, then a Serper fallback. The manifest's
 * data_access names Dilisense as the default, so the fallback must label
 * itself, or a Serper answer would be recorded as Dilisense's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getExecutor } from "./index.js";
import "./adverse-media-check.js";

const saved = { d: process.env.DILISENSE_API_KEY, s: process.env.SERPER_API_KEY };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.SERPER_API_KEY = "test-serper";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (saved.d === undefined) delete process.env.DILISENSE_API_KEY;
  else process.env.DILISENSE_API_KEY = saved.d;
  if (saved.s === undefined) delete process.env.SERPER_API_KEY;
  else process.env.SERPER_API_KEY = saved.s;
});

describe("adverse-media-check provenance names the answering vendor", () => {
  it("labels a Dilisense answer as Dilisense", async () => {
    process.env.DILISENSE_API_KEY = "test-dilisense";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ total_hits: 0, news_exposures: {} })),
    );
    const result = await getExecutor("adverse-media-check")!({ name: "Example Holding AB" });
    expect(result.provenance).toMatchObject({
      source: "dilisense.com",
      acquisition_method: "vendor_api",
      upstream_vendor: "dilisense",
    });
  });

  it("labels the Serper fallback as Serper", async () => {
    process.env.DILISENSE_API_KEY = "test-dilisense";
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("dilisense") ? json({}, 503) : json({ organic: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await getExecutor("adverse-media-check")!({ name: "Example Holding AB" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.provenance).toMatchObject({
      source: "google-serper",
      acquisition_method: "vendor_api",
      upstream_vendor: "serper",
    });
  });
});
