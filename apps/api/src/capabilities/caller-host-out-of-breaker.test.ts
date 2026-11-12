/**
 * Promise-audit T1 follow-up 39: a failure of the caller's own site is the
 * target's, and the caller's host never reaches the breaker.
 *
 * The circuit breaker categorises a counted failure by its message
 * (`categorizeFailureReason` in lib/trust-helpers.ts): "403" reads as
 * auth_expired, "404", "410" or "gone" as endpoint_gone, "301" or "308" as
 * permanent_move, and each of those opens the breaker for every caller on one
 * call. Before this fix:
 *
 * - domain-contact-extract's homepage rewrapped every failure as
 *   `Could not fetch ${hostname}: ...` and every status as
 *   `${hostname} returned HTTP ${status}`. A timeout was counted against the
 *   capability with the host in the message; the rest were unattributed.
 * - og-image-check's own page threw `HTTP ${status} fetching ${url}` and let a
 *   network error or timeout out raw. A 5xx and a timeout were counted
 *   against the capability (the 5xx with the URL in the message), a network
 *   error was unattributed, and a 401 or 403 was filed as the caller's input
 *   rather than refused.
 *
 * Every case below runs against a host whose name contains "gone" and "403".
 * The "failure" blocks fail against the pre-fix executors. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));

vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/url-validator.js")>()),
  validateHost: vi.fn().mockResolvedValue(undefined),
  validateUrl: vi.fn().mockResolvedValue(undefined),
}));

import { getDirectExecutor } from "./index.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import { withAcquisitionMethod } from "../lib/data-access.js";
import { outcomeFromError, shouldCountAgainstCapability } from "../lib/execution-outcome.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { categorizeFailureReason, isRetryableFailure } from "../lib/trust-helpers.js";
import "./domain-contact-extract.js";
import "./og-image-check.js";
import "./meta-extract.js";
import "./link-extract.js";
import "./gdpr-website-check.js";

/** A host name the breaker's substring categoriser would misread if it ever saw it. */
const HOST = "gone-403.test";

type Err = Error & { retryable?: boolean };

async function thrown(slug: string, input: Record<string, unknown>): Promise<Err> {
  return withAcquisitionMethod("customer_directed_fetch", () => getDirectExecutor(slug)!(input)).then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e as Err,
  );
}

/**
 * The invariant: a failure either never reaches the breaker, or reaches it
 * with fixed text that names no caller host and reads as retryable.
 */
function expectBreakerSafe(err: Err) {
  if (!shouldCountAgainstCapability(err)) return;
  expect(err.message).not.toContain(HOST);
  if (!isUserInputError(err.message)) expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
}

/** The caller's own site: unbilled, never counted, breaker-exempt by wording too. */
function expectTargetFailure(err: Err) {
  expect(err.name).toBe("UpstreamUnavailableError");
  expect(err.message).not.toMatch(/not found|invalid|missing|required/i);
  expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "target", counts_against_capability: false });
  expect(shouldCountAgainstCapability(err)).toBe(false);
  expect(isUserInputError(err.message)).toBe(true);
  expectBreakerSafe(err);
}

/** A failure that does not say whose it was: unbilled, counted, fixed text. */
function expectCountedWithoutHost(err: Err) {
  expect(err.name).toBe("UpstreamUnavailableError");
  expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "provider", counts_against_capability: true });
  expect(err.message).not.toContain(HOST);
  expect(err.retryable).toBe(true);
  expectBreakerSafe(err);
}

const status = (code: number, body = "", headers: Record<string, string> = {}) => new Response(body, { status: code, headers });
const fail = (e: () => unknown) => async () => {
  throw e();
};
const networkError = (code?: string) => Object.assign(new TypeError("fetch failed"), { cause: code ? { code } : {} });
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

/** robots.txt answers 404; every other request answers `page()`. */
function site(page: () => Promise<Response>) {
  safeFetchMock.mockImplementation(async (url: string) => (String(url).endsWith("/robots.txt") ? status(404) : page()));
}

beforeEach(() => {
  safeFetchMock.mockReset();
  __resetRobotsCacheForTests();
});

const clientErrors = [400, 404, 410];
const unfollowedRedirects = [301, 308];
const transient: Array<[string, () => Promise<Response>]> = [
  ["HTTP 503", async () => status(503)],
  ["HTTP 408", async () => status(408)],
  ["a network error (ECONNRESET)", fail(() => networkError("ECONNRESET"))],
  ["a timeout", fail(timeout)],
];
const notTheSite: Array<[string, () => Promise<Response>]> = [
  ["EAI_AGAIN", fail(() => networkError("EAI_AGAIN"))],
  ["a network error with no code", fail(() => networkError())],
];

