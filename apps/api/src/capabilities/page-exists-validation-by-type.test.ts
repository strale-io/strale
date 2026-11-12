/**
 * promise-audit T1 follow-up 35: page-exists recognised Strale's own URL
 * validation refusal by the word "restricted" in an error's message. A failure
 * that only happens to carry the word then skipped the target's handling: a
 * redirect loop names its starting URL, so a caller's page under /restricted/
 * that keeps redirecting was rethrown raw instead of being filed as the
 * caller's site (not retryable, not counted against page-exists or its
 * breaker). The refusal is now recognised by its type, UrlValidationError.
 *
 * safeFetch, the robots pre-check and undici's fetch contract stay real here;
 * only global fetch and the resolver are stubbed, so no request leaves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ resolve4: vi.fn(), resolve6: vi.fn() }));
vi.mock("dns/promises", () => ({ default: dns }));

import { getDirectExecutor } from "./index.js";
import "./page-exists.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import { withAcquisitionMethod } from "../lib/data-access.js";
import { outcomeFromError } from "../lib/execution-outcome.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { UrlValidationError } from "../lib/url-validator.js";

const run = (url: string) =>
  withAcquisitionMethod("customer_directed_fetch", () => getDirectExecutor("page-exists")!({ url }));

const caught = (p: Promise<unknown>) =>
  p.then(
    () => { throw new Error("expected page-exists to throw"); },
    (e: unknown) => e,
  );

beforeEach(() => {
  __resetRobotsCacheForTests();
  dns.resolve4.mockResolvedValue(["93.184.216.34"]);
  dns.resolve6.mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("page-exists recognises the validator's refusal by type, not by a word (follow-up 35)", () => {
  it("files a redirect loop under a /restricted/ path as the caller's site, not counted", async () => {
    const start = "https://site.test/restricted/page";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(null, { status: 302, headers: { location: start } });
    }));

    const err = await caught(run(start));

    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    const upstream = err as UpstreamUnavailableError;
    expect(upstream.message).toContain("URL did not answer (it kept redirecting).");
    expect(upstream.retryable).toBe(false);
    expect(outcomeFromError(upstream)).toMatchObject({
      billable: false,
      fault: "target",
      counts_against_capability: false,
    });
  });

  it("still fails a redirect into a restricted address as the validator's own refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    }));

    const err = await caught(run("https://site.test/page"));

    expect(err).toBeInstanceOf(UrlValidationError);
    expect((err as Error).message).toBe("This URL targets a restricted address.");
  });

  it("still fails a redirect to a scheme other than http(s) as the validator's own refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(null, { status: 302, headers: { location: "ftp://site.test/file" } });
    }));

    const err = await caught(run("https://site.test/page"));

    expect(err).toBeInstanceOf(UrlValidationError);
    expect((err as Error).message).toContain('URL scheme "ftp:" is not allowed');
  });
});
