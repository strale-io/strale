/**
 * header-security-check grades the headers of the page the site served. A site
 * that refuses Strale (401/403/407) or never answers has served no page, so
 * there is nothing to grade: before promise-audit T1 follow-up (30) the first
 * was graded (an "F" for a login wall or a WAF page, billed) and the second
 * escaped as a raw error that counted against the capability's own health.
 *
 * A 429 is the site refusing Strale too, as everywhere else that reads
 * isBlockStatus (follow-up 38): before, it alone was a retryable target fault
 * here while url-to-markdown and the other page fetchers refused it.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: vi.fn(),
}));
vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/url-validator.js")>()),
  validateUrl: vi.fn(async () => {}),
}));

import { safeFetch } from "../lib/safe-fetch.js";
import { getExecutor } from "./index.js";
import { outcomeFromError } from "../lib/execution-outcome.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { siteAccessRefusal } from "../lib/site-access.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { UrlValidationError } from "../lib/url-validator.js";
import "./header-security-check.js";

const fetcher = vi.mocked(safeFetch);
const run = () => getExecutor("header-security-check")!({ url: "https://example.com" });

async function failure(): Promise<unknown> {
  try {
    await run();
  } catch (err) {
    return err;
  }
  throw new Error("expected header-security-check to fail");
}

afterEach(() => vi.clearAllMocks());

describe("header-security-check: a refusal is not graded", () => {
  for (const status of [401, 403, 407, 429]) {
    it(`HTTP ${status} fails the call unbilled as a site refusal, without retrying`, async () => {
      const cancel = vi.fn(async () => {});
      const res = new Response("denied", { status, headers: { "x-frame-options": "DENY" } });
      Object.defineProperty(res, "body", { value: { cancel } });
      fetcher.mockResolvedValue(res);

      const err = await failure();
      expect(isCapabilityRefusal(err)).toBe(true);
      expect(String((err as Error).message)).toContain(`HTTP ${status}`);
      const outcome = outcomeFromError(err);
      expect(outcome).toMatchObject({ billable: false, failure_class: "capability_refused", counts_against_capability: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalled();
    });
  }

  it("the site's own 404 is still graded as it stands", async () => {
    fetcher.mockResolvedValue(new Response(null, { status: 404, headers: { "x-frame-options": "DENY" } }));
    const result = await run();
    expect(result.output).toMatchObject({ response_status: 404 });
  });
});

describe("header-security-check: a site that does not answer is the site's fault", () => {
  const cases: Array<[string, unknown]> = [
    ["a reset connection", new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) })],
    ["a timeout", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
    ["a host that does not resolve", Object.assign(new Error("getaddrinfo ENOTFOUND example.com"), { code: "ENOTFOUND" })],
    ["a redirect loop", new Error("Too many redirects (max 3)")],
    ["a host whose name contains \"restricted\"", Object.assign(new Error("getaddrinfo ENOTFOUND restricted.example"), { code: "ENOTFOUND" })],
  ];
  for (const [label, thrown] of cases) {
    it(`${label} fails unbilled and does not count against the capability`, async () => {
      fetcher.mockRejectedValue(thrown);
      const err = await failure();
      expect(err).toBeInstanceOf(UpstreamUnavailableError);
      expect((err as UpstreamUnavailableError).targetFault).toBe(true);
      expect(outcomeFromError(err)).toMatchObject({ billable: false, counts_against_capability: false });
    });
  }
});

describe("header-security-check: a failure that does not say whose it was counts, with no host in it (follow-up 34)", () => {
  const cases: Array<[string, unknown]> = [
    ["EAI_AGAIN wrapped by fetch", Object.assign(new TypeError("fetch failed"), { cause: { code: "EAI_AGAIN" } })],
    ["a bare EAI_AGAIN", Object.assign(new Error("getaddrinfo EAI_AGAIN example.com"), { code: "EAI_AGAIN" })],
    ["a network error with no code", Object.assign(new TypeError("fetch failed"), { cause: {} })],
  ];
  for (const [label, thrown] of cases) {
    it(`${label} fails unbilled and retryable, counted against the capability`, async () => {
      fetcher.mockRejectedValue(thrown);
      const err = await failure();
      expect(err).toBeInstanceOf(UpstreamUnavailableError);
      expect(err).toMatchObject({ targetFault: false, retryable: true });
      expect((err as Error).message).not.toContain("example.com");
      expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "provider", counts_against_capability: true });
    });
  }
});

describe("header-security-check: Strale's own refusals pass through unchanged", () => {
  it("a robots.txt or challenge refusal from the fetch layer", async () => {
    const refusal = siteAccessRefusal("https://example.com", { kind: "challenge" });
    fetcher.mockRejectedValue(refusal);
    expect(await failure()).toBe(refusal);
  });

  it("an SSRF refusal on a redirect hop", async () => {
    const ssrf = Object.assign(new Error("connection to a restricted address refused"), { code: "ESSRFBLOCKED" });
    fetcher.mockRejectedValue(new TypeError("fetch failed", { cause: ssrf }));
    expect(await failure()).toBe(ssrf);
  });

  it("a redirect to a restricted address caught by the URL validator", async () => {
    const restricted = new UrlValidationError("This URL resolves to a restricted address.");
    fetcher.mockRejectedValue(restricted);
    expect(await failure()).toBe(restricted);
  });
});

describe("header-security-check: a bug of our own is not blamed on the site", () => {
  it("a non-network error passes through and counts against the capability", async () => {
    const bug = new TypeError("headers.get is not a function");
    fetcher.mockRejectedValue(bug);
    const err = await failure();
    expect(err).toBe(bug);
    expect(outcomeFromError(err)).toMatchObject({ counts_against_capability: true });
  });
});
