/**
 * Swallowed-upstream-failure fixes, wave 2d: port-check (audit row 30),
 * og-image-check (31), domain-contact-extract (32), protocol-fees-lookup (33)
 * and ens-reverse-lookup (35);
 * archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md.
 *
 * Each billed a normal answer when the thing that decides it had not
 * answered: a port "closed" because the host name did not resolve, an
 * og:image "returns non-200" because the image host timed out, no contacts
 * because the contact page failed, null revenue because the revenue request
 * failed, and an ENS name "unverified" because the RPC call failed. Each now
 * throws, unbilled. The real answers keep their output and stay billed.
 *
 * Describe blocks are tagged: "failure:" tests fail against the pre-fix
 * executors; "negative:" and "passthrough:" tests pass against both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError, TimeoutError as ViemTimeoutError } from "viem";

const { safeFetchMock, connectTcpVetted, getEnsName, getEnsAddress } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  connectTcpVetted: vi.fn(),
  getEnsName: vi.fn(),
  getEnsAddress: vi.fn(),
}));

vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/vetted-connect.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/vetted-connect.js")>()),
  connectTcpVetted,
}));
vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/url-validator.js")>()),
  validateHost: vi.fn().mockResolvedValue(undefined),
  validateUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => ({ getEnsName, getEnsAddress }),
}));

import { getDirectExecutor } from "./index.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import { outcomeFromError, assertBillableOutput } from "../lib/execution-outcome.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { UrlValidationError, validateUrl } from "../lib/url-validator.js";
import "./port-check.js";
import "./og-image-check.js";
import "./domain-contact-extract.js";
import "./protocol-fees-lookup.js";
import "./ens-reverse-lookup.js";

type Out = Record<string, any>;

function exec(slug: string) {
  const fn = getDirectExecutor(slug);
  if (!fn) throw new Error(`${slug} is not registered`);
  return fn;
}

async function thrown(promise: Promise<unknown>): Promise<Error & { retryable?: boolean }> {
  return promise.then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e as Error & { retryable?: boolean },
  );
}

async function expectUnbilledUpstreamFailure(promise: Promise<unknown>): Promise<Error & { retryable?: boolean }> {
  const err = await thrown(promise);
  expect(err.name).toBe("UpstreamUnavailableError");
  expect(err.message).not.toMatch(/not found|invalid|missing|required/i);
  expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
  return err;
}

/** The caller's own target failed: unbilled, breaker-exempt by wording, not this capability's fault. */
async function expectUnbilledTargetFailure(promise: Promise<unknown>): Promise<Error & { retryable?: boolean }> {
  const err = await expectUnbilledUpstreamFailure(promise);
  expect(isUserInputError(err.message)).toBe(true);
  expect(outcomeFromError(err)).toMatchObject({ fault: "target", counts_against_capability: false });
  return err;
}

/** A source Strale depends on failed: unbilled, and it counts against the capability. */
async function expectUnbilledProviderFailure(promise: Promise<unknown>): Promise<Error & { retryable?: boolean }> {
  const err = await expectUnbilledUpstreamFailure(promise);
  expect(outcomeFromError(err)).toMatchObject({ fault: "provider", counts_against_capability: true });
  return err;
}

async function billed(slug: string, promise: Promise<unknown>): Promise<Out> {
  const { output } = (await promise) as { output: Out };
  expect(() => assertBillableOutput(slug, output)).not.toThrow();
  return output;
}

const status = (code: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status: code, headers });
const json = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
const networkError = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
const errno = (code: string) => Object.assign(new Error(`connect ${code}`), { code });

/**
 * Transport failures that do not say whose they were (promise-audit T1
 * follow-up 34): a resolver failing for now, and a network error with no code.
 */
const notTheSite: Array<[string, () => Promise<Response>]> = [
  ["EAI_AGAIN wrapped by fetch", async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "EAI_AGAIN" } }); }],
  ["a bare EAI_AGAIN", async () => { throw Object.assign(new Error("getaddrinfo EAI_AGAIN"), { code: "EAI_AGAIN" }); }],
  ["a network error with no code", async () => { throw Object.assign(new TypeError("fetch failed"), { cause: {} }); }],
];

