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
  UpstreamUnavailableError,
} from "./upstream-result.js";
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

describe("tail: quotedLegCodes never quotes a 401 or 403", () => {
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

describe("tail2: a combined error built from quotedLegCodes reads the way its retryable flag says", () => {
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
