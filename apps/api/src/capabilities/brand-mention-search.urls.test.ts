/**
 * brand-mention-search: the model is the last writer on `mentions[].url`, so
 * every URL it emits is checked against the links Serper actually served
 * (round-2 review of the Serper /goto repair, PR #877). These tests fail if
 * that check is removed: the model's fabricated and "(unavailable)" URLs
 * would then reach the caller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const llmOutput = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("./lib/llm-extract.js", () => ({
  extractJsonWithLlm: vi.fn(async () => structuredClone(llmOutput.value)),
}));

import { getDirectExecutor } from "./index.js";
import "./brand-mention-search.js";

const GOTO = "https://www.google.com/goto?url=CAESdwHrOzAV9";

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("brand-mention-search emits only URLs Serper served", () => {
  const saved = { serper: process.env.SERPER_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.SERPER_API_KEY = "test-key";
    process.env.ANTHROPIC_API_KEY = "test-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    for (const [k, v] of [["SERPER_API_KEY", saved.serper], ["ANTHROPIC_API_KEY", saved.anthropic]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("nulls and counts a reconstructed or placeholder URL, keeps a served one", async () => {
    fetchMock.mockImplementation((url: string | URL) =>
      String(url).includes("/resolve")
        ? Promise.resolve(new Response("down", { status: 503 }))
        : Promise.resolve(okJson({
            organic: [
              { title: "real", link: "https://news.example/acme", snippet: "s", position: 1 },
              { title: "wrapped", link: GOTO, snippet: "s", position: 4 },
            ],
          })),
    );
    llmOutput.value = {
      mentions: [
        { url: "https://news.example/acme", title: "real" },
        { url: "https://blog.example/reconstructed-from-snippet", title: "wrapped" },
        { url: "(unavailable)", title: "wrapped" },
      ],
      total_results_found: 2,
    };

    const out = (await getDirectExecutor("brand-mention-search")!({ brand_name: "Acme" })).output as any;

    expect(out.mentions[0].url).toBe("https://news.example/acme");
    expect(out.mentions[1].url).toBeNull();
    expect(out.mentions[1].url_unavailable).toBe(true);
    expect(out.mentions[2].url).toBeNull();
    expect(out.unresolved_url_count).toBe(2);
    expect(JSON.stringify(out)).not.toContain("/goto");
  });

  it("emits unresolved_url_count on the no-results path the manifest guarantees it on", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(okJson({ organic: [] })));
    const out = (await getDirectExecutor("brand-mention-search")!({ brand_name: "Acme" })).output as any;
    expect(out.unresolved_url_count).toBe(0);
  });

  it("refuses before the paid search when the model key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(getDirectExecutor("brand-mention-search")!({ brand_name: "Acme" })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