/** Transport failures that are the far end's, retryable. */
const transient: Array<[string, () => Promise<Response>]> = [
  ["HTTP 503", async () => status(503)],
  ["a network error", async () => { throw networkError(); }],
  ["a timeout", async () => { throw timeout(); }],
];

let fetchMock: ReturnType<typeof vi.fn>;
const savedAlchemyKey = process.env.ALCHEMY_API_KEY;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  safeFetchMock.mockReset();
  connectTcpVetted.mockReset();
  getEnsName.mockReset();
  getEnsAddress.mockReset();
  __resetRobotsCacheForTests();
  process.env.ALCHEMY_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedAlchemyKey === undefined) delete process.env.ALCHEMY_API_KEY;
  else process.env.ALCHEMY_API_KEY = savedAlchemyKey;
});

// ─── port-check (row 30) ────────────────────────────────────────────────────

/** Each port answers as `answers` says: "open", or the errno its connect fails with. */
function ports(answers: Record<number, string>) {
  connectTcpVetted.mockImplementation(async ({ port }: { port: number }) => {
    const a = answers[port];
    if (a === "open") return { destroy: () => {} };
    throw errno(a);
  });
}
const portCheck = (p: number[]) => exec("port-check")({ host: "host.test", ports: p, timeout_ms: 1000 });

describe("port-check failure: a host Strale cannot reach is not a closed port (row 30)", () => {
  it.each([
    ["ENOTFOUND", false],
    ["ENETUNREACH", true],
    ["ECONNRESET", true],
  ])("connect %s throws, unbilled, as the target's failure", async (code, retryable) => {
    ports({ 22: code, 443: code });
    const err = await expectUnbilledTargetFailure(portCheck([22, 443]));
    expect(err.message).toContain("host host.test");
    expect(err.message).toContain(code);
    expect(err.retryable).toBe(retryable);
  });

  // promise-audit T1 follow-up 34: EAI_AGAIN is Strale's own resolver failing
  // for now, not the caller's host, so it counts against port-check.
  it("connect EAI_AGAIN throws, unbilled and retryable, as port-check's own failure", async () => {
    ports({ 22: "EAI_AGAIN", 443: "EAI_AGAIN" });
    const err = await expectUnbilledProviderFailure(portCheck([22, 443]));
    // Counted, so its message reaches the breaker: no caller host in it.
    expect(err.message).not.toContain("host.test");
    expect(err.message).toContain("network error (EAI_AGAIN)");
    expect(err.retryable).toBe(true);
    expect(isUserInputError(err.message)).toBe(false);
  });

  it("a name that fails to resolve on one port fails the call even when another port is open", async () => {
    ports({ 443: "open", 22: "ENOTFOUND" });
    await expectUnbilledTargetFailure(portCheck([443, 22]));
  });

  it.each(["EHOSTUNREACH", "EHOSTDOWN"])("%s on every port throws: nothing shows the host was reached", async (code) => {
    ports({ 22: code, 443: code });
    await expectUnbilledTargetFailure(portCheck([22, 443]));
  });

  it("Strale's own SSRF refusal is thrown as itself, not reported closed", async () => {
    const refused = Object.assign(new Error("Resolved host targets a restricted address."), { code: "ESSRFBLOCKED" });
    connectTcpVetted.mockRejectedValue(refused);
    await expect(portCheck([443])).rejects.toBe(refused);
    expect(outcomeFromError(refused)).toMatchObject({ billable: false });
  });
});

describe("port-check negative: refused, silent and open ports are answers, billed", () => {
  it("a refused port is closed", async () => {
    ports({ 22: "ECONNREFUSED" });
    const out = await billed("port-check", portCheck([22]));
    expect(out).toMatchObject({ ports_scanned: 1, open_count: 0, closed_count: 1 });
    expect(out.closed_ports[0]).toMatchObject({ port: 22, open: false });
  });

  it("a port that does not answer within the timeout is not open", async () => {
    ports({ 22: "ETIMEDOUT" });
    const out = await billed("port-check", portCheck([22]));
    expect(out).toMatchObject({ open_count: 0, closed_count: 1 });
  });

  it("an open port is open", async () => {
    ports({ 443: "open" });
    const out = await billed("port-check", portCheck([443]));
    expect(out).toMatchObject({ open_count: 1, closed_count: 0 });
    expect(out.open_ports[0]).toMatchObject({ port: 443, open: true, service: "HTTPS" });
  });

  it("an ICMP unreachable beside a port the host answered for is not open", async () => {
    ports({ 443: "open", 25: "EHOSTUNREACH" });
    const out = await billed("port-check", portCheck([443, 25]));
    expect(out).toMatchObject({ open_count: 1, closed_count: 1 });
  });
});

