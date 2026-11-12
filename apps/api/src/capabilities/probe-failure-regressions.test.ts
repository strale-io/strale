/**
 * Promise-audit T1 wave 4: follow-ups (18) and (23) in the T1 note.
 *
 * - domain-reputation (23): its HTTPS check graded every failure of the HEAD
 *   probe as "HTTPS connection failed" and billed it, including failures that
 *   say nothing about the domain's HTTPS: a ToS-blocklisted domain (Strale's
 *   own refusal), a redirect to a private address (a refused URL), a redirect
 *   loop and the probe's own 8 s timeout. Only a failure at the network or
 *   TLS layer of the domain itself is graded now; the others throw, unbilled.
 * - robots-txt-parse (18): an HTML page served with 200 at /robots.txt (a
 *   soft 404) was returned as a robots.txt that exists with no rules. It now
 *   reads as no robots.txt, the same answer a 404 gives.
 *
 * Each test uses its own host: robots.txt answers are cached per origin.
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
  const result = await call.then(
    (r) => ({ returned: r }),
    (e: unknown) => ({ thrown: e }),
  );
  expect("returned" in result ? (result.returned as any).output : null, "graded and billed as a finding").toBeNull();
  const outcome = outcomeFromError((result as { thrown: unknown }).thrown);
  expect(outcome.billable).toBe(false);
  expect(outcome.counts_against_capability).toBe(false);
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
    await expectUnbilled(run("domain-reputation", { domain: "private-hop.example.com" }));
  });

  it("does not grade a redirect loop as an HTTPS failure", async () => {
    let n = 0;
    serve(() => new Response(null, { status: 302, headers: { location: `https://loop.example.com/${++n}` } }));
    const outcome = await expectUnbilled(run("domain-reputation", { domain: "loop.example.com" }));
    expect(outcome.error_message).toMatch(/kept redirecting/);
  });

  it("does not grade its own probe timeout as an HTTPS failure", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const outcome = await expectUnbilled(run("domain-reputation", { domain: "slow.example.com" }));
    expect(outcome.retryable).toBe(true);
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
    expect(output.exists).toBe(false);
    expect(output.rules).toBeUndefined();
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
