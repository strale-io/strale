/**
 * The shared helpers behind the swallowed-upstream-failure fixes
 * (archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md), and the
 * three consumers that must file their error correctly: the execution
 * outcome (billing), the failure taxonomy (whose fault) and the retry policy.
 */
import { describe, expect, it, vi } from "vitest";
import {
  dnsOrEmpty,
  dnsOrNull,
  dnsUnavailable,
  fetchUnavailable,
  httpUnavailable,
  isDnsNegative,
  quotedLegCodes,
  requireAnyLeg,
  ssrfBlocked,
  TARGET_NETWORK,
  targetUnavailable,
  UpstreamUnavailableError,
} from "./upstream-result.js";
import { foldTrafficRows, type FloorTrafficRow } from "../jobs/quality-floor.js";

import { outcomeFromError } from "./execution-outcome.js";
import { classifyTransactionFailure, countsAgainstCapability } from "./transaction-failure-taxonomy.js";
import { isUserInputError } from "./circuit-breaker.js";
import { categorizeFailureReason, isRetryableFailure } from "./trust-helpers.js";
import { withRetry } from "./retry.js";

/** A rejection shaped like node:dns/promises raises it. */
function dnsError(code: string, syscall = "queryMx", hostname = "example.com"): Error {
  return Object.assign(new Error(`${syscall} ${code} ${hostname}`), { code, syscall, hostname });
}

const TRANSIENT = ["ETIMEOUT", "ESERVFAIL", "EREFUSED", "ECONNREFUSED", "EAI_AGAIN", "ECANCELLED", "EBADRESP", "ESOMETHINGNEW"];

describe("isDnsNegative", () => {
  it.each(["ENOTFOUND", "ENODATA", "EBADNAME"])("treats %s as the answer", (code) => {
    expect(isDnsNegative(dnsError(code))).toBe(true);
  });
  it.each(TRANSIENT)("treats %s as no answer", (code) => {
    expect(isDnsNegative(dnsError(code))).toBe(false);
  });
  it("treats an error without a resolver code as no answer", () => {
    expect(isDnsNegative(new Error("boom"))).toBe(false);
    expect(isDnsNegative(null)).toBe(false);
  });
});

describe("dnsOrEmpty / dnsOrNull", () => {
  it("passes a successful answer through", async () => {
    await expect(dnsOrEmpty(async () => ["1.2.3.4"])).resolves.toEqual(["1.2.3.4"]);
    await expect(dnsOrNull(async () => ({ nsname: "ns" }))).resolves.toEqual({ nsname: "ns" });
  });

  it.each(["ENOTFOUND", "ENODATA"])("returns the empty answer for %s", async (code) => {
    await expect(dnsOrEmpty(() => Promise.reject(dnsError(code)))).resolves.toEqual([]);
    await expect(dnsOrNull(() => Promise.reject(dnsError(code)))).resolves.toBeNull();
  });

  it.each(TRANSIENT)("throws UpstreamUnavailableError for %s", async (code) => {
    const err = await dnsOrEmpty(() => Promise.reject(dnsError(code)), "DNS MX query").catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(err).toMatchObject({ upstream: "DNS MX query", code, retryable: true });
    expect(err.message).toContain(code);
    await expect(dnsOrNull(() => Promise.reject(dnsError(code)))).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("rethrows our own defect unchanged rather than blaming the resolver", async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'sort')");
    await expect(dnsOrEmpty(() => Promise.reject(bug))).rejects.toBe(bug);
    expect(dnsUnavailable(bug, "x")).toBe(bug);
  });
});

describe("requireAnyLeg", () => {
  const ok = <T>(value: T): PromiseSettledResult<T> => ({ status: "fulfilled", value });
  const bad = (reason: unknown): PromiseSettledResult<never> => ({ status: "rejected", reason });

  it("returns the answering legs when at least one answered", () => {
    expect(requireAnyLeg([ok(1), bad(dnsError("ETIMEOUT")), ok(3)], "legs")).toEqual([1, 3]);
  });

  it("throws when every leg failed, naming the codes and never the legs' messages", () => {
    const err = (() => {
      try {
        requireAnyLeg([bad(dnsError("ETIMEOUT")), bad(new Error("entity not found")), bad(dnsError("ETIMEOUT"))], "DNS blocklists");
      } catch (e) {
        return e as UpstreamUnavailableError;
      }
    })();
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(err!.message).toBe("Upstream unavailable: DNS blocklists: all 3 sources failed (ETIMEOUT, Error).");
    expect(err!.message).not.toContain("not found");
  });

  it("treats no legs as no outage", () => {
    expect(requireAnyLeg([], "legs")).toEqual([]);
  });
});

