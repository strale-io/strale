/**
 * Promise-audit T1 wave 4: follow-ups (18) and (23) in the T1 note.
 *
 * - domain-reputation (23): its HTTPS check graded every failure of the HEAD
 *   probe as "HTTPS connection failed" and billed it, including failures that
 *   say nothing about the domain's HTTPS: a ToS-blocklisted domain (Strale's
 *   own refusal), a redirect to a private address (a refused URL) and
 *   Strale's own SSRF block. Those throw now, unbilled. A redirect chain
 *   past safeFetch's cap is graded on the 3xx it ends at (HTTPS answered),
 *   and no answer within 8 s keeps its grade under its own issue text.
 * - robots-txt-parse (18): an HTML page served with 200 at /robots.txt (a
 *   soft 404) was returned as a robots.txt that exists with no rules. It now
 *   reads as no robots.txt, the same answer a 404 gives. Follow-up (27):
 *   the same soft 404 answered as JSON or plain text ("Not found") does too,
 *   while an empty file or one of comments only still exists with no rules.
 *
 * Each test uses its own host: robots.txt answers are cached per origin.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { loadExecutor, loadManifest } from "../test-helpers/known-answer-contract.js";
import { outcomeFromError, outcomeFromOutput } from "../lib/execution-outcome.js";

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

function serve(answer: (url: string) => Response) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const r = answer(url);
    Object.defineProperty(r, "url", { value: url });
    return r;
  });
}

async function run(slug: string, input: Record<string, unknown>) {
  const executor = await loadExecutor(loadManifest(slug));
  if (!executor) throw new Error(`${slug}: no executor registered`);
  return executor(input) as Promise<{ output: Record<string, any> }>;
}

/** The call must throw (a throw is never billed) and not count against the capability. */
async function expectUnbilled(call: Promise<unknown>) {
  const outcome = await expectThrown(call);
  expect(outcome.counts_against_capability).toBe(false);
  return outcome;
}

/**
 * Strale's own resolver failing for now: thrown, unbilled and retried, filed
 * as the DNS checks file it (the provider's fault, not the domain's).
 */
async function expectResolverRetry(call: Promise<unknown>) {
  const outcome = await expectThrown(call);
  expect(outcome.retryable).toBe(true);
  expect(outcome.fault).toBe("provider");
}