const targets: Array<[string, string, Record<string, unknown>]> = [
  ["domain-contact-extract's homepage", "domain-contact-extract", { domain: HOST }],
  ["og-image-check's own page", "og-image-check", { url: `https://${HOST}/page` }],
  // Follow-up 44: the same page read in three more tools, which threw the
  // status with the caller's URL and let network errors and timeouts out raw.
  ["meta-extract's page", "meta-extract", { url: `https://${HOST}/page` }],
  ["link-extract's page", "link-extract", { url: `https://${HOST}/page` }],
  ["gdpr-website-check's page", "gdpr-website-check", { url: `https://${HOST}/page` }],
];

describe.each(targets)("%s failure: a status from the caller's site is the target's, never counted", (_label, slug, input) => {
  it.each(clientErrors)("HTTP %i throws as the target's answer, not retryable", async (code) => {
    site(async () => status(code));
    const err = await thrown(slug, input);
    expectTargetFailure(err);
    expect(err.message).toContain(`URL returned HTTP ${code}`);
    expect(err.retryable).toBe(false);
  });

  it.each(unfollowedRedirects)("an unfollowed HTTP %i throws as the target's, with the status off the message", async (code) => {
    site(async () => status(code));
    const err = await thrown(slug, input);
    expectTargetFailure(err);
    expect(err.message).not.toContain(String(code));
    expect(err.retryable).toBe(false);
  });

  it.each(transient)("%s throws as the target's failure, retryable", async (_l, page) => {
    site(page);
    const err = await thrown(slug, input);
    expectTargetFailure(err);
    expect(err.retryable).toBe(true);
  });

  it.each(notTheSite)("%s is counted under fixed text, with no host in the message", async (_l, page) => {
    site(page);
    expectCountedWithoutHost(await thrown(slug, input));
  });

  it.each([401, 403, 429])("HTTP %i is a refusal, never counted", async (code) => {
    site(async () => status(code));
    const err = await thrown(slug, input);
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(shouldCountAgainstCapability(err)).toBe(false);
  });
});

describe("follow-up 44: the page read sends no tool-specific user agent", () => {
  it.each(["meta-extract", "link-extract", "gdpr-website-check"])("%s leaves the user agent to safeFetch", async (slug) => {
    site(async () => status(200, "<html><head><title>t</title></head></html>", { "content-type": "text/html" }));
    await withAcquisitionMethod("customer_directed_fetch", () => getDirectExecutor(slug)!({ url: `https://${HOST}/page` }));
    const page = safeFetchMock.mock.calls.find(([u]) => !String(u).endsWith("/robots.txt"));
    const headers = new Headers((page?.[1] as RequestInit | undefined)?.headers);
    expect(headers.get("user-agent")).toBeNull();
  });
});

describe("negative: an answering homepage and page are unchanged, billed", () => {
  it("domain-contact-extract reads a homepage that answers", async () => {
    site(async () => status(200, "<html><body><p>hello@gone-403.test</p></body></html>", { "content-type": "text/html" }));
    const { output } = (await withAcquisitionMethod("customer_directed_fetch", () =>
      getDirectExecutor("domain-contact-extract")!({ domain: HOST }),
    )) as { output: Record<string, unknown> };
    expect(output.fetched_urls).toEqual([`https://${HOST}/`]);
  });

  it("og-image-check reads a page that answers", async () => {
    site(async () => status(200, "<html><head><title>t</title></head></html>", { "content-type": "text/html" }));
    const { output } = (await withAcquisitionMethod("customer_directed_fetch", () =>
      getDirectExecutor("og-image-check")!({ url: `https://${HOST}/page` }),
    )) as { output: Record<string, unknown> };
    expect(output.issues).toContain("Missing og:image meta tag");
  });

  it.each([
    ["meta-extract", (o: Record<string, unknown>) => expect(o.title).toBe("t")],
    ["link-extract", (o: Record<string, unknown>) => expect(o).toHaveProperty("links")],
    ["gdpr-website-check", (o: Record<string, unknown>) => expect(o).toHaveProperty("findings")],
  ] as const)("%s reads a page that answers", async (slug, check) => {
    site(async () =>
      status(200, '<html><head><title>t</title></head><body><a href="/about">About</a></body></html>', { "content-type": "text/html" }),
    );
    const { output } = (await withAcquisitionMethod("customer_directed_fetch", () =>
      getDirectExecutor(slug)!({ url: `https://${HOST}/page` }),
    )) as { output: Record<string, unknown> };
    check(output);
  });
});