describe("UpstreamUnavailableError is filed as an unbilled, retryable provider failure", () => {
  const samples = [
    ...TRANSIENT.map((code) => dnsUnavailable(dnsError(code), "DNS MX query") as UpstreamUnavailableError),
    new UpstreamUnavailableError("Companies House search API", "HTTP 429; retry shortly.", { code: "HTTP 429" }),
    new UpstreamUnavailableError(
      "ESMA MiCA CASP register",
      "no copy of the register could be read (2026-11: HTTP 404; 2026-10: HTTP 503). This is not an answer about the entity; retry later.",
    ),
  ];

  it.each(samples.map((e) => [e.message, e] as const))("%s", (_msg, err) => {
    const outcome = outcomeFromError(err);
    expect(outcome).toMatchObject({
      success: false,
      billable: false,
      failure_class: "provider_unavailable",
      fault: "provider",
      retryable: err.retryable,
      counts_against_capability: true,
    });
    // Stored as transactions.error and classified by string later: it must
    // land on the provider side, never the caller's and never unattributed.
    const cls = classifyTransactionFailure(err.message);
    expect(["upstream", "timeout"]).toContain(cls);
    expect(countsAgainstCapability(cls)).toBe(true);
    // The breaker must count it too.
    expect(isUserInputError(err.message)).toBe(false);
  });

  it("carries a non-retryable verdict through to the outcome", () => {
    const err = new UpstreamUnavailableError("ESMA register", "every path answered HTTP 404.", { retryable: false });
    expect(outcomeFromError(err)).toMatchObject({ failure_class: "provider_unavailable", retryable: false, billable: false });
  });
});

describe("httpUnavailable / fetchUnavailable", () => {
  it.each([[429, true], [500, true], [503, true], [400, false], [403, false], [410, false]])(
    "HTTP %i is an upstream failure, retryable %s",
    (status, retryable) => {
      const err = httpUnavailable("Example API", status);
      expect(err).toBeInstanceOf(UpstreamUnavailableError);
      expect(err).toMatchObject({ code: `HTTP ${status}`, retryable });
      expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
    },
  );

  it.each([
    ["a timeout", new DOMException("The operation was aborted due to timeout", "TimeoutError"), "timeout", true],
    ["a network error", Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }), "ECONNRESET", true],
    // A reply that arrived but carries no answer: retrying asks the same question again.
    ["a body that did not parse", new SyntaxError("Unexpected token <"), "unparseable", false],
  ])("%s is an upstream failure", (_label, thrown, code, retryable) => {
    const err = fetchUnavailable("Example API", thrown);
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(err).toMatchObject({ code, retryable });
    expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
    expect(err.message).not.toMatch(/not found|invalid|missing|required/i);
  });

  it("returns Strale's own vendor-account state, refusals and our own defects unchanged", () => {
    const vendor = Object.assign(new Error("Vendor 'serper' is exhausted; the request was refused before spending or charging."), {
      name: "VendorUnavailableError",
    });
    const defect = new RangeError("boom");
    expect(fetchUnavailable("Example API", vendor)).toBe(vendor);
    expect(fetchUnavailable("Example API", defect)).toBe(defect);
    const already = httpUnavailable("Example API", 503);
    expect(fetchUnavailable("Other API", already)).toBe(already);
  });
});