async function expectThrown(call: Promise<unknown>) {
  const result = await call.then(
    (r) => ({ returned: r }),
    (e: unknown) => ({ thrown: e }),
  );
  expect("returned" in result ? (result.returned as any).output : null, "graded and billed as a finding").toBeNull();
  const outcome = outcomeFromError((result as { thrown: unknown }).thrown);
  expect(outcome.billable).toBe(false);
  return outcome;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("domain-reputation grades only the domain's own HTTPS failure (follow-up 23)", () => {
  it("refuses a ToS-blocklisted domain rather than grading its HTTPS as failed", async () => {
    let fetched = 0;
    vi.stubGlobal("fetch", async () => {
      fetched++;
      return new Response(null, { status: 200 });
    });
    const outcome = await expectUnbilled(run("domain-reputation", { domain: "trustpilot.com" }));
    expect(outcome.failure_class).toBe("capability_refused");
    expect(fetched, "fetched a blocklisted host").toBe(0);
  });

  it("refuses a redirect to a private address rather than grading it", async () => {
    serve(() => new Response(null, { status: 301, headers: { location: "http://127.0.0.1/" } }));
    const outcome = await expectUnbilled(run("domain-reputation", { domain: "private-hop.example.com" }));
    expect(outcome.fault).toBe("caller");
    expect(outcome.error_message).toBe(
      "private-hop.example.com redirected to a URL Strale did not follow. This URL targets a restricted address.",
    );
  });

  it("grades on the domain's own redirect when the hop it leads to does not answer", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://own-redirect.example.com")) {
        const r = new Response(null, {
          status: 301,
          headers: { location: "https://slow-shop.example.net/", "strict-transport-security": "max-age=1" },
        });
        Object.defineProperty(r, "url", { value: url });
        return r;
      }
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const { output } = await run("domain-reputation", { domain: "own-redirect.example.com" });
    expect(output.checks.https_works).toBe(true);
    expect(output.checks.https_status).toBe(301);
    expect(output.issues).not.toContain("HTTPS did not answer within 8 seconds");
    expect(outcomeFromOutput("domain-reputation", output).billable).toBe(true);
  });

  it("asks the domain itself first and follows its redirect for the site's headers", async () => {
    const asked: string[] = [];
    serve((url) => {
      asked.push(url);
      return url.startsWith("https://hop.example.com")
        ? new Response(null, { status: 301, headers: { location: "https://www.hop.example.com/" } })
        : new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=1", "x-content-type-options": "nosniff" } });
    });
    const { output } = await run("domain-reputation", { domain: "hop.example.com" });
    expect(asked).toEqual(["https://hop.example.com/", "https://www.hop.example.com/"]);
    expect(output.checks.https_status).toBe(200);
    expect(output.issues).toEqual([]);
  });

  it("names why a redirect was not followed when its scheme is refused", async () => {
    serve(() => new Response(null, { status: 301, headers: { location: "ftp://files.example.com/" } }));
    const outcome = await expectUnbilled(run("domain-reputation", { domain: "ftp-hop.example.com" }));
    expect(outcome.error_message).toMatch(/^ftp-hop\.example\.com redirected to a URL Strale did not follow\. /);
    expect(outcome.error_message).not.toContain("restricted address");
  });

  it("grades a redirect chain past the cap on the 3xx it ends at, not as a failure", async () => {
    let n = 0;
    serve(() =>
      new Response(null, {
        status: 302,
        headers: { location: `https://longchain.example.com/${++n}`, "strict-transport-security": "max-age=1" },
      }),
    );
    const { output } = await run("domain-reputation", { domain: "longchain.example.com" });
    expect(output.checks.https_works).toBe(true);
    expect(output.checks.https_status).toBe(302);
    expect(output.checks.has_hsts).toBe(true);
    expect(output.issues).not.toContain("HTTPS connection failed");
  });

  it("grades no answer within 8 s under its own issue, not as a refused connection", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const { output } = await run("domain-reputation", { domain: "slow.example.com" });
    expect(output.checks.https_works).toBe(false);
    expect(output.issues).toContain("HTTPS did not answer within 8 seconds");
    expect(output.issues).not.toContain("HTTPS connection failed");
  });

  it("still grades a TLS failure of the domain itself", async () => {
    vi.stubGlobal("fetch", async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" }),
      });
    });
    const { output } = await run("domain-reputation", { domain: "expired.example.com" });
    expect(output.checks.https_works).toBe(false);
    expect(output.issues).toContain("HTTPS connection failed");
  });

  it("does not grade a temporary failure of Strale's own resolver", async () => {
    vi.stubGlobal("fetch", async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("getaddrinfo EAI_AGAIN"), { code: "EAI_AGAIN" }),
      });
    });
    await expectResolverRetry(run("domain-reputation", { domain: "resolver.example.com" }));
  });

  it("does not grade a bare EAI_AGAIN either", async () => {
    vi.stubGlobal("fetch", async () => {
      throw Object.assign(new Error("getaddrinfo EAI_AGAIN bare.example.com"), { code: "EAI_AGAIN" });
    });
    await expectResolverRetry(run("domain-reputation", { domain: "bare.example.com" }));
  });

  it("refuses Strale's own connect-time SSRF block rather than grading it", async () => {
    vi.stubGlobal("fetch", async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("blocked private address"), { code: "ESSRFBLOCKED" }),
      });
    });
    await expectUnbilled(run("domain-reputation", { domain: "rebind.example.com" }));
  });
});

