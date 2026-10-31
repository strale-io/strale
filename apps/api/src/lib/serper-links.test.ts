import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deriveResultDomain,
  isGotoLink,
  resolveSerperLinks,
  usableResultUrl,
} from "./serper-links.js";

const GOTO_4 = "https://www.google.com/goto?url=CAESdwHrOzAV-gwNrhN26N3NEoW";
const GOTO_5 = "https://www.google.com/goto?url=CAESdAHrOzAVeh-GSWBYjHdMTv9";
const REAL_4 = "https://www.teamwork.com/blog/best-project-management-tools/";
const REAL_5 = "https://zapier.com/blog/free-project-management-software/";

/**
 * Shaped on the live `/search` response captured 2026-10-31 (query "best
 * project management software", gl=us): positions 1-3 real, 4+ wrapped, and
 * `displayedLink` carrying Google's breadcrumb for every entry.
 */
function searchResponse() {
  return {
    searchParameters: { q: "best project management software", gl: "us" },
    organic: [
      {
        title: "Honest Review of 6 Personal Project Management Tools",
        link: "https://www.icagile.com/resources/honest-review",
        displayedLink: "https://www.icagile.com › resources › honest-review...",
        position: 1,
      },
      {
        title: "Project management tools ranked",
        link: "https://www.reddit.com/r/projectmanagement/comments/1r7dr5i/",
        displayedLink: "140+ comments · 8 months ago",
        position: 2,
      },
      {
        title: "Project management software",
        link: "https://www.paymoapp.com/blog/project-management-software/",
        displayedLink: "https://www.paymoapp.com › blog",
        position: 3,
      },
      {
        title: "10 best project management tools for 2026",
        link: GOTO_4,
        displayedLink: "https://www.teamwork.com › Blog",
        position: 4,
      },
      {
        title: "Free project management software",
        link: GOTO_5,
        displayedLink: "https://zapier.com › blog",
        position: 5,
      },
    ],
    peopleAlsoAsk: [{ question: "What is the best software for project management?" }],
  };
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("serper-links — isGotoLink", () => {
  it("recognises the redirect wrapper on any Google market host", () => {
    expect(isGotoLink(GOTO_4)).toBe(true);
    expect(isGotoLink("https://google.com/goto?url=x")).toBe(true);
    expect(isGotoLink("https://www.google.co.uk/goto?url=x")).toBe(true);
    expect(isGotoLink("https://www.google.de/goto")).toBe(true);
  });

  it("does not mistake a real result for a wrapper", () => {
    expect(isGotoLink(REAL_4)).toBe(false);
    // A Google-owned destination is a legitimate result, not a redirect.
    expect(isGotoLink("https://www.google.com/maps/place/x")).toBe(false);
    expect(isGotoLink("https://blog.google/products/search/")).toBe(false);
    // A lookalike host must not be read as Google.
    expect(isGotoLink("https://google.com.phishing.example/goto?url=x")).toBe(false);
    expect(isGotoLink("")).toBe(false);
    expect(isGotoLink(null)).toBe(false);
    expect(isGotoLink("not a url")).toBe(false);
  });
});

describe("serper-links — deriveResultDomain", () => {
  it("NEVER returns a Google host for a wrapper (the wrong-answer bug)", () => {
    // Before the fix, `new URL(link).hostname` gave "www.google.com" here and
    // three paid tools reported it as the result's domain.
    expect(deriveResultDomain(GOTO_4)).not.toBe("google.com");
    expect(deriveResultDomain(GOTO_4)).not.toBe("www.google.com");
  });

  it("reads the real host from Google's breadcrumb when the link is opaque", () => {
    expect(deriveResultDomain(GOTO_4, "https://www.teamwork.com › Blog")).toBe("teamwork.com");
    expect(deriveResultDomain(GOTO_5, "https://zapier.com › blog")).toBe("zapier.com");
  });

  it("returns null when neither the link nor the breadcrumb names a host", () => {
    expect(deriveResultDomain(GOTO_4)).toBeNull();
    // Serper sometimes puts a comment count in displayedLink, not a host.
    expect(deriveResultDomain(GOTO_4, "140+ comments · 8 months ago")).toBeNull();
    expect(deriveResultDomain("")).toBeNull();
    expect(deriveResultDomain(undefined)).toBeNull();
    // A breadcrumb that is itself a Google host is no answer either.
    expect(deriveResultDomain(GOTO_4, "https://www.google.com › search")).toBeNull();
  });

  it("prefers the real link over the breadcrumb", () => {
    expect(deriveResultDomain(REAL_4, "https://wrong.example › x")).toBe("teamwork.com");
  });
});

describe("serper-links — usableResultUrl", () => {
  it("passes a real URL through and refuses a wrapper", () => {
    expect(usableResultUrl(REAL_4)).toBe(REAL_4);
    expect(usableResultUrl(GOTO_4)).toBeNull();
    expect(usableResultUrl(undefined)).toBeNull();
  });
});

describe("serper-links — resolveSerperLinks", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("is a no-op, with no HTTP call, when nothing is wrapped", async () => {
    const response = searchResponse();
    response.organic = response.organic.slice(0, 3);
    const before = JSON.stringify(response);

    const result = await resolveSerperLinks(response, "k");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: false, resolved: 0, unresolved: [] });
    expect(JSON.stringify(response)).toBe(before);
  });

  it("rewrites a mixed response in place, sending only the wrapped links", async () => {
    fetchMock.mockResolvedValue(okJson({ organic: [{ link: REAL_4 }, { link: REAL_5 }], credits: 0 }));
    const response = searchResponse();

    const result = await resolveSerperLinks(response, "test-key");

    expect(result).toEqual({ attempted: true, resolved: 2, unresolved: [] });
    expect(response.organic[3].link).toBe(REAL_4);
    expect(response.organic[4].link).toBe(REAL_5);
    // The three real links are untouched and were not sent.
    expect(response.organic[0].link).toBe("https://www.icagile.com/resources/honest-review");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://google.serper.dev/resolve");
    expect((init as RequestInit).method).toBe("POST");
    expect(((init as RequestInit).headers as Record<string, string>)["X-API-KEY"]).toBe("test-key");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      organic: [{ link: GOTO_4 }, { link: GOTO_5 }],
    });
    // Every external call carries a timeout (CLAUDE.md).
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("leaves links alone and reports them when /resolve fails with an HTTP error", async () => {
    fetchMock.mockResolvedValue(new Response("upstream down", { status: 502 }));
    const response = searchResponse();

    const result = await resolveSerperLinks(response, "k");

    expect(result.attempted).toBe(true);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toEqual([GOTO_4, GOTO_5]);
    expect(result.error).toMatch(/HTTP 502/);
    // Never substitutes a guess for the link it could not resolve.
    expect(response.organic[3].link).toBe(GOTO_4);
  });

  it("reports a timeout without throwing", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeout);
    const response = searchResponse();

    const result = await resolveSerperLinks(response, "k");

    expect(result.attempted).toBe(true);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toEqual([GOTO_4, GOTO_5]);
    expect(result.error).toMatch(/TimeoutError/);
    expect(response.organic[3].link).toBe(GOTO_4);
  });

  it("refuses an echoed wrapper or a non-http value as a resolution", async () => {
    fetchMock.mockResolvedValue(
      okJson({ organic: [{ link: GOTO_4 }, { link: "javascript:alert(1)" }] }),
    );
    const response = searchResponse();

    const result = await resolveSerperLinks(response, "k");

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toEqual([GOTO_4, GOTO_5]);
    expect(response.organic[4].link).toBe(GOTO_5);
  });

  it("drops a batch whose entry count does not line up, rather than misaligning URLs", async () => {
    // Attaching REAL_4 to position 5 would be a wrong answer presented
    // confidently — worse than an unresolved link.
    fetchMock.mockResolvedValue(okJson({ organic: [{ link: REAL_4 }] }));
    const response = searchResponse();

    const result = await resolveSerperLinks(response, "k");

    expect(result.resolved).toBe(0);
    expect(result.error).toMatch(/returned 1 entries for 2 links/);
    expect(response.organic[3].link).toBe(GOTO_4);
  });

  it("resolves wrapped links wherever they sit, including nested and news shapes", async () => {
    fetchMock.mockResolvedValue(okJson({ organic: [{ link: REAL_4 }, { link: REAL_5 }] }));
    const response = {
      news: [{ title: "a", link: GOTO_4 }],
      answerBox: { snippet: "s", link: GOTO_5 },
      organic: [{ link: REAL_4, sitelinks: [{ title: "t", link: GOTO_4 }] }],
    };

    const result = await resolveSerperLinks(response, "k");

    // GOTO_4 appears twice but is sent once, and both copies are rewritten.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      organic: [{ link: GOTO_4 }, { link: GOTO_5 }],
    });
    expect(result.resolved).toBe(3);
    expect(response.news[0].link).toBe(REAL_4);
    expect(response.answerBox.link).toBe(REAL_5);
    expect(response.organic[0].sitelinks[0].link).toBe(REAL_4);
  });

  it("reports the wrapped links without calling /resolve when the key is missing", async () => {
    const response = searchResponse();

    const result = await resolveSerperLinks(response, "");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.attempted).toBe(false);
    expect(result.unresolved).toEqual([GOTO_4, GOTO_5]);
    expect(result.error).toMatch(/SERPER_API_KEY/);
  });

  it("splits more than 100 wrapped links across calls", async () => {
    const links = Array.from({ length: 101 }, (_, i) => `${GOTO_4}${i}`);
    const response = { organic: links.map((link) => ({ link })) };
    fetchMock.mockImplementation((_url, init: RequestInit) => {
      const sent = JSON.parse(init.body as string).organic as Array<{ link: string }>;
      return Promise.resolve(
        okJson({ organic: sent.map((e) => ({ link: `https://real.example/${e.link.length}` })) }),
      );
    });

    const result = await resolveSerperLinks(response, "k");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).organic).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).organic).toHaveLength(1);
    expect(result.resolved).toBe(101);
  });
});