describe("the breaker reads a helper error the way its retryable flag says", () => {
  // recordFailure classifies by message; a retryable error whose text reads as
  // auth_expired or endpoint_gone opens the breaker at once for 30 minutes.
  it.each([429, 500, 502, 503, 504, 520])("httpUnavailable %i is retryable for the breaker too", (code) => {
    const err = httpUnavailable("Example API", code);
    expect(err.retryable).toBe(true);
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  });

  it.each([
    ["a timeout", new DOMException("aborted", "TimeoutError")],
    ["a network error", Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })],
  ])("fetchUnavailable on %s is transient for the breaker", (_l, cause) => {
    expect(categorizeFailureReason(fetchUnavailable("Example API", cause).message)).toBe("transient");
  });

  it("quotedLegCodes quotes only the retryable legs when any leg is retryable", () => {
    const legs = [httpUnavailable("A", 503), httpUnavailable("B", 403)];
    expect(quotedLegCodes(legs)).toBe("HTTP 503");
    expect(quotedLegCodes([httpUnavailable("A", 410), httpUnavailable("B", 404)])).toBe("HTTP 410, HTTP 404");
  });
});

describe("tail: quotedLegCodes quotes no 401 or 403 when a leg is retryable", () => {
  // A retryable GitHub rate-limit leg carries code "HTTP 403"; quoted, it
  // would make the combined message read auth_expired (PR #1015 delta review).
  const rateLimited403 = () =>
    new UpstreamUnavailableError("GitHub REST API", "rate limited; retry shortly.", { code: "HTTP 403", retryable: true });

  it("a combined message from a retryable 403 leg and a 503 leg classifies transient", () => {
    const legs = [rateLimited403(), httpUnavailable("Other API", 503)];
    const combined = new UpstreamUnavailableError("GitHub REST API and Other API", `neither source answered (${quotedLegCodes(legs)}).`, {
      retryable: true,
    });
    expect(combined.message).not.toMatch(/\b40[13]\b/);
    expect(categorizeFailureReason(combined.message)).toBe("transient");
  });

  it("drops 401 and 403 whenever a leg is retryable", () => {
    expect(quotedLegCodes([rateLimited403()])).not.toMatch(/\b40[13]\b/);
    expect(quotedLegCodes([rateLimited403(), httpUnavailable("B", 401)])).not.toMatch(/\b40[13]\b/);
  });

  // tail2 (PR #1017 review): with no retryable leg the 401/403 is the truth,
  // and quoting it keeps the combined error non-retryable for the breaker.
  it("tail2: keeps 401 and 403 when no leg is retryable", () => {
    expect(quotedLegCodes([httpUnavailable("A", 401), httpUnavailable("B", 403)])).toBe("HTTP 401, HTTP 403");
    expect(quotedLegCodes([httpUnavailable("A", 403), httpUnavailable("B", 404)])).toBe("HTTP 403, HTTP 404");
  });
});

// Covers 401, 403, 404, 410 and retryable 5xx legs only: legs such as
// unparseable + unparseable or HTTP 400 + HTTP 400 classify `unknown`, which
// the breaker treats as retryable whatever the flag says.
describe("tail2: with 401, 403, 404, 410 or 5xx legs, a combined error from quotedLegCodes reads the way its retryable flag says", () => {
  const rateLimited403 = () =>
    new UpstreamUnavailableError("GitHub REST API", "rate limited; retry shortly.", { code: "HTTP 403", retryable: true });

  it.each([
    ["503 + 403", () => [httpUnavailable("A", 503), httpUnavailable("B", 403)]],
    ["rate-limited 403 + 404", () => [rateLimited403(), httpUnavailable("B", 404)]],
    ["rate-limited 403 alone", () => [rateLimited403()]],
    ["401 + 403", () => [httpUnavailable("A", 401), httpUnavailable("B", 403)]],
    ["403 alone", () => [httpUnavailable("A", 403)]],
    ["403 + 404", () => [httpUnavailable("A", 403), httpUnavailable("B", 404)]],
    ["410 + 404", () => [httpUnavailable("A", 410), httpUnavailable("B", 404)]],
  ])("%s", (_l, makeLegs) => {
    const legs = makeLegs();
    const retryable = legs.some((l) => l.retryable);
    const combined = new UpstreamUnavailableError("A and B", `neither source answered (${quotedLegCodes(legs)}).`, { retryable });
    expect(isRetryableFailure(categorizeFailureReason(combined.message))).toBe(retryable);
  });
});

