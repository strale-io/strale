/**
 * Every network executor WITHOUT a recording, under a failing upstream
 * (promise-audit T1 wave 6).
 *
 * `upstream-failure-replay.test.ts` covers the executors that have a
 * good-day recording. This file covers the rest of the network catalogue:
 * every active manifest whose data source is an API or a scraped page, run
 * with its own known-answer input while every fetch answers 503, 429, a reset
 * connection, a timeout, a DNS timeout or a Cloudflare challenge page; every
 * socket connection is refused; and every DNS query fails (NXDOMAIN, or
 * ETIMEOUT in the dns_etimeout mode). A customer is billed only for a normal
 * return the outcome model calls billable (DEC-14), so the default contract
 * is: under each failure the executor throws, or returns something not
 * billable. The first run of this sweep found five executors that billed an
 * outage as an answer (VIES, arXiv, social-profile-check,
 * email-validate-bulk, header-security-check).
 *
 * The exceptions are listed below by kind, each with its reason. An executor
 * outside every list must not bill any failure; one that never reaches the
 * network must be listed as such, so the sweep cannot pass by not testing.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import net from "node:net";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadRecordings } from "../test-helpers/upstream-replay.js";
import { loadExecutor, loadManifest, MANIFESTS_DIR } from "../test-helpers/known-answer-contract.js";
import { outcomeFromError, outcomeFromOutput } from "../lib/execution-outcome.js";
import { getDeactivatedCapabilities } from "./auto-register.js";

const net_ = { attempts: 0, dnsCode: "ENOTFOUND" };
vi.mock("dns/promises", () => {
  const offline = async () => {
    net_.attempts++;
    throw Object.assign(new Error("DNS blocked in upstream failure replay test"), { code: net_.dnsCode });
  };
  const names = ["resolve", "resolve4", "resolve6", "resolveMx", "resolveTxt", "resolveNs", "resolveCname", "resolveSoa", "resolveCaa", "resolveSrv", "resolveAny", "lookup", "reverse"];
  const api: Record<string, unknown> = Object.fromEntries(names.map((n) => [n, offline]));
  class Resolver {
    constructor() {
      Object.assign(this, api);
    }
    setServers() {}
  }
  return { default: { ...api, Resolver }, ...api, Resolver };
});
// host-exposure-lookup reads `promises` from node:dns, which the mock above
// does not reach; the callback API stays real for safe-fetch's lookup.
vi.mock("node:dns", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:dns")>();
  const promises = await import("dns/promises");
  return { ...real, default: { ...real, promises }, promises };
});

type Mode = "http_503" | "http_429" | "network_error" | "timeout" | "blocked_200" | "dns_etimeout";
const MODES: Mode[] = ["http_503", "http_429", "network_error", "timeout", "blocked_200", "dns_etimeout"];
const HTTP_STATUS: Partial<Record<Mode, number>> = { http_503: 503, http_429: 429, blocked_200: 200 };
const TRANSPORT: ReadonlySet<Mode> = new Set(["network_error", "timeout", "dns_etimeout"]);

const BLOCK_PAGE = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body><h2>Verify you are human by completing the action below.</h2><noscript>Enable JavaScript and cookies to continue</noscript><script>window._cf_chl_opt={cvId:"3",cType:"managed"};</script></body></html>';

function failingFetch(mode: Mode) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    net_.attempts++;
    const url = input instanceof Request ? input.url : String(input);
    const answer = (r: Response) => {
      Object.defineProperty(r, "url", { value: url });
      return r;
    };
    switch (mode) {
      case "http_503":
        return answer(new Response("Service Unavailable", { status: 503, headers: { "content-type": "text/plain" } }));
      case "http_429":
        return answer(new Response('{"error":"rate limit exceeded"}', { status: 429, headers: { "content-type": "application/json", "retry-after": "30" } }));
      case "blocked_200":
        return answer(new Response(BLOCK_PAGE, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cf-mitigated": "challenge", server: "cloudflare" } }));
      case "network_error":
        throw new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
      case "timeout":
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      case "dns_etimeout":
        throw new TypeError("fetch failed", { cause: Object.assign(new Error("queryA ETIMEOUT"), { code: "ETIMEOUT", syscall: "queryA" }) });
    }
  };
}

/**
 * Executors that never reach the network with their known-answer input, and
 * why. Listing one here is a claim the test checks: it fails if the executor
 * does reach the network, so the entry has to move to a real contract.
 */
