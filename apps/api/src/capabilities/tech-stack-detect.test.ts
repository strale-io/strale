/**
 * tech-stack-detect end to end with a recorded page, headers and DNS.
 *
 * Fixtures are synthetic. The asserts cover what the capability is for:
 * technologies from the homepage, its headers and public DNS, with versions;
 * every existing output field still present; and an upstream failure
 * surfacing as an error (or, for DNS, as a stated warning) instead of as an
 * empty `technologies` list that reads like a finding.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock, lookupTechDns } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  lookupTechDns: vi.fn(),
}));

vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/robots-txt.js", () => ({
  assertRobotsAllowed: vi.fn(async () => {}),
  assertRedirectAllowed: vi.fn(async () => {}),
}));
vi.mock("./lib/tech-dns.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/tech-dns.js")>()),
  lookupTechDns,
}));

import { getDirectExecutor } from "./index.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import "./tech-stack-detect.js";

type Dns = Awaited<ReturnType<typeof import("./lib/tech-dns.js").lookupTechDns>>;

function dnsResult(partial: Partial<Dns> = {}): Dns {
  return {
    mx: [], txt: [], ns: [], cname: [], a: [],
    status: { a: "empty", mx: "empty", txt: "empty", ns: "empty", cname: "empty" },
    overall: "ok",
    failures: [],
    ...partial,
  };
}

const PAGE = `<!doctype html><html><head>
  <meta name="generator" content="WordPress 6.4.2">
  <script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST01"></script>
  <script src="https://cdn.weglot.com/weglot.min.js"></script>
  <script src="/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"></script>
</head><body><h1>Hello</h1></body></html>`;

function page(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", ...init.headers },
  });
}

async function run(input: Record<string, unknown> = { url: "https://site.test" }) {
  const exec = getDirectExecutor("tech-stack-detect");
  expect(exec).toBeDefined();
  return exec!(input);
}

async function failure(input: Record<string, unknown> = { url: "https://site.test" }): Promise<unknown> {
  return run(input).then(() => null, (e: unknown) => e);
}

beforeEach(() => {
  safeFetchMock.mockReset();
  lookupTechDns.mockReset();
  safeFetchMock.mockImplementation(async () => page(PAGE, { headers: { server: "nginx/1.24.0 (Ubuntu)", "x-powered-by": "PHP/8.2.10", "set-cookie": "PHPSESSID=abc; path=/" } }));
  lookupTechDns.mockResolvedValue(dnsResult({
    mx: [{ exchange: "aspmx.l.google.com", priority: 1 }],
    txt: ["v=spf1 include:sendgrid.net ~all"],
    ns: ["ada.ns.cloudflare.com"],
    status: { a: "empty", mx: "ok", txt: "ok", ns: "ok", cname: "empty" },
  }));
});

describe("coverage and versions", () => {
  it("combines the homepage, its headers and public DNS", async () => {
    const { output } = await run();
    const techs = output.technologies as Array<{ name: string; category: string; confidence: string; evidence: string; version: string | null }>;
    const byName = Object.fromEntries(techs.map((t) => [t.name, t]));

    // homepage
    expect(byName["Google Tag Manager"]).toBeDefined();
    expect(byName.Weglot).toBeDefined();
    // headers
    expect(byName.Nginx.version).toBe("1.24.0");
    expect(byName.PHP.version).toBe("8.2.10");
    expect(byName.Ubuntu).toBeDefined();
    // DNS
    expect(byName["Google Workspace"].evidence).toBe("DNS MX record aspmx.l.google.com");
    expect(byName.SendGrid).toBeDefined();
    expect(byName["Cloudflare DNS"]).toBeDefined();
    // versions stated by the page
    expect(byName.WordPress.version).toBe("6.4.2");
    expect(byName.jQuery.version).toBe("3.7.1");
    expect(output.technologies_detected).toBe(techs.length);
  });

  it("asks DNS about the registrable domain and both hosts' CNAMEs", async () => {
    safeFetchMock.mockImplementation(async () => {
      const r = page(PAGE);
      Object.defineProperty(r, "url", { value: "https://www.shop.example.co.uk/" });
      return r;
    });
    await run({ domain: "shop.example.co.uk" });
    expect(lookupTechDns).toHaveBeenCalledWith({
      domain: "example.co.uk",
      cnameHosts: ["shop.example.co.uk", "www.shop.example.co.uk"],
    });
  });

  it("keeps every field the capability returned before, and adds version", async () => {
    const { output } = await run();
    expect(Object.keys(output)).toEqual(expect.arrayContaining(["url", "technologies_detected", "technologies", "by_category", "signals"]));
    const first = (output.technologies as Array<Record<string, unknown>>)[0];
    expect(Object.keys(first).sort()).toEqual(["category", "confidence", "evidence", "name", "version"]);
    expect(Object.keys(output.signals as object)).toEqual(expect.arrayContaining(["has_analytics", "has_chat_widget", "has_payment_processing", "has_marketing_automation", "has_error_monitoring"]));
    expect(output.by_category).toMatchObject({ "tag-manager": ["Google Tag Manager"] });
    expect((output.signals as Record<string, boolean>).has_tag_manager).toBe(true);
  });

  it("says in every result what it could and could not see", async () => {
    const { output } = await run();
    expect(output.coverage_note).toMatch(/homepage, its response headers and public DNS/);
    expect(output.coverage_note).toMatch(/not every technology/);
    expect(output.dns).toMatchObject({ status: "ok", records_found: { mx: 1, txt: 1, ns: 1, cname: 0 } });
  });

  it("reads set-cookie names as a signal when no header or markup shows the tool", async () => {
    safeFetchMock.mockImplementation(async () => page("<html><body>hi</body></html>", { headers: { "set-cookie": "laravel_session=abc; path=/; HttpOnly" } }));
    lookupTechDns.mockResolvedValue(dnsResult());
    const { output } = await run();
    const byName = Object.fromEntries((output.technologies as Array<{ name: string; evidence: string }>).map((t) => [t.name, t]));
    expect(byName.Laravel.evidence).toBe("cookie laravel_session");
    expect(byName.PHP.evidence).toBe("implied by Laravel");
    expect(JSON.stringify(output)).not.toContain("abc");
  });
});

describe("failures are errors, not empty results", () => {
  it("an HTTP 500 is an error naming the status", async () => {
    safeFetchMock.mockImplementation(async () => page("oops", { status: 500 }));
    const err = await failure();
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/HTTP 500/);
  });

  it("a network failure rejects, not an empty list", async () => {
    safeFetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await failure();
    expect((err as Error).message).toMatch(/fetch failed/);
  });

  it("an empty page is an error", async () => {
    safeFetchMock.mockImplementation(async () => page("   \n  "));
    const err = await failure();
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/empty page/);
  });

  it("a response that is not a web page is a refusal that names the input", async () => {
    safeFetchMock.mockImplementation(async () => new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } }));
    const err = await failure({ url: "https://site.test/file.pdf" });
    expect(isCapabilityRefusal(err)).toBe(true);
    expect((err as Error).message).toMatch(/application\/pdf/);
  });

  it("a DNS fault is reported in the result and not folded into an empty DNS signal", async () => {
    lookupTechDns.mockResolvedValue(dnsResult({
      status: { a: "empty", mx: "failed", txt: "failed", ns: "failed", cname: "failed" },
      overall: "unavailable",
      failures: [{ type: "MX", code: "ETIMEOUT" }, { type: "TXT", code: "ETIMEOUT" }],
    }));
    const { output } = await run();
    expect(output.dns).toMatchObject({ status: "unavailable", failed_lookups: ["MX", "TXT"] });
    expect((output.warnings as string[]).join(" ")).toMatch(/DNS lookups failed \(MX: ETIMEOUT, TXT: ETIMEOUT\)/);
    // The homepage result is still returned.
    expect((output.technologies as Array<{ name: string }>).map((t) => t.name)).toContain("WordPress");
  });

  it("a page with nothing recognisable says so instead of implying the site uses nothing", async () => {
    safeFetchMock.mockImplementation(async () => page("<html><body><p>plain</p></body></html>"));
    lookupTechDns.mockResolvedValue(dnsResult());
    const { output } = await run();
    expect(output.technologies).toEqual([]);
    expect(output.technologies_detected).toBe(0);
    expect((output.warnings as string[]).join(" ")).toMatch(/does not mean none is in use/);
  });
});