describe("retry policy honours the executor's verdict", () => {
  it("retries a retryable UpstreamUnavailableError once", async () => {
    // ESERVFAIL matches none of the retry policy's string patterns, so only
    // the type check makes this retry happen.
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(dnsUnavailable(dnsError("ESERVFAIL"), "DNS MX query"))
      .mockResolvedValueOnce("answer");
    await expect(withRetry(fn, { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 })).resolves.toBe("answer");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable one", async () => {
    const err = new UpstreamUnavailableError("ESMA register", "every path answered HTTP 404.", { retryable: false });
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);
    await expect(withRetry(fn, { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("PR #1018 review B1: fetchUnavailable converts a bare errno Error", () => {
  /** The resolver's own Error, as safe-fetch's robots.txt pre-check rethrows it. */
  const errno = (code: string) =>
    Object.assign(new Error(`getaddrinfo ${code} site.test`), { code, syscall: "getaddrinfo", hostname: "site.test" });

  it.each(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH"])(
    "%s on the error itself is a retryable network error",
    (code) => {
      const err = fetchUnavailable("Example API", errno(code));
      expect(err).toBeInstanceOf(UpstreamUnavailableError);
      expect(err).toMatchObject({ code, retryable: true });
      expect(err.message).toBe(`Upstream unavailable: Example API: network error (${code}); retry shortly.`);
    },
  );

  it("leaves Strale's own SSRF refusal (ESSRFBLOCKED) and unknown codes unchanged", () => {
    const ssrf = Object.assign(new Error("This URL resolves to a restricted address."), { code: "ESSRFBLOCKED" });
    const other = Object.assign(new Error("something else"), { code: "ENOENT" });
    expect(fetchUnavailable("Example API", ssrf)).toBe(ssrf);
    expect(fetchUnavailable("Example API", other)).toBe(other);
  });

  it("targetUnavailable words an errno failure as the target's and keeps it breaker-exempt", () => {
    const err = targetUnavailable("website site.test", errno("ECONNREFUSED")) as UpstreamUnavailableError;
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(err.message).toBe("Upstream unavailable: website site.test: URL did not answer (ECONNREFUSED); retry later.");
    expect(err).toMatchObject({ code: "ECONNREFUSED", retryable: true, targetFault: true });
    expect(isUserInputError(err.message)).toBe(true);
  });
});

describe("promise-audit T1 follow-up 34: a failure that is not the site's is not filed as the site's", () => {
  // EAI_AGAIN (a resolver failing for now, most often Strale's own, #1025)
  // and a network error with no code do not say whose failure it was. Both
  // stay retryable and unbilled and count against the capability, under the
  // fixed label TARGET_NETWORK, never the caller's host name.
  const notTheSite: Array<[string, unknown, string | null, string]> = [
    [
      "Strale's resolver failing for now (EAI_AGAIN, bare errno)",
      Object.assign(new Error("getaddrinfo EAI_AGAIN site.test"), { code: "EAI_AGAIN", syscall: "getaddrinfo" }),
      "EAI_AGAIN",
      "Upstream unavailable: the network path to the requested site: network error (EAI_AGAIN); retry shortly.",
    ],
    [
      "Strale's resolver failing for now (EAI_AGAIN, wrapped by fetch)",
      Object.assign(new TypeError("fetch failed"), { cause: { code: "EAI_AGAIN" } }),
      "EAI_AGAIN",
      "Upstream unavailable: the network path to the requested site: network error (EAI_AGAIN); retry shortly.",
    ],
    [
      "a network error with no code",
      Object.assign(new TypeError("fetch failed"), { cause: {} }),
      null,
      "Upstream unavailable: the network path to the requested site: network error; retry shortly.",
    ],
    [
      "a stream cut off with no code",
      new TypeError("terminated"),
      null,
      "Upstream unavailable: the network path to the requested site: network error; retry shortly.",
    ],
  ];

  it.each(notTheSite)("targetUnavailable(%s) is fault provider, counts true, retryable", (_label, failure, code, message) => {
    const err = targetUnavailable("website site.test", failure) as UpstreamUnavailableError;
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect(err.message).toBe(message);
    expect(err).toMatchObject({ code, retryable: true, targetFault: false, upstream: TARGET_NETWORK });
    expect(isUserInputError(err.message)).toBe(false);
    expect(outcomeFromError(err)).toMatchObject({
      success: false,
      billable: false,
      fault: "provider",
      counts_against_capability: true,
    });
  });

  // Independent review of follow-up 34: a counted failure's message reaches
  // the breaker, which categorises it by substring before it looks for
  // "network error". A caller's host name containing "403", "gone" or "301"
  // in that message would read as auth_expired, endpoint_gone or
  // permanent_move, not retryable, and suspend the capability for everyone.
  it.each([
    ["website x403.example", "x403.example"],
    ["host gone.example", "gone.example"],
    ["https://moved301.example/", "moved301.example"],
    ["website unauthorized-404.example", "unauthorized-404.example"],
  ])("a counted failure for %s names no host, so the breaker reads it as transient", (site, host) => {
    for (const failure of [
      Object.assign(new Error(`getaddrinfo EAI_AGAIN ${host}`), { code: "EAI_AGAIN", syscall: "getaddrinfo" }),
      Object.assign(new TypeError("fetch failed"), { cause: { code: "EAI_AGAIN" } }),
      Object.assign(new TypeError("fetch failed"), { cause: {} }),
      new TypeError("terminated"),
    ]) {
      const err = targetUnavailable(site, failure) as UpstreamUnavailableError;
      expect(outcomeFromError(err)).toMatchObject({ counts_against_capability: true });
      expect(err.message).not.toContain(host);
      expect(categorizeFailureReason(err.message)).toBe("transient");
      expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
    }
  });

  it("an UpstreamUnavailableError passed in is not relabelled", () => {
    const given = new UpstreamUnavailableError("website site.test", "network error; retry shortly.");
    const err = targetUnavailable("website site.test", given) as UpstreamUnavailableError;
    expect(err.upstream).not.toBe(TARGET_NETWORK);
    expect(err.targetFault).toBe(true);
    expect(err.message).toContain("URL did not answer");
  });

  it("a host that does not resolve (ENOTFOUND) is still the site's", () => {
    const err = targetUnavailable(
      "website site.test",
      Object.assign(new Error("getaddrinfo ENOTFOUND site.test"), { code: "ENOTFOUND" }),
    ) as UpstreamUnavailableError;
    expect(err).toMatchObject({ code: "ENOTFOUND", retryable: false, targetFault: true });
    expect(outcomeFromError(err)).toMatchObject({ fault: "target", counts_against_capability: false });
  });
});

describe("PR #1018 review S1: a target-site failure is unbilled and does not count against the capability", () => {
  const targetFailures: Array<[string, unknown]> = [
    ["a 5xx", 503],
    ["a timeout", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
    ["a network error", Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })],
    ["a connection errno", Object.assign(new Error("connect ECONNREFUSED 192.0.2.1:443"), { code: "ECONNREFUSED" })],
    ["a redirect loop", new Error("Too many redirects (>3) — refusing to follow further.")],
    ["a body that did not parse", new SyntaxError("Unexpected token <")],
  ];

  it.each(targetFailures)("targetUnavailable(%s) is fault target, counts false", (_label, failure) => {
    const err = targetUnavailable("website site.test", failure);
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect((err as UpstreamUnavailableError).targetFault).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({
      success: false,
      billable: false,
      failure_class: "provider_unavailable",
      fault: "target",
      counts_against_capability: false,
    });
    // Breaker-exempt by wording, as before.
    expect(isUserInputError(err.message)).toBe(true);
  });

  it("a provider failure without the marker still counts", () => {
    const err = httpUnavailable("Example API", 503);
    expect((err as UpstreamUnavailableError).targetFault).toBe(false);
    expect(outcomeFromError(err)).toMatchObject({ fault: "provider", counts_against_capability: true });
  });

  it("the quality floor leaves target failures out of the denominator and counts provider failures", () => {
    const row = (success: boolean, counts: boolean | null, n: number): FloorTrafficRow => ({
      slug: "cookie-scan",
      lifecycle_state: "active",
      visible: true,
      x402_enabled: true,
      source: "fact",
      status: null,
      error: null,
      success,
      counts,
      day: "2026-11-10",
      recent: true,
      n,
    });
    const targetCounts = outcomeFromError(targetUnavailable("website site.test", 503)).counts_against_capability;
    const providerCounts = outcomeFromError(httpUnavailable("Example API", 503)).counts_against_capability;

    const [target] = foldTrafficRows([row(true, null, 3), row(false, targetCounts, 12)], new Map());
    expect(target).toMatchObject({ eligibleCalls: 3, completedCalls: 3, distinctFailureDays: 0 });

    const [provider] = foldTrafficRows([row(true, null, 3), row(false, providerCounts, 12)], new Map());
    expect(provider).toMatchObject({ eligibleCalls: 15, completedCalls: 3, distinctFailureDays: 1 });
  });
});

describe("PR #1018 review round 2 nits", () => {
  const ssrf = () => Object.assign(new Error("Resolved host targets a restricted address."), { code: "ESSRFBLOCKED" });
  const wrapped = (cause: unknown) => Object.assign(new TypeError("fetch failed"), { cause });

  it("ssrfBlocked finds the SSRF refusal bare or on undici's cause, and nothing else", () => {
    const bare = ssrf();
    const onCause = ssrf();
    expect(ssrfBlocked(bare)).toBe(bare);
    expect(ssrfBlocked(wrapped(onCause))).toBe(onCause);
    expect(ssrfBlocked(wrapped({ code: "ECONNRESET" }))).toBeNull();
    expect(ssrfBlocked(new Error("plain"))).toBeNull();
    expect(ssrfBlocked(null)).toBeNull();
  });

  it("fetchUnavailable returns an SSRF refusal on the cause as itself, never as 'retry shortly'", () => {
    const cause = ssrf();
    const err = fetchUnavailable("Example API", wrapped(cause));
    expect(err).toBe(cause);
    expect(err.message).not.toMatch(/retry/i);
  });

  it("targetUnavailable returns an SSRF refusal on the cause as itself", () => {
    const cause = ssrf();
    expect(targetUnavailable("website site.test", wrapped(cause))).toBe(cause);
  });

  it("targetUnavailable files an unresolvable host as not retryable, still the target's fault", () => {
    const resolver = Object.assign(new Error("getaddrinfo ENOTFOUND gone.test"), { code: "ENOTFOUND", hostname: "gone.test" });
    for (const failure of [resolver, wrapped(resolver)]) {
      const err = targetUnavailable("website site.test", failure) as UpstreamUnavailableError;
      expect(err).toBeInstanceOf(UpstreamUnavailableError);
      expect(err.message).toBe("Upstream unavailable: website site.test: URL did not answer (ENOTFOUND): its host name does not resolve.");
      expect(err).toMatchObject({ code: "ENOTFOUND", retryable: false, targetFault: true });
      expect(isUserInputError(err.message)).toBe(true);
      expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "target", counts_against_capability: false });
    }
  });

  it("targetUnavailable words HTTP 408 as the site timing out, retryable and breaker-exempt", () => {
    const err = targetUnavailable("website site.test", 408) as UpstreamUnavailableError;
    expect(err.message).toBe("Upstream unavailable: website site.test: URL returned HTTP 408, the site timed out the request; retry later.");
    expect(err).toMatchObject({ code: "HTTP 408", retryable: true, targetFault: true });
    expect(isUserInputError(err.message)).toBe(true);
    expect(targetUnavailable("website site.test", 503).message).toContain("a server error on the site itself");
  });

  // promise-audit T1 follow-up 39: every non-block status from the caller's
  // site is the target's, so domain-contact-extract's homepage and
  // og-image-check's own page can pass any status they cannot read.
  it.each([400, 404, 410])("targetUnavailable files HTTP %i as the target's answer, not retryable", (status) => {
    const err = targetUnavailable("website gone-403.test", status) as UpstreamUnavailableError;
    expect(err.message).toBe(
      `Upstream unavailable: website gone-403.test: URL returned HTTP ${status}, a client error status, so there was no page to read.`,
    );
    expect(err).toMatchObject({ code: `HTTP ${status}`, retryable: false, targetFault: true });
    expect(err.message).not.toMatch(/not found|invalid|missing|required/i);
    expect(isUserInputError(err.message)).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "target", counts_against_capability: false });
  });

  it.each([301, 308, 304])("targetUnavailable files an unfollowed HTTP %i as the target's, with the status on code only", (status) => {
    const err = targetUnavailable("website gone-403.test", status) as UpstreamUnavailableError;
    expect(err.message).not.toContain(String(status));
    expect(err).toMatchObject({ code: `HTTP ${status}`, retryable: false, targetFault: true });
    expect(isUserInputError(err.message)).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "target", counts_against_capability: false });
  });
});