const NO_NETWORK: Record<string, string> = {
  "container-track": "the known-answer input fails the ISO 6346 format check before any lookup",
  "email-validate": "the known-answer input fails the address syntax check before any DNS query",
  "port-lookup": "answers from a static port table",
  "secret-scan": "scans the input text locally",
  "token-count": "counts tokens locally",
  "company-status-check": "delegates to a registry executor that this test does not register",
  "invoice-counterparty-check": "delegates to sibling executors that this test does not register, and throws unbilled",
  "swiss-company-data": "refuses before any call without Zefix credentials, which this test does not supply",
};

/**
 * DNS answerers: NXDOMAIN is a true answer ("no such domain", "no MX", "not
 * listed"), so billing it is correct. The failure they must not bill is a
 * resolver that gave no answer (dns_etimeout).
 */
const DNS_ANSWERS = new Set([
  "dns-lookup",
  "mx-lookup",
  "email-auth-check",
  "email-deliverability-check",
  "email-pattern-discover",
  "email-validate-bulk",
  "domain-reputation", // a failed HTTPS leg is part of the score by design (PR #1025)
  "startup-domain-check", // a domain is "available" only on NXDOMAIN; failed handle legs read null
]);

type Observed = { mode: Mode; output: Record<string, unknown>; provenance: Record<string, unknown> };

/**
 * Probes: the product is what the target answered, so a returned answer is
 * billable; the contract is that the answer reports the failure it saw.
 * Each check returns a violation message, or null.
 */
const PROBES: Record<string, (o: Observed) => string | null> = {
  // Manifest: answers "does the server respond?"; any HTTP status counts as up and is reported.
  "uptime-check": ({ mode, output }) =>
    TRANSPORT.has(mode)
      ? output.status === "down" ? null : `reported ${String(output.status)} on a ${mode}`
      : output.status_code === HTTP_STATUS[mode] ? null : `reported status_code ${String(output.status_code)} on a ${mode}`,
  "url-health-check": ({ mode, output }) => {
    if (TRANSPORT.has(mode)) return `returned an answer on a ${mode}`;
    if (output.status_code !== HTTP_STATUS[mode]) return `reported status_code ${String(output.status_code)} on a ${mode}`;
    return mode !== "blocked_200" && output.is_up !== false ? `reported is_up on a ${mode}` : null;
  },
  "redirect-trace": ({ mode, output }) =>
    TRANSPORT.has(mode)
      ? `returned an answer on a ${mode}`
      : output.final_status_code === HTTP_STATUS[mode] ? null : `reported final_status_code ${String(output.final_status_code)} on a ${mode}`,
  "paid-api-preflight": ({ mode, output }) =>
    TRANSPORT.has(mode)
      ? output.is_reachable === false ? null : `reported reachable on a ${mode}`
      : output.status_code === HTTP_STATUS[mode] ? null : `reported status_code ${String(output.status_code)} on a ${mode}`,
  // Every connection in this test is refused, which is the true answer "closed".
  "port-check": ({ output }) => (output.open_count === 0 ? null : `reported ${String(output.open_count)} open port(s) when every connection was refused`),
};

/**
 * Disclosed fallbacks: the manifest and the output say the answer came from
 * a deterministic fallback when the model was unavailable; the contract is
 * that the fallback is labelled.
 */
const DISCLOSED_FALLBACK: Record<string, (o: Observed) => string | null> = {
  "risk-narrative-generate": ({ mode, provenance }) =>
    provenance.source === "algorithmic-fallback" ? null : `returned an unlabelled narrative on a ${mode}`,
};

// Dummy credentials so key-gated executors reach the (failing) network
// instead of refusing early. Every name is a row in config/env-manifest.yaml.
const DUMMY_ENV: Record<string, string> = Object.fromEntries(
  [
    "ANTHROPIC_API_KEY", "SERPER_API_KEY", "DILISENSE_API_KEY", "COMPANIES_HOUSE_API_KEY", "BROWSERLESS_API_KEY",
    "ESORTCODE_API_KEY", "GITHUB_TOKEN", "ALCHEMY_API_KEY", "FRANCE_TRAVAIL_CLIENT_SECRET", "FRANCE_TRAVAIL_CLIENT_ID",
    "USAJOBS_API_KEY", "USAJOBS_USER_AGENT", "OPENREGISTER_API_KEY", "PAGESPEED_API_KEY", "ETHERSCAN_API_KEY",
    "SUDREG_CLIENT_SECRET", "SUDREG_CLIENT_ID", "SEC_API_IO_TOKEN", "NTA_HOUJIN_APP_ID", "JUSTIZONLINE_API_KEY",
    "GEMI_API_KEY", "EP_ONLINE_API_KEY", "EINSEARCH_API_KEY", "COURTLISTENER_API_TOKEN", "COBALT_API_KEY", "CBEAPI_KEY",
    "BOLAGSVERKET_CLIENT_SECRET", "BOLAGSVERKET_CLIENT_ID", "BAG_API_KEY", "AVIATIONSTACK_API_KEY", "ABN_LOOKUP_GUID",
    "OPENAPI_COM_API_TOKEN_PROD",
  ].map((name) => [name, "dummy-test-value-0000000000"]),
);
Object.assign(DUMMY_ENV, {
  OPENAPI_ENABLED: "true",
  OPENAPI_COM_EMAIL: "dummy@example.invalid",
  BROWSERLESS_URL: "https://browserless.invalid",
});