describe("port-check failure: each port says which kind of not-open it is", () => {
  it("closed, filtered and open are told apart in `state`", async () => {
    ports({ 443: "open", 22: "ECONNREFUSED", 3306: "ETIMEDOUT", 25: "EHOSTUNREACH" });
    const out = await billed("port-check", portCheck([443, 22, 3306, 25]));
    const state = Object.fromEntries([...out.open_ports, ...out.closed_ports].map((p: Out) => [p.port, p.state]));
    expect(state).toEqual({ 443: "open", 22: "closed", 3306: "filtered", 25: "filtered" });
  });
});

// ─── og-image-check (row 31) ────────────────────────────────────────────────

const OG_PAGE = `<html><head>
<meta property="og:image" content="https://img.test/card.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Card"><meta property="og:title" content="Site">
<meta property="og:description" content="About"><meta name="twitter:card" content="summary_large_image">
</head><body></body></html>`;
const NON_200 = "og:image URL returns non-200 status";

/** The page answers OG_PAGE; the image answers `image(method)`. */
function ogSite(image: (method: string) => Promise<Response>) {
  safeFetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (String(url).startsWith("https://img.test/")) return image(init?.method ?? "GET");
    return status(200, OG_PAGE, { "content-type": "text/html" });
  });
}
const ogCheck = () => exec("og-image-check")({ url: "https://site.test" });

describe("og-image-check failure: an image check that failed is not a broken image (row 31)", () => {
  it.each([...transient, ["HTTP 408", async () => status(408)] as [string, () => Promise<Response>]])(
    "the image host's %s throws, unbilled, as the target's failure",
    async (_label, answer) => {
      ogSite(answer);
      const err = await expectUnbilledTargetFailure(ogCheck());
      expect(err.message).toContain("image host img.test");
      expect(err.retryable).toBe(true);
    },
  );

  it.each(notTheSite)("%s throws, unbilled and retryable, counted, with no host in the message (follow-up 34)", async (_label, answer) => {
    ogSite(answer);
    const err = await expectUnbilledProviderFailure(ogCheck());
    expect(err.retryable).toBe(true);
    expect(err.message).not.toMatch(/img\.test|site\.test/);
    expect(isUserInputError(err.message)).toBe(false);
  });

  it.each([401, 403, 429])("an image host that blocks the check (HTTP %i) is a refusal, not a finding", async (code) => {
    ogSite(async () => status(code));
    const err = await thrown(ogCheck());
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({ billable: false });
  });

  it("a server that does not implement HEAD is asked again with GET", async () => {
    ogSite(async (method) =>
      method === "HEAD" ? status(405) : status(200, "png", { "content-type": "image/png", "content-length": "51200" }),
    );
    const out = await billed("og-image-check", ogCheck());
    expect(out.issues).not.toContain(NON_200);
    expect(out).toMatchObject({ image_format: "png", image_size_kb: 50 });
  });
});

describe("og-image-check failure: a refusal on the way to a public image is not a finding (#1021 delta review)", () => {
  it("a public image URL whose redirect (or robots.txt redirect) the URL guard refuses throws, unbilled", async () => {
    ogSite(async () => {
      throw new UrlValidationError("This URL targets a restricted address.");
    });
    const err = await expectUnbilledTargetFailure(ogCheck());
    expect(err.message).toContain("image host img.test");
  });

  it("Strale's connect-time SSRF refusal stays unbilled, never the not-public finding", async () => {
    ogSite(async () => {
      throw Object.assign(new Error("Resolved host targets a restricted address."), { code: "ESSRFBLOCKED" });
    });
    const err = await thrown(ogCheck());
    expect(outcomeFromError(err)).toMatchObject({ billable: false });
  });
});

