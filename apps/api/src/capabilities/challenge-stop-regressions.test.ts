/**
 * Regressions from the independent reviews of promise-audit T1 wave 3, for
 * executors the upstream-failure replay does not reach (no recording) or
 * reaches only through safeFetch's own challenge stop.
 *
 * - domain-reputation: a site that challenges Strale was billed as "HTTPS
 *   connection failed", a false finding.
 * - youtube-summarize: a challenged watch page fell through to a rendered
 *   fetch of the same page, a retry after a block (DEC-20261023-A).
 * - sitemap-parse: an HTML page without challenge markers, served at the
 *   sitemap URL, was billed as an empty sitemap.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { loadExecutor, loadManifest } from "../test-helpers/known-answer-contract.js";
import { outcomeFromError } from "../lib/execution-outcome.js";

const dnsStub = vi.hoisted(() => {
  const empty = async () => [];
  const api = {
    resolve4: async () => ["93.184.216.34"],
    resolve6: empty,
    resolveMx: empty,
    resolveTxt: empty,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  };
  return { ...api, default: api };
});
vi.mock("dns/promises", () => dnsStub);
vi.mock("node:dns/promises", () => dnsStub);

const rendered = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./lib/browserless-extract.js", async (orig) => ({
  ...(await orig<object>()),
  fetchRenderedHtml: async () => {
    rendered.calls++;
    return "<html></html>";
  },
}));

const CHALLENGE =
  '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>' +
  '<script>window._cf_chl_opt={cType:"managed"};</script></body></html>';

function serve(answer: (url: string) => Response) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const r = answer(url);
    Object.defineProperty(r, "url", { value: url });
    return r;
  });
}

function challenge(): Response {
  return new Response(CHALLENGE, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cf-mitigated": "challenge" },
  });
}

async function run(slug: string, input: Record<string, unknown>) {
  const executor = await loadExecutor(loadManifest(slug));
  if (!executor) throw new Error(`${slug}: no executor registered`);
  return executor(input);
}

afterEach(() => {
  vi.unstubAllGlobals();
  rendered.calls = 0;
});

describe("challenge stop: executors the replay does not cover", () => {
  it("domain-reputation refuses, unbilled, instead of reporting HTTPS as failed", async () => {
    serve((url) => (url.endsWith("/robots.txt") ? new Response("", { status: 404 }) : challenge()));
    const err = await run("domain-reputation", { domain: "example.com" }).catch((e: unknown) => e);
    expect(err, "a challenged site was graded as an HTTPS failure").toBeInstanceOf(Error);
    expect(outcomeFromError(err).failure_class).toBe("capability_refused");
  });

  it("youtube-summarize does not render a watch page that challenged it", async () => {
    serve((url) => (url.endsWith("/robots.txt") ? new Response("", { status: 404 }) : challenge()));
    await expect(run("youtube-summarize", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).rejects.toThrow();
    expect(rendered.calls, "retried a blocked page through Browserless").toBe(0);
  });

  it("sitemap-parse refuses an HTML page served at the sitemap URL", async () => {
    const page = "<!DOCTYPE html><html><head><title>Page not found</title></head><body>" + "x".repeat(200) + "</body></html>";
    serve((url) =>
      url.endsWith("/robots.txt")
        ? new Response("", { status: 404 })
        : new Response(page, { status: 200, headers: { "content-type": "application/xml" } }),
    );
    await expect(run("sitemap-parse", { url: "https://example.com/sitemap.xml" })).rejects.toThrow(/not appear to be a sitemap/);
  });
});
