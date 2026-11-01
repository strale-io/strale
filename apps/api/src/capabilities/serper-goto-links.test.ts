/**
 * Regression suite for the Google `/goto` redirect breakage (2026-10-30).
 *
 * Every test here fails against the unfixed code. The three domain-deriving
 * tools are the point: before the fix each read `www.google.com` off an
 * unresolved wrapper and reported it as the result's own host, so a paid
 * ranking, a SERP breakdown and a backlink list all answered about Google.
 *
 * Verified both directions by reverting `deriveResultDomain` to the old
 * `new URL(link).hostname` and re-running — see the PR body for the output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import "./keyword-rank-check.js";
import "./serp-analyze.js";
import "./backlink-check.js";
import "./google-search.js";
import "./google-news-search.js";
import "./serp-related-questions.js";
import "./adverse-media-check.js";

const GOTO = (n: number) => `https://www.google.com/goto?url=CAESdwHrOzAV${n}`;
const REAL = (n: number) => `https://real-${n}.example/article`;

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A `/search` response in today's shape: positions 1-3 real, 4+ wrapped.
 * `displayedLink` is omitted on the wrapped entries so the tests exercise the
 * genuinely-unknown-host path rather than the breadcrumb fallback.
 */
function serpWithGotoTail(realHosts: string[] = []) {
  const organic = [
    ...realHosts.map((host, i) => ({
      title: `real ${i}`,
      link: `https://${host}/page`,
      snippet: "s",
      position: i + 1,
    })),
    ...[4, 5, 6].map((position) => ({
      title: `wrapped ${position}`,
      link: GOTO(position),
      snippet: "s",
      position,
    })),
  ];
  return { searchParameters: { q: "x" }, organic };
}