describe("robots-txt-parse reads an HTML soft 404 as no robots.txt (follow-up 18)", () => {
  it("returns exists:false for an HTML page served with 200", async () => {
    const page = "<!DOCTYPE html><html><head><title>Not found</title></head><body><h1>Oops</h1></body></html>";
    serve(() => new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    const { output } = await run("robots-txt-parse", { url: "https://soft404.example.com" });
    expect(output).toEqual({
      url: "https://soft404.example.com/robots.txt",
      exists: false,
      message: "No robots.txt found: the site answered with an HTML page.",
      rules: [],
      sitemaps: [],
      user_agents: [],
      blocks_all_crawlers: false,
    });
    expect(outcomeFromOutput("robots-txt-parse", output).billable, "no robots.txt is a real answer").toBe(true);
  });

  it("gives a 404 the fields the manifest guarantees", async () => {
    serve(() => new Response("", { status: 404 }));
    const { output } = await run("robots-txt-parse", { url: "https://missing.example.com" });
    expect(output).toMatchObject({ exists: false, message: "No robots.txt found.", rules: [], sitemaps: [], user_agents: [] });
    expect(output.blocks_all_crawlers).toBe(false);
  });

  it("keeps a robots.txt that opens with an HTML-style comment and has rules", async () => {
    serve(() => new Response("<!-- managed by CMS -->\nUser-agent: *\nDisallow: /tmp\n", { status: 200 }));
    const { output } = await run("robots-txt-parse", { url: "https://htmlcomment.example.com" });
    expect(output.exists).toBe(true);
    expect(output.total_disallow_rules).toBe(1);
  });

  it("reads an HTML page after a byte-order mark as no robots.txt", async () => {
    serve(() => new Response("\uFEFF<html><body>Home</body></html>", { status: 200, headers: { "content-type": "text/html" } }));
    const { output } = await run("robots-txt-parse", { url: "https://bom.example.com" });
    expect(output.exists).toBe(false);
  });

  it("reads an HTML page as no robots.txt even when it is served as text/plain", async () => {
    serve(() => new Response("<html><body>Welcome</body></html>", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://plainhtml.example.com" });
    expect(output.exists).toBe(false);
  });

  it("keeps an empty robots.txt as one that exists with no rules", async () => {
    serve(() => new Response("", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://empty.example.com" });
    expect(output.exists).toBe(true);
    expect(output.total_rules).toBe(0);
  });

  it("keeps a real robots.txt served as text/html", async () => {
    serve(() => new Response("User-agent: *\nDisallow: /admin\n", { status: 200, headers: { "content-type": "text/html" } }));
    const { output } = await run("robots-txt-parse", { url: "https://mislabelled.example.com" });
    expect(output.exists).toBe(true);
    expect(output.total_disallow_rules).toBe(1);
  });
});

describe("robots-txt-parse reads a non-HTML soft 404 as no robots.txt (follow-up 27)", () => {
  const NOT_A_ROBOTS_TXT = "No robots.txt found: the site answered with a page that is not a robots.txt.";

  it("returns exists:false for a JSON error served with 200", async () => {
    serve(() => new Response('{"error":"Not found","status":404}', { status: 200, headers: { "content-type": "application/json" } }));
    const { output } = await run("robots-txt-parse", { url: "https://jsonsoft404.example.com" });
    expect(output).toEqual({
      url: "https://jsonsoft404.example.com/robots.txt",
      exists: false,
      message: NOT_A_ROBOTS_TXT,
      rules: [],
      sitemaps: [],
      user_agents: [],
      blocks_all_crawlers: false,
    });
    expect(outcomeFromOutput("robots-txt-parse", output).billable, "no robots.txt is a real answer").toBe(true);
  });

  it("returns exists:false for a plain-text 'Not found' served with 200", async () => {
    serve(() => new Response("Not found", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://textsoft404.example.com" });
    expect(output).toMatchObject({ exists: false, message: NOT_A_ROBOTS_TXT, rules: [], sitemaps: [], user_agents: [] });
    expect(outcomeFromOutput("robots-txt-parse", output).billable, "no robots.txt is a real answer").toBe(true);
  });

  it("returns exists:false for a multi-line plain-text error page", async () => {
    serve(() => new Response("404 page not found\nThe requested URL was not found on this server.\n", { status: 200 }));
    const { output } = await run("robots-txt-parse", { url: "https://multiline404.example.com" });
    expect(output.exists).toBe(false);
  });

  it("returns exists:false for a JSON array served with 200", async () => {
    serve(() => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    const { output } = await run("robots-txt-parse", { url: "https://jsonarray.example.com" });
    expect(output.exists).toBe(false);
  });

  it("returns exists:false for plain-text errors that open with a directive word", async () => {
    for (const [host, body] of [["waf.example.com", "User agent not allowed"], ["nohost.example.com", "Host not found"], ["nositemap.example.com", "Sitemap not available"]]) {
      serve(() => new Response(body, { status: 200, headers: { "content-type": "text/plain" } }));
      const { output } = await run("robots-txt-parse", { url: `https://${host}` });
      expect(output.exists, body).toBe(false);
    }
  });

  it("keeps a robots.txt of comments only as one that exists with no rules", async () => {
    serve(() => new Response("# Allow everything\n# contact: webmaster@example.com\n", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://commentsonly.example.com" });
    expect(output.exists).toBe(true);
    expect(output.total_rules).toBe(0);
  });

  it("keeps a robots.txt whose only directive is one this parser does not tabulate", async () => {
    serve(() => new Response("Host: www.example.com\n", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://hostonly.example.com" });
    expect(output.exists).toBe(true);
  });

  it("keeps a robots.txt with a Disallow line and no User-agent line", async () => {
    serve(() => new Response("Disallow: /private\n", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://noagent.example.com" });
    expect(output.exists).toBe(true);
  });

  it("keeps a robots.txt written without colons, as Google's parser reads it", async () => {
    serve(() => new Response("User-agent *\nDisallow /\n", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://nocolon.example.com" });
    expect(output.exists).toBe(true);
  });

  it("keeps a robots.txt with misspelled directives", async () => {
    serve(() => new Response("Useragent: *\nDisalow: /\n", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://typo.example.com" });
    expect(output.exists).toBe(true);
  });

  it("keeps a robots.txt whose only directives are publisher extensions", async () => {
    serve(() => new Response("Content-Usage: train-ai=n\nACAP-crawler: *\n", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://publisher.example.com" });
    expect(output.exists).toBe(true);
  });

  it("keeps a robots.txt whose directives are in upper case", async () => {
    serve(() => new Response("USER-AGENT: *\nDISALLOW: /x\n", { status: 200, headers: { "content-type": "text/plain" } }));
    const { output } = await run("robots-txt-parse", { url: "https://uppercase.example.com" });
    expect(output.exists).toBe(true);
    expect(output.total_disallow_rules).toBe(1);
  });
});