describe("og-image-check negative: a missing image is still the finding, billed", () => {
  it.each([404, 410])("an image answering HTTP %i is reported non-200", async (code) => {
    ogSite(async () => status(code));
    const out = await billed("og-image-check", ogCheck());
    expect(out.issues).toContain(NON_200);
  });

  // Billing review of #1021, finding 1: the image URL comes from the page,
  // so Strale's URL guard refusing it is the page's misconfiguration, a
  // billed finding, not the caller's input fault. Drives the real validator.
  it.each([
    "http://localhost:3000/og.png",
    "http://127.0.0.1/og.png",
    "data:image/png;base64,iVBORw0KGgo=",
  ])("an og:image the URL guard refuses (%s) is reported not publicly fetchable", async (imageUrl) => {
    const { validateUrl: realValidateUrl } =
      await vi.importActual<typeof import("../lib/url-validator.js")>("../lib/url-validator.js");
    vi.mocked(validateUrl).mockImplementationOnce(realValidateUrl);
    safeFetchMock.mockImplementation(async (url: string) => {
      if (String(url) === imageUrl) {
        await realValidateUrl(imageUrl);
        throw new Error("the URL guard should have refused this image URL");
      }
      return status(200, OG_PAGE.replace("https://img.test/card.png", imageUrl), {
        "content-type": "text/html",
      });
    });
    const out = await billed("og-image-check", ogCheck());
    expect(out.issues).toContain("og:image URL is not publicly fetchable");
    expect(out.issues).not.toContain(NON_200);
  });

  it("a reachable image is measured", async () => {
    ogSite(async () => status(200, "", { "content-type": "image/jpeg", "content-length": "102400" }));
    const out = await billed("og-image-check", ogCheck());
    expect(out.issues).not.toContain(NON_200);
    expect(out).toMatchObject({ image_format: "jpeg", image_size_kb: 100 });
  });
});

// ─── domain-contact-extract (row 32) ────────────────────────────────────────

const HOME = `<html><body><a href="/contact">Contact us</a><p>hello@acme.test</p></body></html>`;
const CONTACT = `<html><body><p>Write to support@acme.test or sales@acme.test</p></body></html>`;

/** robots.txt answers `robots`, the homepage HOME, the contact page `contact()`. */
function contactSite(contact: () => Promise<Response>, robots: () => Response = () => status(404)) {
  safeFetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/robots.txt")) return robots();
    if (u.endsWith("/contact")) return contact();
    return status(200, HOME, { "content-type": "text/html" });
  });
}
const contactExtract = () => exec("domain-contact-extract")({ domain: "acme.test" });

describe("domain-contact-extract failure: a contact page that failed is not a page without contacts (row 32)", () => {
  it.each([...transient, ["HTTP 408", async () => status(408)] as [string, () => Promise<Response>]])(
    "the contact page's %s throws, unbilled, as the target's failure",
    async (_label, answer) => {
      contactSite(answer);
      const err = await expectUnbilledTargetFailure(contactExtract());
      expect(err.message).toContain("website acme.test");
      expect(err.retryable).toBe(true);
    },
  );

  it.each(notTheSite)("%s throws, unbilled and retryable, counted, with no host in the message (follow-up 34)", async (_label, answer) => {
    contactSite(answer);
    const err = await expectUnbilledProviderFailure(contactExtract());
    expect(err.retryable).toBe(true);
    expect(err.message).not.toContain("acme.test");
    expect(isUserInputError(err.message)).toBe(false);
  });

  it.each([401, 403, 429])("a contact page that blocks the request (HTTP %i) is a refusal", async (code) => {
    contactSite(async () => status(code));
    const err = await thrown(contactExtract());
    expect(isCapabilityRefusal(err)).toBe(true);
  });

  it("a contact page that is a bot challenge is a refusal", async () => {
    contactSite(async () =>
      status(200, "<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing acme.test</body></html>", {
        "content-type": "text/html",
      }),
    );
    const err = await thrown(contactExtract());
    expect(isCapabilityRefusal(err)).toBe(true);
  });
});

