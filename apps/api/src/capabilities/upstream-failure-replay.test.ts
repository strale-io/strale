/**
 * Every recorded network executor under a failing upstream (promise-audit T1
 * wave 3).
 *
 * `upstream-replay-contract.test.ts` replays what each source answered on a
 * good day. This file replays the bad days: a 503, a 429, a reset connection,
 * a timeout, a DNS timeout, and a Cloudflare challenge page served with HTTP
 * 200 (with and without the cf-mitigated header). A customer is billed only
 * for a normal return the outcome model calls billable (DEC-14), so the
 * contract is: under each failure the executor throws, or returns something
 * not billable. Before wave 3, seven executors billed the challenge page as
 * the site's content and one billed a block page as "not VAT-registered".
 *
 * The one standing exception is an availability probe, whose product is the
 * answer the target gave (an uptime check is billable when the target is
 * down); for it the contract is that a failure is never reported healthy.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import net from "node:net";
import { loadRecordings, type UpstreamRecording } from "../test-helpers/upstream-replay.js";
import { loadExecutor, loadManifest } from "../test-helpers/known-answer-contract.js";
import { outcomeFromError, outcomeFromOutput } from "../lib/execution-outcome.js";

const dnsMode = { code: "ENOTFOUND" };
vi.mock("dns/promises", () => {
  const offline = async () => {
    throw Object.assign(new Error("DNS blocked in upstream failure replay test"), { code: dnsMode.code });
  };
  return { default: { resolve4: offline, resolve6: offline }, resolve4: offline, resolve6: offline };
});

type Mode = "http_503" | "http_429" | "network_error" | "timeout" | "blocked_200" | "blocked_200_body_only" | "dns_etimeout";
const MODES: Mode[] = ["http_503", "http_429", "network_error", "timeout", "blocked_200", "blocked_200_body_only", "dns_etimeout"];

const BLOCK_PAGE = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="refresh" content="390"></head><body><div class="main-wrapper"><h1>example.com</h1><h2>Verify you are human by completing the action below.</h2><noscript>Enable JavaScript and cookies to continue</noscript></div><script>(function(){window._cf_chl_opt={cvId:"3",cType:"managed"};var a=document.createElement("script");a.src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=8f1";document.getElementsByTagName("head")[0].appendChild(a);}());</script><form action="/?__cf_chl_f_tk=abc" method="POST"></form></body></html>';

function failingFetch(mode: Mode) {
  return async (input: RequestInfo | URL): Promise<Response> => {
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
      case "blocked_200_body_only":
        return answer(new Response(BLOCK_PAGE, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
      case "network_error":
        throw new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
      case "timeout":
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      case "dns_etimeout":
        throw new TypeError("fetch failed", { cause: Object.assign(new Error("queryA ETIMEOUT"), { code: "ETIMEOUT", syscall: "queryA" }) });
    }
  };
}

const recordings = loadRecordings();

const realConnect = net.Socket.prototype.connect;
beforeAll(() => {
  net.Socket.prototype.connect = function () {
    throw new Error("socket blocked in upstream failure replay test");
  } as typeof realConnect;
});
afterAll(() => {
  net.Socket.prototype.connect = realConnect;
});
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  dnsMode.code = "ENOTFOUND";
});

async function run(recording: UpstreamRecording, mode: Mode) {
  vi.setSystemTime(new Date(recording.recorded_at));
  dnsMode.code = mode === "dns_etimeout" ? "ETIMEOUT" : "ENOTFOUND";
  vi.stubGlobal("fetch", failingFetch(mode));
  const manifest = loadManifest(recording.slug);
  const executor = await loadExecutor(manifest);
  if (!executor) throw new Error(`${recording.slug}: no executor registered`);
  try {
    const result = await executor(structuredClone(recording.input));
    const outcome = outcomeFromOutput(recording.slug, result.output);
    return {
      billed: outcome.billable,
      output: result.output as Record<string, unknown>,
      detail: JSON.stringify(result.output).slice(0, 300),
    };
  } catch (err) {
    const o = outcomeFromError(err);
    return { billed: false, output: null, detail: `threw ${o.failure_class}/${o.fault}/retry=${o.retryable}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}` };
  }
}

/**
 * Availability probes: billing a returned answer is the product, so the
 * assertion is on what they report instead.
 */
const AVAILABILITY_PROBES = new Set(["api-health-check"]);

describe("upstream failure replay", () => {
  it("covers the recorded catalogue", () => {
    expect(recordings.length).toBeGreaterThanOrEqual(32);
  });

  for (const recording of recordings) {
    for (const mode of MODES) {
      it(`${recording.slug} does not bill a ${mode}`, async () => {
        const res = await run(recording, mode);
        if (AVAILABILITY_PROBES.has(recording.slug) && res.output) {
          expect(res.output.is_healthy, `${recording.slug} reported a ${mode} as healthy`).toBe(false);
          return;
        }
        expect(res.billed, `${recording.slug} billed a ${mode}: ${res.detail}`).toBe(false);
      });
    }
  }
});