describe("Google /goto links never become a google.com answer", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalKey = process.env.SERPER_API_KEY;

  beforeEach(() => {
    process.env.SERPER_API_KEY = "test-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = originalKey;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /** Search answers first, then `/resolve` answers with `resolved`. */
  function stubSearchThenResolve(search: unknown, resolved: string[] | "fail") {
    fetchMock.mockImplementation((url: string | URL) => {
      if (String(url).includes("/resolve")) {
        if (resolved === "fail") return Promise.resolve(new Response("down", { status: 503 }));
        return Promise.resolve(okJson({ organic: resolved.map((link) => ({ link })), credits: 0 }));
      }
      return Promise.resolve(okJson(search));
    });
  }

  describe("keyword-rank-check", () => {
    const run = () => getDirectExecutor("keyword-rank-check")!;

    it("reports the real competitor domains, not google.com, once resolved", async () => {
      stubSearchThenResolve(serpWithGotoTail(["a.example", "b.example", "c.example"]), [
        REAL(4),
        REAL(5),
        REAL(6),
      ]);

      const out = (await run()({ domain: "real-6.example", keyword: "widgets" })).output as any;

      expect(out.found).toBe(true);
      expect(out.position).toBe(6);
      expect(out.url).toBe(REAL(6));
      const domains = out.competitors_above.map((c: any) => c.domain);
      expect(domains).not.toContain("google.com");
      expect(domains).not.toContain("www.google.com");
      expect(domains).toEqual(["a.example", "b.example", "c.example", "real-4.example", "real-5.example"]);
      expect(out.unresolved_positions).toEqual([]);
    });

    it("refuses rather than reporting a possibly-wrong rank when a position stays opaque", async () => {
      stubSearchThenResolve(serpWithGotoTail(["a.example", "b.example", "c.example"]), "fail");

      // Positions 4-6 could be the caller's own domain. "Not ranking" would
      // be a guess, and so would any position below an unknown one.
      await expect(run()({ domain: "mysite.example", keyword: "widgets" })).rejects.toThrow(
        /opaque redirect links for result position\(s\) 4, 5, 6/,
      );
    });

    it("still answers when every unknown position sits below the match", async () => {
      stubSearchThenResolve(serpWithGotoTail(["a.example", "mysite.example", "c.example"]), "fail");

      const out = (await run()({ domain: "mysite.example", keyword: "widgets" })).output as any;

      expect(out.position).toBe(2);
      expect(out.unresolved_positions).toEqual([4, 5, 6]);
      expect(out.breadcrumb_derived_positions).toEqual([]);
      expect(out.competitors_above.map((c: any) => c.domain)).toEqual(["a.example"]);
    });

    // ── round-2 review findings ──

    it("refuses when a position's host came only from Google's breadcrumb", async () => {
      // A breadcrumb is Google's DISPLAY url: for AMP, syndicated and
      // redirecting results it is routinely not the destination host. Before
      // this, such a position got a non-null domain, was absent from
      // unresolved_positions, and was reported as a match at position 4 with
      // url: null — the caller could not tell it was never resolved.
      const search = {
        searchParameters: { q: "x" },
        organic: [
          { title: "a", link: "https://a.example/p", snippet: "s", position: 1 },
          {
            title: "wrapped",
            link: GOTO(4),
            displayedLink: "https://mysite.example > blog",
            snippet: "s",
            position: 4,
          },
        ],
      };
      stubSearchThenResolve(search, "fail");

      await expect(run()({ domain: "mysite.example", keyword: "widgets" })).rejects.toThrow(
        /opaque redirect links for result position\(s\) 4/,
      );
    });

    it("marks a breadcrumb-derived position when it sits below the match", async () => {
      const search = {
        searchParameters: { q: "x" },
        organic: [
          { title: "mine", link: "https://mysite.example/p", snippet: "s", position: 1 },
          {
            title: "wrapped",
            link: GOTO(4),
            displayedLink: "https://other.example > blog",
            snippet: "s",
            position: 4,
          },
        ],
      };
      stubSearchThenResolve(search, "fail");

      const out = (await run()({ domain: "mysite.example", keyword: "widgets" })).output as any;

      expect(out.position).toBe(1);
      expect(out.breadcrumb_derived_positions).toEqual([4]);
      expect(out.unresolved_positions).toEqual([]);
    });

    it("blocks by array index, not by position value", async () => {
      // Serper's array order and its position values can disagree. Comparing
      // position VALUES let an unresolved result land in competitors_above
      // (built with slice(0, matchIdx)) without blocking.
      const search = {
        searchParameters: { q: "x" },
        organic: [
          { title: "opaque", link: GOTO(9), snippet: "s", position: 9 },
          { title: "mine", link: "https://mysite.example/p", snippet: "s", position: 5 },
        ],
      };
      stubSearchThenResolve(search, "fail");

      await expect(run()({ domain: "mysite.example", keyword: "widgets" })).rejects.toThrow(
        /opaque redirect links for result position\(s\) 9/,
      );
    });
  });

  describe("serp-analyze", () => {
    const run = () => getDirectExecutor("serp-analyze")!;

    it("never lists google.com in top_domains", async () => {
      stubSearchThenResolve(serpWithGotoTail(["a.example"]), [REAL(4), REAL(5), REAL(6)]);

      const out = (await run()({ keyword: "widgets" })).output as any;

      expect(out.top_domains.map((d: any) => d.domain)).toEqual([
        "a.example",
        "real-4.example",
        "real-5.example",
        "real-6.example",
      ]);
      expect(JSON.stringify(out.top_domains)).not.toContain("google.com");
      expect(out.organic_results.every((r: any) => !String(r.url).includes("/goto"))).toBe(true);
      expect(out.unresolved_positions).toEqual([]);
    });

    it("marks an unresolved result instead of attributing it to Google", async () => {
      stubSearchThenResolve(serpWithGotoTail(["a.example"]), "fail");

      const out = (await run()({ keyword: "widgets" })).output as any;

      expect(JSON.stringify(out)).not.toContain("google.com/goto");
      expect(out.top_domains.map((d: any) => d.domain)).toEqual(["a.example"]);
      expect(out.unresolved_positions).toEqual([4, 5, 6]);
      const wrapped = out.organic_results.filter((r: any) => r.link_unresolved);
      expect(wrapped).toHaveLength(3);
      expect(wrapped.every((r: any) => r.url === null && r.domain === null)).toBe(true);
      expect(out.link_resolution).toEqual({ attempted: true, unresolved_results: 3 });
    });

    it("does not emit a wrapped answerBox link as a source URL", async () => {
      const search = {
        ...serpWithGotoTail(["a.example"]),
        answerBox: { snippet: "the answer", link: GOTO(99) },
      };
      stubSearchThenResolve(search, "fail");

      const out = (await run()({ keyword: "widgets" })).output as any;

      expect(out.featured_snippet.text).toBe("the answer");
      expect(out.featured_snippet.source_url).toBeNull();
    });
  });

  describe("backlink-check", () => {
    const run = () => getDirectExecutor("backlink-check")!;

    /** CommonCrawl answers empty so the Serper fallback is the path under test. */
    function stubCommonCrawlEmptyThen(search: unknown, resolved: string[] | "fail") {
      fetchMock.mockImplementation((url: string | URL) => {
        const target = String(url);
        if (target.includes("commoncrawl.org")) return Promise.resolve(new Response("", { status: 200 }));
        if (target.includes("/resolve")) {
          if (resolved === "fail") return Promise.resolve(new Response("down", { status: 503 }));
          return Promise.resolve(okJson({ organic: resolved.map((link) => ({ link })), credits: 0 }));
        }
        return Promise.resolve(okJson(search));
      });
    }

    it("never counts google.com as a referring domain", async () => {
      stubCommonCrawlEmptyThen(serpWithGotoTail(["blogger.example"]), [REAL(4), REAL(5), REAL(6)]);

      const out = (await run()({ domain: "mysite.example" })).output as any;

      const domains = out.backlinks.map((b: any) => b.source_domain);
      expect(domains).not.toContain("google.com");
      expect(domains).toEqual(["blogger.example", "real-4.example", "real-5.example", "real-6.example"]);
      expect(out.referring_domains_count).toBe(4);
      expect(out.unresolved_link_count).toBe(0);
    });

    it("drops an unresolvable link and reports the absence rather than pushing google.com", async () => {
      stubCommonCrawlEmptyThen(serpWithGotoTail(["blogger.example"]), "fail");

      const out = (await run()({ domain: "mysite.example" })).output as any;

      expect(out.backlinks.map((b: any) => b.source_domain)).toEqual(["blogger.example"]);
      expect(out.referring_domains_count).toBe(1);
      expect(out.unresolved_link_count).toBe(3);
      expect(JSON.stringify(out.backlinks)).not.toContain("google.com");
    });
  });

  describe("link-returning tools hand back real URLs or a marked absence", () => {
    it("google-search resolves organic links and nulls what it cannot", async () => {
      stubSearchThenResolve(serpWithGotoTail(["a.example"]), [REAL(4), REAL(5), REAL(6)]);
      const out = (await getDirectExecutor("google-search")!({ query: "widgets" })).output as any;

      expect(out.results.map((r: any) => r.url)).toEqual([
        "https://a.example/page",
        REAL(4),
        REAL(5),
        REAL(6),
      ]);
      expect(out.results.every((r: any) => r.url_unresolved === false)).toBe(true);
      expect(out.unresolved_url_count).toBe(0);

      vi.clearAllMocks();
      stubSearchThenResolve(serpWithGotoTail(["a.example"]), "fail");
      const degraded = (await getDirectExecutor("google-search")!({ query: "widgets" })).output as any;
      expect(JSON.stringify(degraded.results)).not.toContain("/goto");
      expect(degraded.results.filter((r: any) => r.url_unresolved)).toHaveLength(3);
      expect(degraded.unresolved_url_count).toBe(3);
    });

    it("google-news-search resolves /news links", async () => {
      const news = {
        news: [
          { title: "a", link: "https://a.example/n", source: "A", date: "1h ago" },
          { title: "b", link: GOTO(4), source: "B", date: "2h ago" },
        ],
      };
      stubSearchThenResolve(news, [REAL(4)]);

      const out = (await getDirectExecutor("google-news-search")!({ query: "widgets" })).output as any;

      expect(out.results.map((r: any) => r.url)).toEqual(["https://a.example/n", REAL(4)]);
      expect(out.unresolved_url_count).toBe(0);
    });

    it("serp-related-questions never emits a wrapper as source_url", async () => {
      const search = {
        peopleAlsoAsk: [
          { question: "q1", snippet: "s", title: "t", link: GOTO(1) },
          { question: "q2", snippet: "s", title: "t", link: "https://ok.example/a" },
        ],
        relatedSearches: [{ query: "rs" }],
      };
      stubSearchThenResolve(search, "fail");

      const out = (await getDirectExecutor("serp-related-questions")!({ query: "widgets" }))
        .output as any;

      expect(out.related_questions.map((q: any) => q.source_url)).toEqual([
        null,
        "https://ok.example/a",
      ]);
      expect(out.unresolved_url_count).toBe(1);
    });

    it("adverse-media-check keeps the hit and marks the source link absent", async () => {
      // Force the Serper fallback: no Dilisense key.
      const dilisense = process.env.DILISENSE_API_KEY;
      delete process.env.DILISENSE_API_KEY;
      try {
        const search = {
          organic: [
            { title: "Acme fined for fraud", link: GOTO(1), snippet: "regulator penalty" },
            { title: "Acme lawsuit", link: "https://news.example/a", snippet: "lawsuit filed" },
          ],
        };
        stubSearchThenResolve(search, "fail");

        const out = (await getDirectExecutor("adverse-media-check")!({ name: "Acme Ltd" }))
          .output as any;

        // The finding is NOT dropped — understating risk is the worse failure.
        expect(out.total_hits).toBe(2);
        expect(out.top_articles).toHaveLength(2);
        const wrapped = out.top_articles.find((a: any) => a.headline === "Acme fined for fraud");
        expect(wrapped.source_link).toBeNull();
        expect(wrapped.source_link_unresolved).toBe(true);
        expect(out.unresolved_source_links).toBe(1);
        expect(JSON.stringify(out)).not.toContain("/goto");
      } finally {
        if (dilisense !== undefined) process.env.DILISENSE_API_KEY = dilisense;
      }
    });
  });

  describe("round-2 review findings", () => {
    it("google-search suppresses wrappers it forwards wholesale, not only results[]", async () => {
      // Before this, `sitelinks`, `answer_box` and `knowledge_graph` were
      // passed through raw, so a failed /resolve emitted the wrapper in all
      // three — and knowledgeGraph.website / .descriptionLink were invisible
      // to the walk entirely, so they leaked even on the success path.
      const search = {
        organic: [
          {
            title: "a",
            link: GOTO(1),
            snippet: "s",
            position: 1,
            sitelinks: [{ title: "sl", link: GOTO(2) }],
          },
        ],
        answerBox: { snippet: "ans", link: GOTO(3) },
        knowledgeGraph: { title: "kg", website: GOTO(4), descriptionLink: GOTO(5) },
        peopleAlsoAsk: [{ question: "q", snippet: "s", link: GOTO(6) }],
      };
      stubSearchThenResolve(search, "fail");

      const out = (await getDirectExecutor("google-search")!({ query: "widgets" })).output as any;

      expect(JSON.stringify(out)).not.toContain("/goto");
      expect(out.results[0].url).toBeNull();
      expect(out.results[0].sitelinks[0].link).toBeNull();
      expect(out.answer_box.link).toBeNull();
      expect(out.knowledge_graph.website).toBeNull();
      expect(out.knowledge_graph.descriptionLink).toBeNull();
      expect(out.people_also_ask[0].link).toBeNull();
      // The knowledge panel itself is kept — only the unusable link goes.
      expect(out.knowledge_graph.title).toBe("kg");
    });

    it("google-search resolves a wrapped knowledgeGraph.website on the success path", async () => {
      const search = {
        organic: [{ title: "a", link: "https://a.example/p", snippet: "s", position: 1 }],
        knowledgeGraph: { title: "kg", website: GOTO(4) },
      };
      stubSearchThenResolve(search, [REAL(4)]);

      const out = (await getDirectExecutor("google-search")!({ query: "widgets" })).output as any;

      expect(out.knowledge_graph.website).toBe(REAL(4));
      expect(out.unresolved_url_count).toBe(0);
    });

    it("google-search counts the nulls the caller sees, not wrappers elsewhere", async () => {
      // `resolution.unresolved.length` spanned the whole Serper response,
      // including surfaces this output never emits.
      const search = {
        organic: [
          { title: "a", link: "https://a.example/p", snippet: "s", position: 1 },
          { title: "b", link: GOTO(2), snippet: "s", position: 2 },
        ],
        // Three more wrappers in a surface the old count included.
        knowledgeGraph: { title: "kg", website: GOTO(7), descriptionLink: GOTO(8) },
      };
      stubSearchThenResolve(search, "fail");

      const out = (await getDirectExecutor("google-search")!({ query: "widgets" })).output as any;

      // One result url + the two stripped knowledge-graph links = 3 nulls the
      // caller can actually see, and every one of them IS in this output.
      expect(out.unresolved_url_count).toBe(3);
      expect(
        out.results.filter((r: any) => r.url_unresolved).length +
          [out.knowledge_graph.website, out.knowledge_graph.descriptionLink].filter(
            (v: unknown) => v === null,
          ).length,
      ).toBe(3);
    });

    it("google-news-search does not count entries it never returns", async () => {
      // num_results slices to 1; the second entry's wrapper must not be
      // counted against an output that does not contain it.
      const search = {
        news: [
          { title: "a", link: "https://a.example/n", source: "A", date: "1h ago" },
          { title: "b", link: GOTO(2), source: "B", date: "2h ago" },
        ],
      };
      stubSearchThenResolve(search, "fail");

      const out = (await getDirectExecutor("google-news-search")!({
        query: "widgets",
        num_results: 1,
      })).output as any;

      expect(out.results).toHaveLength(1);
      expect(out.unresolved_url_count).toBe(0);
    });

    it("backlink-check drops an entry with a breadcrumb but no link at all", async () => {
      // Deriving the host from the breadcrumb would have admitted a row with
      // `source_url: ""` — inflating total_backlinks and
      // referring_domains_count with an address nobody can open.
      fetchMock.mockImplementation((url: string | URL) => {
        const target = String(url);
        if (target.includes("commoncrawl.org")) return Promise.resolve(new Response("", { status: 200 }));
        if (target.includes("/resolve")) return Promise.resolve(new Response("down", { status: 503 }));
        return Promise.resolve(
          okJson({
            organic: [
              { title: "t", displayedLink: "https://blogger.example > posts", snippet: "s" },
              { title: "u", link: "https://real.example/a", snippet: "s" },
            ],
          }),
        );
      });

      const out = (await getDirectExecutor("backlink-check")!({ domain: "mysite.example" }))
        .output as any;

      expect(out.backlinks.map((b: any) => b.source_url)).toEqual(["https://real.example/a"]);
      expect(out.total_backlinks).toBe(1);
      expect(out.referring_domains_count).toBe(1);
      expect(out.backlinks.every((b: any) => b.source_url)).toBe(true);
    });

    it("serp-analyze reports where each host came from", async () => {
      const search = {
        searchParameters: { q: "x" },
        organic: [
          { title: "a", link: "https://a.example/p", snippet: "s", position: 1 },
          {
            title: "b",
            link: GOTO(4),
            displayedLink: "https://b.example > blog",
            snippet: "s",
            position: 4,
          },
          { title: "c", link: GOTO(5), snippet: "s", position: 5 },
        ],
      };
      stubSearchThenResolve(search, "fail");

      const out = (await getDirectExecutor("serp-analyze")!({ keyword: "widgets" })).output as any;

      expect(out.organic_results.map((r: any) => r.domain_source)).toEqual([
        "url",
        "breadcrumb",
        "none",
      ]);
      expect(out.link_resolution).toEqual({ attempted: true, unresolved_results: 2 });
    });
  });
});