describe("domain-contact-extract negative: a contact page that is not there leaves the homepage answer, billed", () => {
  it.each([404, 410])("a contact page answering HTTP %i is skipped and left out of fetched_urls", async (code) => {
    contactSite(async () => status(code));
    const out = await billed("domain-contact-extract", contactExtract());
    expect(out.fetched_urls).toEqual(["https://acme.test/"]);
    expect(out.role_emails).toEqual(["hello@acme.test"]);
  });

  it("a contact page robots.txt disallows is skipped and left out of fetched_urls", async () => {
    contactSite(
      async () => status(200, CONTACT, { "content-type": "text/html" }),
      () => status(200, "User-agent: *\nDisallow: /contact\n", { "content-type": "text/plain" }),
    );
    const out = await billed("domain-contact-extract", contactExtract());
    expect(out.fetched_urls).toEqual(["https://acme.test/"]);
  });

  it("a contact page that answers is read", async () => {
    contactSite(async () => status(200, CONTACT, { "content-type": "text/html" }));
    const out = await billed("domain-contact-extract", contactExtract());
    expect(out.fetched_urls).toEqual(["https://acme.test/", "https://acme.test/contact"]);
    expect(out.role_emails).toEqual(expect.arrayContaining(["hello@acme.test", "support@acme.test", "sales@acme.test"]));
  });
});

// ─── protocol-fees-lookup (row 33) ──────────────────────────────────────────

const FEES = { name: "Uniswap", defillamaId: "parent#uniswap", total24h: 1564082, total48hto24h: 2022931, total7d: 13435356, total30d: 76015351, totalAllTime: 6152364825 };
const REVENUE = { name: "Uniswap", defillamaId: "parent#uniswap", total24h: 183026, total48hto24h: 230716, total7d: 1544123, total30d: 8140819, totalAllTime: 64445266 };
const notTracked = (slug: string) => status(400, `Fees for ${slug} not found, please visit /overview/fees to see available protocols`);

/** The fees leg answers `fees()`, the revenue leg `revenue()`. */
function llama(fees: () => Promise<Response>, revenue: () => Promise<Response>) {
  fetchMock.mockImplementation(async (url: string) => (String(url).includes("dataType=dailyRevenue") ? revenue() : fees()));
}
const feesLookup = (protocol = "uniswap") => exec("protocol-fees-lookup")({ protocol });

describe("protocol-fees-lookup failure: a revenue request that failed is not 'no revenue' (row 33)", () => {
  it.each([...transient, ["HTTP 429", async () => status(429)] as [string, () => Promise<Response>]])(
    "the revenue leg's %s throws, unbilled and retryable",
    async (_label, answer) => {
      llama(async () => json(FEES), answer);
      const err = await expectUnbilledProviderFailure(feesLookup());
      expect(err.message).toContain("DeFi Llama revenue API");
      expect(err.retryable).toBe(true);
    },
  );

  it("an unreadable revenue answer throws, unbilled", async () => {
    llama(async () => json(FEES), async () => status(200, "<html>oops</html>"));
    const err = await expectUnbilledProviderFailure(feesLookup());
    expect(err.message).toContain("DeFi Llama revenue API");
  });

  it("revenue is read from the fees summary with dataType=dailyRevenue, and billed", async () => {
    llama(async () => json(FEES), async () => json(REVENUE));
    const out = await billed("protocol-fees-lookup", feesLookup());
    expect(out).toMatchObject({ revenue_24h_usd: 183026, revenue_7d_usd: 1544123, revenue_30d_usd: 8140819, revenue_all_time_usd: 64445266 });
    const revenueUrl = String(fetchMock.mock.calls.map((c) => c[0]).find((u) => String(u).includes("dailyRevenue")));
    expect(revenueUrl).toMatch(/^https:\/\/api\.llama\.fi\/summary\/fees\/uniswap\?dataType=dailyRevenue/);
  });

  it.each(transient)("the fees leg's %s throws, unbilled", async (_label, answer) => {
    llama(answer, async () => json(REVENUE));
    const err = await expectUnbilledProviderFailure(feesLookup());
    expect(err.message).toContain("DeFi Llama fees API");
  });
});