const recorded = new Set(loadRecordings().map((r) => r.slug));
const deactivated = getDeactivatedCapabilities();
const slugs = readdirSync(MANIFESTS_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => f.slice(0, -".yaml".length))
  .filter((slug) => {
    const m = loadManifest(slug);
    return (
      ["api", "scrape"].includes(String(m.data_source_type)) &&
      !deactivated.has(slug) &&
      !recorded.has(slug) &&
      existsSync(resolve(import.meta.dirname, `${slug}.ts`)) &&
      Boolean(m.test_fixtures?.known_answer?.input)
    );
  })
  .sort();

const savedEnv: Record<string, string | undefined> = {};
const realConnect = net.Socket.prototype.connect;
beforeAll(() => {
  for (const [name, value] of Object.entries(DUMMY_ENV)) {
    savedEnv[name] = process.env[name];
    process.env[name] = value;
  }
  // Refused the way a real connection is: asynchronously, as an error event.
  net.Socket.prototype.connect = function (this: net.Socket) {
    net_.attempts++;
    process.nextTick(() => this.destroy(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })));
    return this;
  } as typeof realConnect;
});
afterAll(() => {
  net.Socket.prototype.connect = realConnect;
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
beforeEach(() => {
  vi.resetModules();
  net_.attempts = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  net_.dnsCode = "ENOTFOUND";
});

async function run(slug: string, mode: Mode) {
  net_.dnsCode = mode === "dns_etimeout" ? "ETIMEOUT" : "ENOTFOUND";
  vi.stubGlobal("fetch", failingFetch(mode));
  const manifest = loadManifest(slug);
  const executor = await loadExecutor(manifest);
  if (!executor) throw new Error(`${slug}: no executor registered`);
  try {
    const result = await executor(structuredClone(manifest.test_fixtures!.known_answer!.input!));
    return {
      billed: outcomeFromOutput(slug, result.output).billable,
      observed: {
        mode,
        output: result.output as Record<string, unknown>,
        provenance: (result.provenance ?? {}) as Record<string, unknown>,
      } as Observed,
      detail: JSON.stringify(result.output).slice(0, 300),
    };
  } catch (err) {
    const o = outcomeFromError(err);
    return { billed: false, observed: null, detail: `threw ${o.failure_class}/${o.fault}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}` };
  }
}

describe("upstream failure replay, unrecorded network executors", () => {
  it("covers the unrecorded network catalogue", () => {
    expect(slugs.length).toBeGreaterThanOrEqual(195);
  });

  it("lists only executors in scope", () => {
    const inScope = new Set(slugs);
    const listed = [...Object.keys(NO_NETWORK), ...DNS_ANSWERS, ...Object.keys(PROBES), ...Object.keys(DISCLOSED_FALLBACK)];
    expect(listed.filter((s) => !inScope.has(s)), "stale exemption entries").toEqual([]);
    expect(new Set(listed).size, "an executor is listed under two kinds").toBe(listed.length);
  });

  for (const slug of slugs) {
    for (const mode of MODES) {
      it(`${slug} does not bill a ${mode}`, async () => {
        const res = await run(slug, mode);
        if (slug in NO_NETWORK) {
          expect(net_.attempts, `${slug} is listed as never reaching the network, but it did`).toBe(0);
          return;
        }
        expect(net_.attempts, `${slug} never reached the network, so this test proves nothing about it: ${res.detail}`).toBeGreaterThan(0);
        if (DNS_ANSWERS.has(slug) && mode !== "dns_etimeout") return;
        const contract = PROBES[slug] ?? DISCLOSED_FALLBACK[slug];
        if (contract && res.observed) {
          expect(contract(res.observed), `${slug}: ${res.detail}`).toBeNull();
          return;
        }
        expect(res.billed, `${slug} billed a ${mode}: ${res.detail}`).toBe(false);
      }, 30_000);
    }
  }
});