describe("protocol-fees-lookup negative: a protocol without revenue tracking keeps null revenue, billed", () => {
  it("revenue 'not found' with fees answered gives null revenue", async () => {
    llama(async () => json(FEES), async () => notTracked("uniswap"));
    const out = await billed("protocol-fees-lookup", feesLookup());
    expect(out).toMatchObject({
      protocol: "Uniswap",
      fees_24h_usd: 1564082,
      revenue_24h_usd: null,
      revenue_7d_usd: null,
      revenue_30d_usd: null,
      revenue_all_time_usd: null,
    });
  });
});

describe("protocol-fees-lookup failure: DeFi Llama's 400 for an unknown protocol reads as not found", () => {
  // DeFi Llama answers an unknown slug with HTTP 400, not 404 (probed
  // 2026-11-12); before, that surfaced as "fees API returned HTTP 400".
  it("an unknown protocol fails as not found", async () => {
    llama(async () => notTracked("nope"), async () => notTracked("nope"));
    await expect(feesLookup("nope")).rejects.toThrow(/not found on DeFi Llama/);
  });
});

// ─── ens-reverse-lookup (row 35) ────────────────────────────────────────────

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const RPC_URL = "https://eth-mainnet.g.alchemy.com/v2/test-key";
/** viem wraps the transport error a few causes deep, as readContract does. */
const wrapped = (inner: Error) => Object.assign(new Error("ContractFunctionExecutionError"), { cause: Object.assign(new Error("CallExecutionError"), { cause: inner }) });
const rpcFailures: Array<[string, () => Error]> = [
  ["HTTP 503", () => wrapped(new HttpRequestError({ url: RPC_URL, status: 503, body: {} }))],
  ["HTTP 429", () => wrapped(new HttpRequestError({ url: RPC_URL, status: 429, body: {} }))],
  ["a network error", () => wrapped(new HttpRequestError({ url: RPC_URL, body: {}, cause: networkError() }))],
  ["a timeout", () => wrapped(new ViemTimeoutError({ url: RPC_URL, body: {} }))],
];
const ensLookup = () => exec("ens-reverse-lookup")({ address: ADDRESS });

describe("ens-reverse-lookup failure: a forward check that failed is not 'unverified' (row 35)", () => {
  it.each(rpcFailures)("the forward check's %s throws, unbilled and retryable", async (_label, failure) => {
    getEnsName.mockResolvedValue("vitalik.eth");
    getEnsAddress.mockRejectedValue(failure());
    const err = await expectUnbilledProviderFailure(ensLookup());
    expect(err.message).toContain("Ethereum RPC");
    expect(err.retryable).toBe(true);
  });

  it.each(rpcFailures)("the reverse lookup's %s throws as the RPC's failure", async (_label, failure) => {
    getEnsName.mockRejectedValue(failure());
    const err = await expectUnbilledProviderFailure(ensLookup());
    expect(err.retryable).toBe(true);
  });
});

describe("ens-reverse-lookup negative: real answers are unchanged, billed", () => {
  it("a name that resolves back to the address is verified", async () => {
    getEnsName.mockResolvedValue("vitalik.eth");
    getEnsAddress.mockResolvedValue(ADDRESS.toLowerCase());
    const out = await billed("ens-reverse-lookup", ensLookup());
    expect(out).toEqual({ address: ADDRESS, has_ens: true, ens_name: "vitalik.eth", verified: true });
  });

  it.each([
    ["no address", null],
    ["another address", "0x0000000000000000000000000000000000000001"],
  ])("a name that resolves to %s is unverified", async (_label, resolved) => {
    getEnsName.mockResolvedValue("vitalik.eth");
    getEnsAddress.mockResolvedValue(resolved);
    const out = await billed("ens-reverse-lookup", ensLookup());
    expect(out).toMatchObject({ has_ens: true, verified: false });
  });

  it("a reverse name that does not normalise is unverified, with no forward request", async () => {
    getEnsName.mockResolvedValue("a b.eth");
    const out = await billed("ens-reverse-lookup", ensLookup());
    expect(out).toMatchObject({ has_ens: true, ens_name: "a b.eth", verified: false });
    expect(getEnsAddress).not.toHaveBeenCalled();
  });

  it("an address with no primary name has none", async () => {
    getEnsName.mockResolvedValue(null);
    const out = await billed("ens-reverse-lookup", ensLookup());
    expect(out).toEqual({ address: ADDRESS, has_ens: false, ens_name: null, verified: false });
  });
});
